import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeInsightCommands } from '../application/commands/insight-commands.ts'
import { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import type { InsightRequest } from '../application/ports.ts'
import { makeInsightQueries } from '../application/queries/insight-queries.ts'
import { fakeInsightsAi, fakeSources, makeDeps, sourceFact } from './fakes/in-memory-synthesis.ts'

const NOW = new Date('2026-10-29T10:00:00Z')
const study = { id: 'st', name: 'Interviews', access: true }

/** Quickstart scenario 1: five negative facts, one positive, two still to decide. */
const facts = () => [
  ...['P01', 'P02', 'P03', 'P04', 'P05'].map((p, i) => sourceFact(`a${i + 1}`, p)),
  sourceFact('b1', 'P06', {
    polarity: 'positive',
    statement: { en: 'Search works', fr: 'La recherche marche' },
  }),
  sourceFact('c1', 'P07', { status: 'proposed' }),
  sourceFact('c2', 'P08', { status: 'rejected' }),
]

const setup = (over: { names?: string[]; studies?: (typeof study)[] } = {}) => {
  const src = fakeSources({
    studies: over.studies ?? [study],
    facts: facts(),
    names: over.names ?? ['Sam Example'],
    themes: { st: [{ id: 'g1', title: 'Finding data' }] },
  })
  const fake = fakeInsightsAi()
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  return {
    ...made,
    src,
    fake,
    runs: makeInsightRunCommands(made.deps),
    commands: makeInsightCommands(made.deps),
    queries: makeInsightQueries(made.deps),
  }
}

const run = async (s: ReturnType<typeof setup>, scope: 'all' | 'unlinked' = 'all') => {
  const started = await s.runs.start('a1', 'pr', { studyIds: ['st'], scope, consent: true })
  if (!started.ok) throw new Error(started.error)
  await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
  return started.value.runId
}

describe('Find insights (US1)', () => {
  it('estimates the facts, calls and cost, and asks for consent first (FR-002, FR-017)', async () => {
    const s = setup()
    const e = await s.runs.estimate('a1', 'pr', { studyIds: ['st'], scope: 'all' })
    expect(e.ok && e.value).toMatchObject({
      facts: 6,
      calls: 1,
      consentNeeded: true,
      aiConnected: true,
    })
    expect(e.ok && e.value.studies).toEqual([
      { id: 'st', name: 'Interviews', facts: 6, toDecide: 1 },
    ])
    const refused = await s.runs.start('a1', 'pr', {
      studyIds: ['st'],
      scope: 'all',
      consent: false,
    })
    expect(refused).toEqual({ ok: false, error: 'INSIGHTS_CONSENT_REQUIRED' })
  })

  it('sends only accepted facts as anonymous lines, never a name or a study name (FR-003, FR-004)', async () => {
    const s = setup()
    await run(s)
    const request = s.fake.requests[0]?.body as InsightRequest
    expect(request.facts).toHaveLength(6)
    expect(request.facts[0]).toMatch(/^f1 \| negative \| t1 \| P01 \| Cannot find the data/)
    const sent = JSON.stringify(request)
    expect(sent).not.toContain('Interviews')
    expect(sent).not.toContain('a1')
    expect(sent).not.toContain('c1')
  })

  it('proposes an insight with known facts, computed confidence and polarity (US1 scenario 1)', async () => {
    const s = setup()
    const runId = await run(s)
    const view = await s.queries.overview('a1', 'pr')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.insights).toEqual([
      expect.objectContaining({
        status: 'proposed',
        statement: { en: 'Finding about t1', fr: 'Constat sur t1' },
        confidence: expect.objectContaining({ level: 'high', support: 5, counter: 1, panel: 6 }),
        polarity: 'negative',
      }),
    ])
    expect(view.value.run).toMatchObject({
      id: runId,
      calls: 1,
      callsDone: 1,
      finished: true,
      failure: null,
    })
    expect(view.value.cost).toBeCloseTo(0.06)
    expect(view.value.lastRunCost).toBeCloseTo(0.05)
    const [insight] = s.memory.insights.values()
    expect(insight?.description.en).toBe('What the facts say.')
    expect(insight?.links.map((l) => l.factId)).not.toContain('f999')
  })

  it('keeps one run per project, and refuses a study the person cannot open (FR-015, FR-018)', async () => {
    const s = setup({ studies: [study, { id: 'locked', name: 'Locked', access: false }] })
    await s.runs.start('a1', 'pr', { studyIds: ['st'], scope: 'all', consent: true })
    expect(
      await s.runs.start('a1', 'pr', { studyIds: ['st'], scope: 'all', consent: true }),
    ).toEqual({
      ok: false,
      error: 'INSIGHTS_RUNNING',
    })
    expect(
      await setup({ studies: [study, { id: 'locked', name: 'Locked', access: false }] }).runs.start(
        'a1',
        'pr',
        { studyIds: ['locked'], scope: 'all', consent: true },
      ),
    ).toEqual({ ok: false, error: 'STUDY_ACCESS_REQUIRED' })
  })

  it('retries a failed call once, then fails the run with its reason', async () => {
    const s = setup()
    s.fake.state.fail = 1
    await run(s)
    expect(s.memory.insights.size).toBe(1)
    const t = setup()
    t.fake.state.fail = 2
    await run(t)
    const view = await t.queries.overview('a1', 'pr')
    expect(view.ok && view.value.run?.failure).toBe('AI_FAILED')
  })

  it('stops between calls: nothing more is asked', async () => {
    const s = setup()
    const started = await s.runs.start('a1', 'pr', {
      studyIds: ['st'],
      scope: 'all',
      consent: true,
    })
    if (!started.ok) throw new Error(started.error)
    await s.runs.stop('a1', 'pr', started.value.runId)
    await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
    expect(s.fake.requests).toHaveLength(0)
    expect(s.memory.runs.get(started.value.runId)?.finishedAt).not.toBeNull()
  })

  it('may include the facts still to decide, shown "to decide" and not counted (FR-003)', async () => {
    const s = setup()
    const e = await s.runs.estimate('a1', 'pr', {
      studyIds: ['st'],
      scope: 'all',
      withProposed: true,
    })
    expect(e.ok && e.value).toMatchObject({ facts: 7 })
    expect(e.ok && e.value.studies).toEqual([
      { id: 'st', name: 'Interviews', facts: 6, toDecide: 1 },
    ])
    const started = await s.runs.start('a1', 'pr', {
      studyIds: ['st'],
      scope: 'all',
      withProposed: true,
      consent: true,
    })
    if (!started.ok) throw new Error(started.error)
    await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
    expect((s.fake.requests[0]?.body as InsightRequest | undefined)?.facts).toHaveLength(7)
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.insights[0]).toMatchObject({
      toValidate: 1,
      evidenceChanged: 0,
      confidence: expect.objectContaining({ support: 5 }),
    })
    expect(view.ok && view.value).toMatchObject({ facts: 6, factsToDecide: 1 })
    const [i] = s.memory.insights.values()
    const d = await s.queries.detail('a1', 'pr', i?.id ?? '')
    expect(d.ok && d.value.links.find((l) => l.factId === 'c1')).toMatchObject({
      fact: 'to-decide',
      version: 1,
    })
  })

  it('"Facts not yet in an insight" leaves out the facts already linked', async () => {
    const s = setup()
    await run(s)
    const e = await s.runs.estimate('a1', 'pr', { studyIds: ['st'], scope: 'unlinked' })
    expect(e.ok && e.value.facts).toBe(0)
  })
})

