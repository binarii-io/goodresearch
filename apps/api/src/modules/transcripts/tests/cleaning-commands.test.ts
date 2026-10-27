import { describe, expect, it } from 'vitest'
import { makeCleaningCommands } from '../application/commands/cleaning-commands.ts'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import type { CleaningDeps, SourceSession } from '../application/ports.ts'
import { makeCleaningQueries } from '../application/queries/cleaning-queries.ts'
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

const session = (id: string, text: string, modifiedAt = '2026-10-20T10:00:00Z') => ({
  id,
  title: `Interview ${id}`,
  interviewDate: '2026-10-20',
  language: 'en' as const,
  transcript: { fileId: `f-${id}`, name: `${id}.txt`, mimeType: 'text/plain', modifiedAt },
  text,
})

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

const setup = (
  options: {
    sessions?: (SourceSession & { text?: string })[]
    anonymised?: boolean
    ai?: ReturnType<typeof fakeCleaningAi>
  } = {},
) => {
  const sessions = options.sessions ?? [session('a', TEXT)]
  const sources = fakeSources({ sessions: [...sessions], names: ['Sam Example', 'Lee'] })
  const t = testDeps({ sources: sources.sources })
  const anonymised = { value: options.anonymised ?? false }
  t.deps = {
    ...t.deps,
    studies: {
      getStudyAccess: async () => ({
        role: 'member',
        type: 'interviews',
        teamId: 'team-1',
        anonymised: anonymised.value,
      }),
    },
  }
  const memory = createInMemoryCleaning()
  const names = fakeCleaningNames([
    { name: 'Sam Example', role: 'interviewee', code: 'P01' },
    { name: 'Lee', role: 'interviewer', code: 'I01' },
  ])
  const ai = options.ai ?? fakeCleaningAi()
  const files = fakeCleanFiles()
  const jobs: { runId: string; studyId: string; all: boolean }[] = []
  const deps: CleaningDeps = {
    ...t.deps,
    otherRunLive: async (studyId) =>
      isCleaningLive(await memory.store.openCleaningRun(studyId), NOW),
    cleaning: memory.store,
    cleaningAi: ai.ai,
    cleaningNames: names.names,
    cleanFiles: files.port,
    enqueueCleaning: async (job) => {
      jobs.push(job)
      return true
    },
  }
  for (const x of [
    term({}),
    term({
      id: 't2',
      form: 'NPS',
      scope: 'case-by-case',
      definition: 'Net Promoter Score.',
      variants: [{ spelling: 'MPS', status: 'accepted', origin: 'ai' }],
    }),
  ])
    t.memory.terms.set(x.id, x)
  const lexicon = makeLexiconCommands(deps)
  const cleaning = makeCleaningCommands(deps, lexicon)
  const queries = makeCleaningQueries(deps)
  const run = async (mode: 'lexicon' | 'ai', all = false) => {
    const started = await cleaning.startCleaning(ACTOR, 'study', { mode, all, consent: true })
    if (!started.ok) throw new Error(started.error)
    await cleaning.runCleaningJob({ runId: started.value.runId, studyId: 'study', all })
    return started.value.runId
  }
  const review = async (sessionId = 'a') => {
    const r = await queries.interviewCleaning('p1', 'study', sessionId, {
      status: 'all',
      onlyCorrected: false,
    })
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
  return {
    ...t,
    deps,
    clean: memory,
    names,
    ai,
    files,
    jobs,
    lexicon,
    cleaning,
    queries,
    run,
    review,
    anonymised,
    sources,
  }
}

const all = (r: Awaited<ReturnType<ReturnType<typeof setup>['review']>>) =>
  r.turns.flatMap((t) => t.corrections)

describe('cleaning with the lexicon only (US1, FR-003)', () => {
  it('corrects the global terms with no AI call and no consent', async () => {
    const s = setup()
    await s.run('lexicon')
    const found = all(await s.review())
    expect(found.map((c) => [c.original, c.replacement, c.source, c.status])).toEqual([
      ['Gooresearch', 'Goodresearch', 'lexicon', 'accepted'],
    ])
    expect(s.ai.requests).toEqual([])
    const list = await s.queries.cleaningList('p1', 'study')
    expect(list.ok && list.value.interviews[0]?.state).toBe('to-decide')
    expect(list.ok && list.value.lastRunCost).toBe(0)
  })
})

describe('cleaning with the AI (US1, FR-004–FR-007)', () => {
  it('asks a cleaning consent of its own', async () => {
    const s = setup()
    expect(
      await s.cleaning.startCleaning(ACTOR, 'study', { mode: 'ai', all: false, consent: false }),
    ).toEqual({
      ok: false,
      error: 'CLEANING_CONSENT_REQUIRED',
    })
  })

  it('proposes checked corrections, decides case-by-case places, and sends no known name', async () => {
    const s = setup()
    const runId = await s.run('ai')
    const found = all(await s.review())
    expect(found.map((c) => [c.original, c.replacement, c.source, c.status])).toEqual([
      ['Gooresearch', 'Goodresearch', 'lexicon', 'accepted'],
      ['eating', 'meeting', 'ai-other', 'proposed'],
      ['MPS', 'NPS', 'ai-lexicon', 'proposed'],
    ])
    expect(s.ai.refs).toEqual([`cleaning:${runId}:a`])
    // What the prompt is made of (the turns' own fields stay in the app).
    const sent = JSON.stringify(
      s.ai.requests.map((r) => ({
        turns: r.chunk.turns.map((x) => [x.sent, x.speakerSent]),
        places: r.chunk.occurrences.map((o) => [o.spelling, o.form]),
        terms: r.terms,
        speakers: r.speakers,
      })),
    )
    expect(sent).not.toMatch(/Sam|Lee/)
    expect(sent).toContain('Goodresearch')
    const runs = await s.clean.store.cleaningRunsOf('study')
    expect(runs[0]?.leftOut).toBe(2)
    expect(runs[0]?.sessions[0]).toMatchObject({ state: 'done', chunks: 1, chunksDone: 1 })
  })

  it('asks a failing chunk once more, then fails only that interview', async () => {
    const once = setup({ ai: fakeCleaningAi({ fail: 'once' }) })
    await once.run('ai')
    expect((await once.clean.store.cleaningRunsOf('study'))[0]?.sessions[0]?.state).toBe('done')
    const failing = setup({ ai: fakeCleaningAi({ fail: 'failed' }) })
    await failing.run('ai')
    expect((await failing.clean.store.cleaningRunsOf('study'))[0]?.sessions[0]).toMatchObject({
      state: 'failed',
      failure: 'AI_FAILED',
    })
  })
})

describe('review (US2, FR-009–FR-011)', () => {
  it('writes the verdict of a lexicon correction, and the reverse', async () => {
    const s = setup()
    await s.run('ai')
    const [lex, , nps] = all(await s.review())
    if (!lex || !nps) throw new Error('missing')
    expect(
      (await s.cleaning.decideCorrection(ACTOR, 'study', 'a', lex.key, { decision: 'reject' })).ok,
    ).toBe(true)
    expect([...s.memory.verdicts.values()].map((v) => [v.termId, v.verdict])).toEqual([
      ['t1', 'no'],
    ])
    expect(
      await s.cleaning.decideCorrection(ACTOR, 'study', 'a', nps.key, {
        decision: 'edit',
        replacement: 'x',
      }),
    ).toEqual({
      ok: false,
      error: 'EDIT_NOT_ALLOWED',
    })
    await s.cleaning.decideCorrection(ACTOR, 'study', 'a', nps.key, { decision: 'accept' })
    const after = all(await s.review())
    expect(after.find((c) => c.key === lex.key)?.status).toBe('rejected')
    expect(after.find((c) => c.key === nps.key)).toMatchObject({
      status: 'accepted',
      source: 'lexicon',
    })
  })

  it('validates only when nothing is left to decide, with the state seen', async () => {
    const s = setup()
    await s.run('ai')
    const first = await s.review()
    expect(await s.cleaning.validateClean(ACTOR, 'study', 'a', first.fingerprint)).toEqual({
      ok: false,
      error: 'CORRECTIONS_TO_DECIDE',
    })
    const keys = all(first)
      .filter((c) => c.status === 'proposed')
      .map((c) => c.key)
    expect(await s.cleaning.decideMany(ACTOR, 'study', 'a', keys, 'accept')).toEqual({
      ok: true,
      value: { decided: 2 },
    })
    expect(await s.cleaning.validateClean(ACTOR, 'study', 'a', first.fingerprint)).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    const ready = await s.review()
    expect(await s.cleaning.validateClean(ACTOR, 'study', 'a', ready.fingerprint)).toEqual({
      ok: true,
      value: { number: 1 },
    })
    const [version] = s.clean.versions
    expect(version?.segments.map((x) => x.text)).toEqual([
      'Hello Sam Example, welcome.',
      'We use Goodresearch for the meeting today.',
      'And NPS?',
      'The NPS went up.',
    ])
    const list = await s.queries.cleaningList('p1', 'study')
    expect(list.ok && list.value.interviews[0]?.state).toBe('clean')
  })

  it('adds a person’s own correction only where its original is', async () => {
    const s = setup()
    await s.run('lexicon')
    const [first] = (await s.review()).turns
    if (!first) throw new Error('missing')
    expect(
      await s.cleaning.addCorrection(ACTOR, 'study', 'a', {
        segmentId: first.id,
        target: 'text',
        offset: 0,
        length: 5,
        original: 'Hullo',
        replacement: 'Hi',
      }),
    ).toEqual({ ok: false, error: 'ORIGINAL_NOT_FOUND' })
    expect(
      (
        await s.cleaning.addCorrection(ACTOR, 'study', 'a', {
          segmentId: first.id,
          target: 'text',
          offset: 0,
          length: 5,
          original: 'Hello',
          replacement: 'Hi',
        })
      ).ok,
    ).toBe(true)
  })
})

describe('names under anonymisation (US3, FR-012)', () => {
  it('gives pseudonyms and interviewer labels, and redoes when the setting changes', async () => {
    const s = setup({ anonymised: true })
    await s.run('lexicon')
    const names = all(await s.review()).filter((c) => c.source === 'name')
    expect(names.map((c) => [c.target, c.original, c.replacement])).toEqual([
      ['speaker', 'Lee', 'Interviewer 1'],
      ['text', 'Sam Example', 'P01'],
      ['speaker', 'Sam Example', 'P01'],
      ['speaker', 'Lee', 'Interviewer 1'],
      ['speaker', 'Sam Example', 'P01'],
    ])
    s.anonymised.value = false
    const list = await s.queries.cleaningList('p1', 'study')
    expect(list.ok && list.value.interviews[0]?.state).toBe('to-redo')
  })
})

describe('publishing (US4, FR-018, FR-019)', () => {
  const ready = async () => {
    const s = setup()
    await s.run('lexicon')
    await s.cleaning.validateClean(ACTOR, 'study', 'a', (await s.review()).fingerprint)
    return s
  }

  it('creates one document in the subfolder, then updates it, never the original', async () => {
    const s = await ready()
    const first = await s.cleaning.publishClean(ACTOR, 'study', 'a', {
      overwrite: false,
      language: 'fr',
    })
    expect(first.ok).toBe(true)
    const docs = [...s.files.files.values()].filter((f) => !f.folder && f.parent !== 'study-folder')
    expect(docs.map((d) => d.name)).toEqual(['Interview a – clean'])
    expect(
      [...s.files.files.values()].find((f) => f.folder && f.parent === 'study-folder')?.name,
    ).toBe('Transcriptions nettoyées')
    expect(docs[0]?.doc.blocks[2]).toEqual({
      kind: 'paragraph',
      text: 'Sam Example: We use Goodresearch for the eating today.',
    })
    await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'fr' })
    expect(
      [...s.files.files.values()].filter((f) => !f.folder && f.parent !== 'study-folder'),
    ).toHaveLength(1)
    expect(s.files.writes).not.toContain('original')
  })

  it('tells a document changed in Drive, and overwrites it when asked', async () => {
    const s = await ready()
    await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'en' })
    const [id, doc] =
      [...s.files.files].find(([, f]) => !f.folder && f.parent !== 'study-folder') ?? []
    if (!id || !doc) throw new Error('missing')
    s.files.files.set(id, { ...doc, revision: doc.revision + 5 })
    expect(
      await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'en' }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_CHANGED',
    })
    expect(
      (await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: true, language: 'en' })).ok,
    ).toBe(true)
  })

  it('needs a clean version', async () => {
    const s = setup()
    await s.run('lexicon')
    expect(
      await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'en' }),
    ).toEqual({
      ok: false,
      error: 'NOT_CLEAN',
    })
  })
})

