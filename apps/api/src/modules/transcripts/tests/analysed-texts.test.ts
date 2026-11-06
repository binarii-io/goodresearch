import { describe, expect, it } from 'vitest'
import { makeAnalysedText } from '../application/analysed-text.ts'
import { makeCleaningCommands } from '../application/commands/cleaning-commands.ts'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import type { CleaningDeps } from '../application/ports.ts'
import { isCleaningLive } from '../domain/correction-run.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import {
  createInMemoryCleaning,
  fakeCleanFiles,
  fakeCleaningAi,
  fakeCleaningNames,
} from './fakes/in-memory-cleaning.ts'
import { fakeSources, NOW, testDeps } from './fakes/in-memory-transcripts.ts'

const ACTOR = { id: 'p1', role: 'member' as const }

const TEXT =
  'Lee: Hello Sam Example, welcome.\nSam Example: We use Gooresearch for the eating today.\nLee: And NPS?\nSam Example: The MPS went up.'

const term = (over: Partial<LexiconTerm>): LexiconTerm => ({
  id: 't1',
  teamId: 'team-1',
  language: 'en',
  form: 'Goodresearch',
  kind: 'domain',
  correction: null,
  category: 'product',
  definition: 'The research app.',
  scope: 'global',
  scopeDecided: true,
  status: 'accepted',
  mergedInto: null,
  origin: 'ai',
  quote: null,
  variants: [{ spelling: 'Gooresearch', status: 'accepted', origin: 'ai' }],
  decidedBy: 'p1',
  decidedAt: NOW,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

/** Counts every call to an object's methods. */
const counted = <T extends object>(target: T, calls: { n: number }): T =>
  new Proxy(target, {
    get: (object, key) => {
      const value = Reflect.get(object, key)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        calls.n++
        return value.apply(object, args)
      }
    },
  })

/** A study of `count` interviews, cleaned by the AI once (stored corrections and suggestions). */
const setup = async (count: number, anonymised: boolean) => {
  const sessions = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    title: `Interview ${i}`,
    interviewDate: '2026-10-20',
    language: 'en' as const,
    transcript: {
      fileId: `f-${i}`,
      name: `${i}.txt`,
      mimeType: 'text/plain',
      modifiedAt: '2026-10-20T10:00:00Z',
    },
    text: TEXT,
  }))
  const sources = fakeSources({ sessions, names: ['Sam Example', 'Lee'] })
  const t = testDeps({ sources: sources.sources })
  const memory = createInMemoryCleaning()
  const names = fakeCleaningNames([
    { name: 'Sam Example', role: 'interviewee', code: 'P01' },
    { name: 'Lee', role: 'interviewer', code: 'I01' },
  ])
  const deps: CleaningDeps = {
    ...t.deps,
    studies: {
      getStudyAccess: async () => ({
        role: 'member',
        type: 'interviews',
        teamId: 'team-1',
        anonymised,
      }),
    },
    otherRunLive: async (studyId) =>
      isCleaningLive(await memory.store.openCleaningRun(studyId), NOW),
    reviewLive: async () => false,
    cleaning: memory.store,
    cleaningAi: fakeCleaningAi().ai,
    cleaningNames: names.names,
    cleanFiles: fakeCleanFiles().port,
    enqueueCleaning: async () => true,
  }
  for (const x of [
    term({}),
    term({
      id: 't2',
      form: 'NPS',
      scope: 'case-by-case',
      variants: [{ spelling: 'MPS', status: 'accepted', origin: 'ai' }],
    }),
  ])
    t.memory.terms.set(x.id, x)
  const lexicon = makeLexiconCommands(deps)
  const cleaning = makeCleaningCommands(deps, lexicon)
  const started = await cleaning.startCleaning(ACTOR, 'study', {
    mode: 'ai',
    all: true,
    consent: true,
  })
  if (!started.ok) throw new Error(started.error)
  await cleaning.runCleaningJob({ runId: started.value.runId, studyId: 'study', all: true })
  // One interview has a validated clean version, one has no transcript.
  const first = t.memory.transcripts.get('s0')
  if (first)
    await memory.store.addVersion({
      sessionId: 's0',
      segments: first.segments.map((s) => ({ ...s, text: `${s.text} (clean)` })),
      rawImportedAt: first.importedAt,
      anonymised,
      fingerprint: 'f',
      createdBy: 'p1',
      createdAt: NOW,
    } as never)
  t.memory.transcripts.delete(`s${count - 1}`)

  const calls = { n: 0 }
  const meteredDeps: CleaningDeps = {
    ...deps,
    store: counted(deps.store, calls),
    cleaning: counted(deps.cleaning, calls),
    studies: counted(deps.studies, calls),
    cleaningNames: (...args) => {
      calls.n++
      return deps.cleaningNames(...args)
    },
  }
  const texts = makeAnalysedText(
    meteredDeps,
    { importTranscript: lexicon.importTranscript, liveRun: lexicon.liveRun },
    async () => false,
  )
  return { texts, calls, ids: sessions.map((s) => s.id) }
}

describe('analysed texts of a whole study (spec 032)', () => {
  for (const anonymised of [false, true])
    for (const mode of ['with-corrections', 'clean-only'] as const)
      it(`equal the texts read one by one (${anonymised ? 'anonymised' : 'named'}, ${mode})`, async () => {
        const s = await setup(4, anonymised)
        const together = await s.texts.analysedTexts('p1', 'study', s.ids, mode)
        for (const id of s.ids)
          expect(together.get(id)).toEqual(await s.texts.analysedText('p1', 'study', id, mode))
      })

  it('reads the study the same number of times for 3 or 30 interviews', async () => {
    const reads = async (count: number) => {
      const s = await setup(count, true)
      s.calls.n = 0
      await s.texts.analysedTexts('p1', 'study', s.ids, 'with-corrections')
      return s.calls.n
    }
    expect(await reads(30)).toBe(await reads(3))
  })
})