describe('Decide the insights (US2)', () => {
  const first = async (s: ReturnType<typeof setup>) => {
    await run(s)
    const [insight] = s.memory.insights.values()
    if (!insight) throw new Error('an insight')
    return insight
  }

  it('validates, then a new run leaves the decided texts and suggests new facts only', async () => {
    const s = setup()
    const i = await first(s)
    expect(
      (await s.commands.decide('a1', 'pr', i.id, { version: i.version, decision: 'validate' })).ok,
    ).toBe(true)
    s.src.state.facts = [...s.src.state.facts, sourceFact('a9', 'P09')]
    s.fake.state.answer = [
      {
        ref: 'i1',
        theme: 't1',
        statement: { en: 'Rewritten', fr: 'Réécrit' },
        description: { en: '', fr: '' },
        counterEvidence: { en: 'None', fr: 'Aucun' },
        minorityView: { en: 'None', fr: 'Aucun' },
        support: ['f1', 'f7'],
        counter: [],
      },
    ]
    await run(s)
    const after = s.memory.insights.get(i.id)
    expect(after?.statement.en).toBe('Finding about t1')
    expect(after?.links.find((l) => l.factId === 'a9')?.state).toBe('suggested')
  })

  it('a rejected insight is not proposed again', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.decide('a1', 'pr', i.id, { version: i.version, decision: 'reject' })
    await run(s)
    expect(s.memory.insights.size).toBe(1)
  })

  it('checks the version seen', async () => {
    const s = setup()
    const i = await first(s)
    expect(await s.commands.decide('a1', 'pr', i.id, { version: 0, decision: 'validate' })).toEqual(
      {
        ok: false,
        error: 'VERSION_CONFLICT',
      },
    )
  })

  it('edits one language: saved at once, the other translated in the background (FR-010)', async () => {
    const s = setup()
    const i = await first(s)
    const e = await s.commands.edit('a1', 'pr', i.id, {
      version: i.version,
      statement: { en: 'Teams rebuild reports' },
    })
    expect(e.ok).toBe(true)
    expect(s.memory.insights.get(i.id)).toMatchObject({
      status: 'edited',
      translation: 'translating',
    })
    const [job] = s.translations
    if (!job) throw new Error('a translation job')
    await s.commands.translateJob(job)
    expect(s.memory.insights.get(i.id)).toMatchObject({
      translation: 'done',
      statement: { en: 'Teams rebuild reports', fr: '[fr] Teams rebuild reports' },
    })
  })

  it('a text written again in both languages ends a translation in flight', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.edit('a1', 'pr', i.id, { version: i.version, statement: { en: 'Reports' } })
    const now = s.memory.insights.get(i.id)
    await s.commands.edit('a1', 'pr', i.id, {
      version: now?.version ?? 0,
      statement: { en: 'Reports are rebuilt', fr: 'Les rapports sont refaits' },
    })
    expect(s.memory.insights.get(i.id)).toMatchObject({
      translation: 'done',
      pendingTranslation: null,
    })
  })

  it('refuses a name in an edited statement', async () => {
    const s = setup()
    const i = await first(s)
    expect(
      await s.commands.edit('a1', 'pr', i.id, {
        version: i.version,
        statement: { en: 'Sam is lost', fr: 'Sam est perdu' },
      }),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })

  it('links, moves and unlinks facts; the confidence follows at once', async () => {
    const s = setup()
    const i = await first(s)
    const moved = await s.commands.link('a1', 'pr', i.id, 'a1', {
      version: i.version,
      role: 'counter',
    })
    if (!moved.ok) throw new Error(moved.error)
    const u = await s.commands.unlink('a1', 'pr', i.id, 'a2', moved.value.version)
    expect(u.ok).toBe(true)
    const d = await s.queries.detail('a1', 'pr', i.id)
    expect(d.ok && d.value.confidence).toMatchObject({
      support: 3,
      counter: 2,
      level: 'low',
      lowered: true,
    })
    expect(await s.commands.link('a1', 'pr', i.id, 'c1', { version: 99, role: 'support' })).toEqual(
      {
        ok: false,
        error: 'VERSION_CONFLICT',
      },
    )
  })

  it('creates an insight by hand, validated, with accepted facts only', async () => {
    const s = setup()
    const c = await s.commands.create('a1', 'pr', {
      themeKey: 'finding data',
      statement: { en: 'Search works for some', fr: 'La recherche marche pour certains' },
      support: ['b1'],
    })
    expect(c.ok).toBe(true)
    // One language written: saved at once, the other translated in the background.
    const one = await s.commands.create('a1', 'pr', {
      themeKey: 'other',
      statement: { en: 'Planning happens at the end of the week' },
      support: ['a1'],
    })
    expect(one.ok && s.memory.insights.get(one.value.id)?.translation).toBe('translating')
    const bad = await s.commands.create('a1', 'pr', {
      themeKey: 'finding data',
      statement: { en: 'x', fr: 'x' },
      support: ['c1'],
    })
    // A fact still to decide may be linked, but a validated insight needs an accepted one.
    expect(bad).toEqual({ ok: false, error: 'INSIGHT_NEEDS_SUPPORT' })
    const rejected = await s.commands.create('a1', 'pr', {
      themeKey: 'finding data',
      statement: { en: 'x', fr: 'x' },
      support: ['c2'],
    })
    expect(rejected).toEqual({ ok: false, error: 'FACT_NOT_ACCEPTED' })
  })

  it('validates all shown, counting those changed meanwhile', async () => {
    const s = setup()
    const i = await first(s)
    const r = await s.commands.validateMany('a1', 'pr', [
      { id: i.id, version: i.version },
      { id: 'gone', version: 1 },
    ])
    expect(r).toEqual({ ok: true, value: { done: 1, changed: 1 } })
  })
})

