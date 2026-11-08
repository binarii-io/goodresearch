import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeUsabilityFactCommands } from '../application/commands/usability-fact-commands.ts'
import { makeSynthesisReads } from '../application/queries/synthesis-reads.ts'
import {
  evidenceLine,
  type ObservationFactInput,
  observationFact,
} from '../domain/usability-facts.ts'
import { createMemoryUsabilityFactStore } from '../infrastructure/usability-facts.drizzle-store.ts'
import { inMemoryEvidenceStore } from './fakes/in-memory-evidence.ts'
import { inMemorySurveyFacts } from './fakes/in-memory-survey-facts.ts'

const NOW = new Date('2026-11-08T10:00:00Z')
let n = 0
const newId = () => `uf${++n}`

const input = (over: Partial<ObservationFactInput> = {}): ObservationFactInput => ({
  accountId: 'alice',
  observationId: 'o1',
  studyId: 'st',
  sessionId: 's1',
  statement: 'The export button is hard to find',
  language: 'en',
  polarity: 'negative',
  theme: { id: 'task-1', title: 'Export the report' },
  quote: 'where is the export',
  momentMs: 83_400,
  screenshotKey: 'usability/st/s1/a/o1.jpg',
  participant: 'P01',
  origin: 'ai',
  ...over,
})

describe('usability facts (spec 038 FR-022)', () => {
  it('makes an accepted fact in the language written, the other one to translate', () => {
    const made = observationFact(input(), null, [], NOW, newId)
    expect(made).toMatchObject({
      ok: true,
      value: {
        translate: true,
        fact: {
          statement: { en: 'The export button is hard to find', fr: '' },
          translation: 'translating',
          status: 'accepted',
          theme: { id: 'task-1' },
          support: { quote: 'where is the export', momentMs: 83_400, participant: 'P01' },
          version: 1,
        },
      },
    })
  })

  it('is edited when a person wrote it, keeps its id and translation when unchanged', () => {
    const first = observationFact(input(), null, [], NOW, newId)
    if (!first.ok) throw new Error('fixture')
    const done = {
      ...first.value.fact,
      statement: { ...first.value.fact.statement, fr: 'x' },
      translation: 'done' as const,
    }
    const again = observationFact(
      input({ origin: 'person', polarity: 'neutral' }),
      done,
      [],
      NOW,
      newId,
    )
    expect(again).toMatchObject({
      ok: true,
      value: {
        translate: false,
        fact: { id: done.id, status: 'edited', statement: { fr: 'x' }, version: 2 },
      },
    })
  })

  it('refuses an empty statement or one holding a known name', () => {
    expect(observationFact(input({ statement: '  ' }), null, [], NOW, newId)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(
      observationFact(
        input({ statement: 'Casey cannot find export' }),
        null,
        ['Casey Test'],
        NOW,
        newId,
      ),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })

  it('shows its quote as evidence, else the moment it was seen', () => {
    const made = observationFact(input({ quote: null }), null, [], NOW, newId)
    if (!made.ok) throw new Error('fixture')
    expect(evidenceLine(made.value.fact)).toBe('Seen at 1:23')
  })
})

describe('usability fact commands and Synthesis reads (spec 038)', () => {
  const world = () => {
    const store = createMemoryUsabilityFactStore()
    const jobs: unknown[] = []
    const translated: string[] = []
    const commands = makeUsabilityFactCommands({
      store,
      knownNames: async () => [],
      translate: async (_a, ref, t) => {
        translated.push(ref)
        return `fr: ${t.text}`
      },
      enqueueTranslation: async (job) => {
        jobs.push(job)
        return true
      },
      clock: fixedClock(NOW),
      newId,
      log: { warn: () => undefined },
    })
    const reads = makeSynthesisReads(
      inMemoryEvidenceStore().store,
      inMemorySurveyFacts().store,
      store,
    )
    return { store, jobs, translated, commands, reads }
  }

  it('upserts, translates under the session analysis ref, and withdraws', async () => {
    const w = world()
    const upserted = await w.commands.upsert(input())
    if (!upserted.ok) throw new Error(upserted.error)
    const { factId } = upserted.value
    expect(w.jobs).toMatchObject([{ factId, from: 'en', usability: true }])
    await w.commands.translateJob(w.jobs[0] as never)
    expect(w.translated).toEqual(['usability-analysis:s1'])
    expect((await w.store.get(factId))?.statement.fr).toBe('fr: The export button is hard to find')
    const [read] = await w.reads.projectFacts(['st'])
    expect(read).toMatchObject({
      id: factId,
      source: 'usability',
      sessionId: 's1',
      participants: ['P01'],
    })
    expect(await w.reads.verbatimsOf([factId])).toEqual([
      { factId, studyId: 'st', participant: 'P01', text: 'where is the export' },
    ])
    await w.commands.withdraw('o1')
    expect(await w.reads.projectFacts(['st'])).toEqual([])
  })
})
