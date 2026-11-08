import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeUsabilityFactCommands } from '../application/commands/usability-fact-commands.ts'
import { makeSynthesisReads } from '../application/queries/synthesis-reads.ts'
import { decideFact, type Fact } from '../domain/facts.ts'
import {
  decideTaskFact,
  evidenceLine,
  type ObservationFactInput,
  observationFact,
  type TaskFactInput,
  taskFact,
  taskPolarity,
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
  status: 'accepted',
  decidedBy: 'alice',
  decidedAt: NOW,
  ...over,
})

describe('usability facts (spec 038 FR-022)', () => {
  it('makes an accepted fact in the language written, the other one to translate', () => {
    const made = observationFact(input(), null, [], newId)
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
    const first = observationFact(input(), null, [], newId)
    if (!first.ok) throw new Error('fixture')
    const done = {
      ...first.value.fact,
      statement: { ...first.value.fact.statement, fr: 'x' },
      translation: 'done' as const,
    }
    const again = observationFact(
      input({ origin: 'person', polarity: 'neutral', status: 'edited' }),
      done,
      [],
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
    expect(observationFact(input({ statement: '  ' }), null, [], newId)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(
      observationFact(
        input({ statement: 'Casey cannot find export' }),
        null,
        ['Casey Test'],
        newId,
      ),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })

  it('shows its quote as evidence, else the moment it was seen', () => {
    const made = observationFact(input({ quote: null }), null, [], newId)
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

  it('writes nothing when a sync gives the same observation again (spec 039)', async () => {
    const w = world()
    const first = await w.commands.upsert(input())
    if (!first.ok) throw new Error(first.error)
    await w.commands.upsert(input())
    expect((await w.store.get(first.value.factId))?.version).toBe(1)
    expect(w.jobs).toHaveLength(1)
  })

  it('upserts, translates under the session analysis ref, and removes', async () => {
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
    await w.commands.remove('o1')
    expect(await w.reads.projectFacts(['st'])).toEqual([])
  })
})

describe('one fact lifecycle (spec 039)', () => {
  it('gives an observation fact the observation status, to decide included', () => {
    const made = observationFact(
      input({ status: 'proposed', decidedBy: null, decidedAt: null }),
      null,
      [],
      newId,
    )
    expect(made).toMatchObject({
      ok: true,
      value: { fact: { status: 'proposed', decidedBy: null, sessionId: 's1' } },
    })
  })

  const task = (outcomes: TaskFactInput['outcomes']): TaskFactInput => ({
    studyId: 'st',
    task: { id: 'task-2', index: 2, instruction: 'Export the report' },
    outcomes,
  })

  it('writes a task fact from the decided outcomes, in both languages, to decide', () => {
    const fact = taskFact(
      task({ success: 1, partial: 1, failure: 3, notAttempted: 0 }),
      null,
      newId,
    )
    expect(fact).toMatchObject({
      sessionId: null,
      status: 'proposed',
      polarity: 'negative',
      theme: { id: 'task-2', title: 'Export the report' },
      translation: 'done',
      support: { kind: 'task', sessions: 5, figuresChanged: false },
      statement: {
        en: 'Task 2 — Export the report: 1 success, 1 partial success, 3 failures out of 5 sessions.',
        fr: 'Tâche 2 — Export the report : 1 réussite, 1 réussite partielle, 3 échecs sur 5 séances.',
      },
    })
  })

  it('sets the polarity of a task from its outcomes', () => {
    expect(taskPolarity({ success: 4, partial: 1, failure: 0, notAttempted: 0 })).toBe('positive')
    expect(taskPolarity({ success: 2, partial: 0, failure: 1, notAttempted: 1 })).toBe('negative')
    expect(taskPolarity({ success: 3, partial: 2, failure: 0, notAttempted: 0 })).toBe('neutral')
  })

  it('sends a decided task fact back to decide when its counts change, said', () => {
    const first = taskFact(
      task({ success: 2, partial: 0, failure: 0, notAttempted: 0 }),
      null,
      newId,
    )
    if (!first) throw new Error('fixture')
    const accepted = decideTaskFact(first, { decision: 'accept', version: 1 }, 'bob', NOW, [])
    if (!accepted.ok) throw new Error(accepted.error)
    // Same counts: nothing to write.
    expect(
      taskFact(
        task({ success: 2, partial: 0, failure: 0, notAttempted: 0 }),
        accepted.value,
        newId,
      ),
    ).toBeNull()
    const changed = taskFact(
      task({ success: 2, partial: 0, failure: 1, notAttempted: 0 }),
      accepted.value,
      newId,
    )
    expect(changed).toMatchObject({
      id: first.id,
      status: 'proposed',
      decidedBy: null,
      version: 3,
      support: { sessions: 3, figuresChanged: true },
    })
    if (!changed) throw new Error('fixture')
    // Its next decision clears "figures changed".
    const again = decideTaskFact(changed, { decision: 'accept', version: 3 }, 'bob', NOW, [])
    expect(again).toMatchObject({
      ok: true,
      value: { status: 'accepted', support: { figuresChanged: false } },
    })
  })

  it('edits, rejects and reopens a task fact at the version seen', () => {
    const fact = taskFact(
      task({ success: 1, partial: 0, failure: 0, notAttempted: 0 }),
      null,
      newId,
    )
    if (!fact) throw new Error('fixture')
    expect(decideTaskFact(fact, { decision: 'accept', version: 9 }, 'bob', NOW, [])).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    expect(decideTaskFact(fact, { decision: 'reopen', version: 1 }, 'bob', NOW, [])).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    })
    const edited = decideTaskFact(
      fact,
      { decision: 'edit', version: 1, statement: { en: 'Everyone exports easily' } },
      'bob',
      NOW,
      [],
    )
    expect(edited).toMatchObject({
      ok: true,
      value: { status: 'edited', origin: 'person', translation: 'translating' },
    })
    if (!edited.ok) throw new Error(edited.error)
    const reopened = decideTaskFact(
      edited.value,
      { decision: 'reopen', version: 2 },
      'bob',
      NOW,
      [],
    )
    expect(reopened).toMatchObject({
      ok: true,
      value: { status: 'proposed', decidedBy: null, statement: { en: 'Everyone exports easily' } },
    })
  })

  it('reopens an interview fact once decided', () => {
    const fact: Fact = {
      id: 'f1',
      sessionId: 's1',
      studyId: 'st',
      statement: { en: 'Exports are hard', fr: 'Les exports sont difficiles' },
      translation: 'done',
      polarity: 'negative',
      theme: { id: 't', title: 'Export' },
      verbatimIds: ['v1'],
      origin: 'ai',
      status: 'accepted',
      runId: null,
      decidedBy: 'bob',
      decidedAt: NOW,
      version: 2,
    }
    expect(decideFact(fact, { decision: 'reopen', version: 2 }, 'bob', NOW, [])).toMatchObject({
      ok: true,
      value: { status: 'proposed', decidedBy: null, decidedAt: null, version: 3 },
    })
  })
})