describe('one interview at a time (like "Analyze again")', () => {
  it('cleans only the chosen interview, again in full, whatever its state', async () => {
    const s = setup({ sessions: [session('a', TEXT), session('b', TEXT)] })
    await s.run('ai')
    expect(s.ai.requests).toHaveLength(2)
    s.ai.requests.length = 0
    const estimate = await s.cleaning.estimate('p1', 'study', 'ai', false, 'b')
    expect(estimate.ok && [estimate.value.interviews, estimate.value.chunks]).toEqual([1, 1])
    const started = await s.cleaning.startCleaning(ACTOR, 'study', {
      mode: 'ai',
      all: false,
      consent: true,
      sessionIds: ['b'],
    })
    if (!started.ok) throw new Error(started.error)
    expect(s.jobs.at(-1)).toMatchObject({ all: true })
    await s.cleaning.runCleaningJob({ runId: started.value.runId, studyId: 'study', all: true })
    expect(s.ai.requests).toHaveLength(1)
    const run = await s.clean.store.getCleaningRun(started.value.runId)
    expect(run?.sessions.map((x) => x.sessionId)).toEqual(['b'])
  })
})

describe('changes after a cleaning (US5, FR-013, FR-014)', () => {
  it('reads only the changed turns again, keeping decisions on the others', async () => {
    const long = Array.from(
      { length: 70 },
      (_, i) => `Lee: Turn ${i} about the eating plan ${i}.`,
    ).join('\n')
    const s = setup({ sessions: [session('a', long)] })
    await s.run('ai')
    expect(s.ai.requests).toHaveLength(2)
    const kept = all(await s.review()).find((c) => c.source === 'ai-other')
    if (!kept) throw new Error('missing')
    await s.cleaning.decideCorrection(ACTOR, 'study', 'a', kept.key, {
      decision: 'reject',
      version: 1,
    })
    s.sources.sessions[0] = session(
      'a',
      long.replace('Turn 65 about', 'Turn sixty-five about'),
      '2026-10-21T10:00:00Z',
    )
    s.ai.requests.length = 0
    await s.run('ai')
    expect(s.ai.requests).toHaveLength(1)
    expect(s.ai.requests[0]?.chunk.turns.filter((x) => !x.context)).toHaveLength(1)
    expect(all(await s.review()).find((c) => c.key === kept.key)?.status).toBe('rejected')
  })

  it('follows a lexicon change with no AI call', async () => {
    const s = setup()
    await s.run('lexicon')
    await s.cleaning.validateClean(ACTOR, 'study', 'a', (await s.review()).fingerprint)
    const t1 = s.memory.terms.get('t1')
    if (t1) s.memory.terms.set('t1', { ...t1, scope: 'case-by-case' })
    const list = await s.queries.cleaningList('p1', 'study')
    expect(list.ok && list.value.interviews[0]?.state).toBe('lexicon-changed')
  })
})