describe('Facts panel (US3) and evidence changed (US4)', () => {
  it('pages, searches and filters the accepted facts, "not in any insight" included', async () => {
    const s = setup()
    const all = await s.queries.facts('a1', 'pr', { page: 1, unlinked: false })
    expect(all.ok && all.value).toMatchObject({ total: 7, pageSize: 25 })
    const accepted = await s.queries.facts('a1', 'pr', {
      page: 1,
      unlinked: false,
      status: 'accepted',
    })
    expect(accepted.ok && accepted.value.total).toBe(6)
    const searched = await s.queries.facts('a1', 'pr', { page: 1, q: 'search', unlinked: false })
    expect(searched.ok && searched.value.items.map((f) => f.id)).toEqual(['b1'])
    await run(s)
    const unlinked = await s.queries.facts('a1', 'pr', { page: 1, unlinked: true })
    // The run read the accepted facts only: the one still to decide is in no insight.
    expect(unlinked.ok && unlinked.value.items.map((f) => f.id)).toEqual(['c1'])
  })

  it('flags an insight whose facts changed or left; "Reviewed" clears a change', async () => {
    const s = setup()
    await run(s)
    const [i] = s.memory.insights.values()
    if (!i) throw new Error('an insight')
    s.src.state.facts = s.src.state.facts.map((f) =>
      f.id === 'a1'
        ? { ...f, status: 'rejected' }
        : f.id === 'a2'
          ? { ...f, polarity: 'neutral', version: 2 }
          : f,
    )
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.insights[0]).toMatchObject({
      evidenceChanged: 2,
      confidence: expect.objectContaining({ support: 4 }),
    })
    const r = await s.commands.reviewed('a1', 'pr', i.id, i.version)
    expect(r.ok).toBe(true)
    const after = await s.queries.overview('a1', 'pr')
    // Seen: the change is taken in, the fact no longer accepted is let go of.
    expect(after.ok && after.value.insights[0]?.evidenceChanged).toBe(0)
    const d = await s.queries.detail('a1', 'pr', i.id)
    expect(d.ok && d.value.links.find((l) => l.factId === 'a1')).toMatchObject({
      fact: 'not-accepted',
      state: 'unlinked',
    })
  })
})

describe('Review of PR #13', () => {
  const first = async (s: ReturnType<typeof setup>) => {
    await run(s)
    const [insight] = s.memory.insights.values()
    if (!insight) throw new Error('an insight')
    return insight
  }

  it('shows a run whose worker stopped beating as over, interrupted', async () => {
    let now = NOW
    const src = fakeSources({ studies: [study], facts: facts() })
    const made = makeDeps({
      sources: src.sources,
      ai: fakeInsightsAi().ai,
      clock: { now: () => now },
    })
    const runs = makeInsightRunCommands(made.deps)
    const started = await runs.start('a1', 'pr', { studyIds: ['st'], scope: 'all', consent: true })
    if (!started.ok) throw new Error(started.error)
    now = new Date(NOW.getTime() + 11 * 60_000)
    const view = await makeInsightQueries(made.deps).overview('a1', 'pr')
    expect(view.ok && view.value.run).toMatchObject({ finished: true, failure: 'INTERRUPTED' })
  })

  it('ends the run when something fails outside the AI call', async () => {
    const s = setup()
    s.memory.store.applyRun = async () => {
      throw new Error('database gone')
    }
    const runId = await run(s)
    expect(s.memory.runs.get(runId)).toMatchObject({ failure: 'INTERRUPTED' })
    expect(s.memory.runs.get(runId)?.finishedAt).not.toBeNull()
  })

  it('keeps nothing of a call answered after a stop', async () => {
    const s = setup()
    const started = await s.runs.start('a1', 'pr', {
      studyIds: ['st'],
      scope: 'all',
      consent: true,
    })
    if (!started.ok) throw new Error(started.error)
    s.fake.state.during = async () => {
      await s.runs.stop('a1', 'pr', started.value.runId)
    }
    await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
    expect(s.memory.insights.size).toBe(0)
  })

  it('applies a translation even when the insight was decided meanwhile', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.edit('a1', 'pr', i.id, {
      version: i.version,
      statement: { en: 'Reports are rebuilt' },
    })
    const [job] = s.translations
    if (!job) throw new Error('a translation job')
    s.fake.state.during = async () => {
      const now = s.memory.insights.get(i.id)
      if (now)
        await s.commands.decide('a1', 'pr', i.id, { version: now.version, decision: 'validate' })
    }
    await s.commands.translateJob(job)
    expect(s.memory.insights.get(i.id)).toMatchObject({
      status: 'edited',
      translation: 'done',
      statement: { fr: '[fr] Reports are rebuilt' },
      pendingTranslation: null,
    })
  })

  it('translates again from the language written, whoever asks', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.edit('a1', 'pr', i.id, {
      version: i.version,
      statement: { en: 'Reports are rebuilt' },
    })
    s.fake.state.unavailable = true
    const [job] = s.translations
    if (!job) throw new Error('a translation job')
    await s.commands.translateJob(job)
    const failed = s.memory.insights.get(i.id)
    expect(failed?.translation).toBe('not-translated')
    s.fake.state.unavailable = false
    s.src.state.language = 'fr'
    await s.commands.retryTranslation('a2', 'pr', i.id, failed?.version ?? 0)
    expect(s.translations[1]).toMatchObject({
      from: 'en',
      texts: { statement: 'Reports are rebuilt' },
    })
  })

  it('does not keep a translation too long, and offers to translate it again', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.edit('a1', 'pr', i.id, {
      version: i.version,
      statement: { en: 'Reports are rebuilt' },
      minorityView: { en: 'A few keep their own files' },
    })
    s.fake.state.translation = (field, text) =>
      field === 'minorityView' ? 'x'.repeat(600) : `FR ${text}`
    const [job] = s.translations
    if (!job) throw new Error('a translation job')
    await s.commands.translateJob(job)
    expect(s.memory.insights.get(i.id)).toMatchObject({
      translation: 'not-translated',
      statement: { fr: 'FR Reports are rebuilt' },
      pendingTranslation: { from: 'en', fields: ['minorityView'] },
    })
  })

  it('clears a text in both languages', async () => {
    const s = setup()
    const i = await first(s)
    await s.commands.edit('a1', 'pr', i.id, { version: i.version, minorityView: { fr: '' } })
    expect(s.memory.insights.get(i.id)?.minorityView).toEqual({ en: '', fr: '' })
    expect(s.translations).toHaveLength(0)
  })

  it('treats a guide section named "Other" as the built-in Other', async () => {
    const src = fakeSources({
      studies: [study],
      facts: facts(),
      themes: {
        st: [
          { id: 'g1', title: 'Finding data' },
          { id: 'g9', title: 'Other' },
        ],
      },
    })
    const made = makeDeps({ sources: src.sources, ai: fakeInsightsAi().ai, clock: fixedClock(NOW) })
    const view = await makeInsightQueries(made.deps).overview('a1', 'pr')
    const keys = view.ok ? view.value.themes.map((t) => t.key) : []
    expect(keys).toEqual(['finding data', 'other'])
  })

  it('shows the facts of a study the viewer cannot open as counts only', async () => {
    const s = setup()
    const i = await first(s)
    s.src.state.studies = [{ ...study, access: false }]
    const d = await s.queries.detail('a1', 'pr', i.id)
    expect(d.ok && d.value.links[0]).toMatchObject({
      statement: null,
      participant: null,
      polarity: null,
      studyId: null,
      sessionId: null,
    })
  })
})