describe('one Enrichment run per study (research R6)', () => {
  it('blocks a lexicon reading while a cleaning is live, and the reverse', async () => {
    const s = setup()
    expect(
      (
        await s.cleaning.startCleaning(ACTOR, 'study', {
          mode: 'lexicon',
          all: false,
          consent: false,
        })
      ).ok,
    ).toBe(true)
    expect(await s.lexicon.startRun(ACTOR, 'study', { consent: true, all: true })).toEqual({
      ok: false,
      error: 'ENRICHMENT_RUNNING',
    })
    const other = setup()
    expect((await other.lexicon.startRun(ACTOR, 'study', { consent: true })).ok).toBe(true)
    expect(
      await other.cleaning.startCleaning(ACTOR, 'study', {
        mode: 'lexicon',
        all: false,
        consent: false,
      }),
    ).toEqual({
      ok: false,
      error: 'ENRICHMENT_RUNNING',
    })
  })
})

describe('review of PR #11', () => {
  it('fails every interview left when the provider goes away, none is "done"', async () => {
    const s = setup({
      sessions: [session('a', TEXT), session('b', TEXT)],
      ai: fakeCleaningAi({ fail: 'unavailable' }),
    })
    const runId = await s.run('ai')
    const run = await s.clean.store.getCleaningRun(runId)
    expect(run?.sessions.map((x) => [x.state, x.failure])).toEqual([
      ['failed', 'AI_PROVIDER_REQUIRED'],
      ['failed', 'AI_PROVIDER_REQUIRED'],
    ])
  })

  it('offers again, with the AI, an interview whose turns the AI has not all read', async () => {
    // Cleaned with the lexicon only: nothing to do again for the lexicon, all of it for the AI.
    const s = setup()
    await s.run('lexicon')
    const lexiconOnly = await s.cleaning.estimate('p1', 'study', 'lexicon', false)
    expect(lexiconOnly.ok && lexiconOnly.value.interviews).toBe(0)
    const withAi = await s.cleaning.estimate('p1', 'study', 'ai', false)
    expect(withAi.ok && withAi.value.interviews).toBe(1)
  })

  it('a person adding a correction the AI proposed makes it theirs, accepted', async () => {
    const s = setup()
    await s.run('ai')
    const eating = all(await s.review()).find((c) => c.original === 'eating')
    if (!eating) throw new Error('missing')
    await s.cleaning.decideCorrection(ACTOR, 'study', 'a', eating.key, { decision: 'reject' })
    const added = await s.cleaning.addCorrection(ACTOR, 'study', 'a', {
      segmentId: eating.segmentId,
      target: 'text',
      offset: eating.offset,
      length: eating.length,
      original: 'eating',
      replacement: 'meeting',
    })
    expect(added).toEqual({ ok: true, value: { key: eating.key } })
    expect(all(await s.review()).find((c) => c.key === eating.key)?.status).toBe('accepted')
  })

  it('replaces known names in the terms and definitions sent', async () => {
    const s = setup()
    const t1 = s.memory.terms.get('t1')
    if (t1) s.memory.terms.set('t1', { ...t1, definition: 'The app Sam Example built.' })
    await s.run('ai')
    expect(JSON.stringify(s.ai.requests.map((r) => r.terms))).not.toContain('Sam')
  })

  it('gives codes in runs only, never while reading', async () => {
    const s = setup({ anonymised: true })
    await s.queries.cleaningList('p1', 'study')
    expect(s.names.assigns).toEqual([false])
    await s.run('lexicon')
    expect(s.names.assigns).toContain(true)
  })

  it('takes back, when the job comes again, an interview left "cleaning"', async () => {
    const s = setup()
    const started = await s.cleaning.startCleaning(ACTOR, 'study', {
      mode: 'lexicon',
      all: false,
      consent: false,
    })
    if (!started.ok) throw new Error(started.error)
    const run = await s.clean.store.getCleaningRun(started.value.runId)
    if (!run) throw new Error('missing')
    await s.clean.store.saveCleaningRun({
      ...run,
      sessions: run.sessions.map((x) => ({ ...x, state: 'cleaning' as const })),
    })
    await s.cleaning.runCleaningJob({ runId: run.id, studyId: 'study', all: false })
    expect((await s.clean.store.getCleaningRun(run.id))?.sessions[0]?.state).toBe('done')
  })

  it('asks before overwriting when the revision of the last publish is unknown', async () => {
    const s = setup()
    await s.run('lexicon')
    await s.cleaning.validateClean(ACTOR, 'study', 'a', (await s.review()).fingerprint)
    await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'en' })
    const p = s.clean.publications.get('a')
    if (p) s.clean.publications.set('a', { ...p, revision: null })
    expect(
      await s.cleaning.publishClean(ACTOR, 'study', 'a', { overwrite: false, language: 'en' }),
    ).toEqual({ ok: false, error: 'DRIVE_CHANGED' })
  })
})
