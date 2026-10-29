import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeInsightCommands } from '../application/commands/insight-commands.ts'
import { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import { makeRecommendationCommands } from '../application/commands/recommendation-commands.ts'
import { makeRecommendationRunCommands } from '../application/commands/recommendation-run-commands.ts'
import { makeTakeawaysCommands } from '../application/commands/takeaways-commands.ts'
import type { RecommendationRequest, TakeawaysRequest } from '../application/ports.ts'
import { makeRecommendationQueries } from '../application/queries/recommendation-queries.ts'
import { fakeInsightsAi, fakeSources, makeDeps, sourceFact } from './fakes/in-memory-synthesis.ts'

const NOW = new Date('2026-10-29T10:00:00Z')
const study = { id: 'st', name: 'Interviews', access: true }

/** Two themes: one insight of high confidence (5 participants), one of low (1). */
const facts = () => [
  ...['P01', 'P02', 'P03', 'P04', 'P05'].map((p, i) => sourceFact(`a${i + 1}`, p)),
  sourceFact('b1', 'P06', { theme: { id: 'g2', title: 'Sharing' } }),
]

const setup = async () => {
  const src = fakeSources({
    studies: [study],
    facts: facts(),
    names: ['Sam Example'],
    themes: {
      st: [
        { id: 'g1', title: 'Finding data' },
        { id: 'g2', title: 'Sharing' },
      ],
    },
  })
  const fake = fakeInsightsAi()
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  const insightRuns = makeInsightRunCommands(made.deps)
  const none = { en: 'None', fr: 'Aucun' }
  fake.state.answer = [
    {
      theme: 't1',
      statement: {
        en: 'Teams cannot find their data',
        fr: 'Les équipes ne trouvent pas leurs données',
      },
      description: none,
      counterEvidence: none,
      minorityView: none,
      support: ['f1', 'f2', 'f3', 'f4', 'f5'],
      counter: [],
    },
    {
      theme: 't2',
      statement: { en: 'Sharing happens by email', fr: 'Le partage passe par email' },
      description: none,
      counterEvidence: none,
      minorityView: none,
      support: ['f6'],
      counter: [],
    },
  ]
  const insightCommands = makeInsightCommands(made.deps)
  const started = await insightRuns.start('a1', 'pr', {
    studyIds: ['st'],
    scope: 'all',
    consent: true,
  })
  if (!started.ok) throw new Error(started.error)
  await insightRuns.runJob({ runId: started.value.runId, projectId: 'pr' })
  const insights = [...made.memory.insights.values()]
  return {
    ...made,
    src,
    fake,
    insights,
    insightCommands,
    runs: makeRecommendationRunCommands(made.deps),
    commands: makeRecommendationCommands(made.deps),
    takeaways: makeTakeawaysCommands(made.deps),
    queries: makeRecommendationQueries(made.deps),
  }
}

const validateAll = async (s: Awaited<ReturnType<typeof setup>>) => {
  for (const i of [...s.memory.insights.values()])
    await s.insightCommands.decide('a1', 'pr', i.id, { version: i.version, decision: 'validate' })
}

const run = async (s: Awaited<ReturnType<typeof setup>>, withProposed = false) => {
  const started = await s.runs.start('a1', 'pr', { withProposed, consent: false })
  if (!started.ok) throw new Error(started.error)
  await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
  return started.value.runId
}

describe('Find recommendations (US1)', () => {
  it('reads only the validated insights unless asked, as anonymous lines (FR-002, FR-003)', async () => {
    const s = await setup()
    expect(await s.runs.start('a1', 'pr', { withProposed: false, consent: false })).toEqual({
      ok: false,
      error: 'NO_INSIGHTS',
    })
    const e = await s.runs.estimate('a1', 'pr', { withProposed: true })
    expect(e.ok && e.value.insights).toBe(2)
    await validateAll(s)
    await run(s)
    const request = s.fake.requests.find((r) => r.kind === 'recommendations')
      ?.body as RecommendationRequest
    expect(request.insights).toHaveLength(2)
    expect(request.insights[0]).toMatch(
      /^i1 \| Finding data \| high \| negative \| for 5 against 0 of 6 participants \| 5 facts \| /,
    )
    const sent = JSON.stringify(request)
    expect(sent).not.toContain('Interviews')
    expect(sent).not.toContain('P01')
  })

  it('proposes recommendations on known insights, with the computed priority and kind (FR-004, FR-006)', async () => {
    const s = await setup()
    await validateAll(s)
    await run(s)
    const view = await s.queries.overview('a1', 'pr')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.recommendations).toEqual([
      expect.objectContaining({ kind: 'build', kindShown: 'build', priority: 4, insights: 1 }),
      expect.objectContaining({ kind: 'build', kindShown: 'test', downgraded: true }),
    ])
    expect(view.value.run).toMatchObject({ finished: true, leftOut: 1 })
    expect(view.value.cost).toBeGreaterThan(0)
  })

  it('may read the insights still to decide: shown "to validate", never counted (FR-009)', async () => {
    const s = await setup()
    await run(s, true)
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.recommendations[0]).toMatchObject({
      insights: 0,
      insightsToValidate: 1,
      insightsChanged: 0,
    })
  })

  it('keeps nothing of an answer coming after a stop', async () => {
    const s = await setup()
    await validateAll(s)
    const started = await s.runs.start('a1', 'pr', { withProposed: false, consent: false })
    if (!started.ok) throw new Error(started.error)
    s.fake.state.during = async () => {
      await s.runs.stop('a1', 'pr', started.value.runId)
    }
    await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
    expect(s.memory.recommendations.size).toBe(0)
  })
})

describe('Decide the recommendations (US2)', () => {
  const first = async () => {
    const s = await setup()
    await validateAll(s)
    await run(s)
    const [r] = s.memory.recommendations.values()
    if (!r) throw new Error('a recommendation')
    return { s, r }
  }

  it('edits in place, sets the owner, and keeps the place in the list', async () => {
    const { s, r } = await first()
    const e = await s.commands.edit('a1', 'pr', r.id, {
      version: r.version,
      effort: 'low',
      owner: ' Data team ',
    })
    expect(e.ok).toBe(true)
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.recommendations[0]).toMatchObject({
      id: r.id,
      status: 'edited',
      priority: 5,
      owner: 'Data team',
    })
  })

  it('a new run leaves a decided one alone and never proposes again a rejected one', async () => {
    const { s, r } = await first()
    await s.commands.decide('a1', 'pr', r.id, { version: r.version, decision: 'reject' })
    await run(s)
    expect(
      [...s.memory.recommendations.values()].filter((x) => x.action.en === r.action.en),
    ).toHaveLength(1)
  })

  it('creates one by hand with a validated insight only', async () => {
    const { s } = await first()
    const [i] = s.memory.insights.values()
    const c = await s.commands.create('a1', 'pr', {
      action: { en: 'Run a survey' },
      kind: 'investigate',
      impact: 'medium',
      effort: 'low',
      insights: [i?.id ?? ''],
    })
    expect(c.ok).toBe(true)
    expect(s.translations.at(-1)).toMatchObject({ target: 'recommendation', from: 'en' })
  })

  it('shows "Insights changed" when a linked insight is rejected later (US4)', async () => {
    const { s, r } = await first()
    await s.commands.decide('a1', 'pr', r.id, { version: r.version, decision: 'validate' })
    const linked = s.memory.insights.get(r.links[0]?.insightId ?? '')
    if (!linked) throw new Error('linked')
    await s.insightCommands.decide('a1', 'pr', linked.id, {
      version: linked.version,
      decision: 'reject',
    })
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.recommendations[0]?.insightsChanged).toBe(1)
  })
})

describe('Key takeaways (US3)', () => {
  it('drafts without saving, drops percentages, then a person saves; out of date after a change', async () => {
    const s = await setup()
    await validateAll(s)
    await run(s)
    expect((await s.takeaways.draft('a1', 'pr', { consent: false })).ok).toBe(true)
    const [job] = s.takeawaysJobs
    if (!job) throw new Error('a draft job')
    await s.takeaways.draftJob(job)
    let view = await s.queries.overview('a1', 'pr')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.takeaways).toMatchObject({
      version: 0,
      text: { en: '', fr: '' },
      draft: {
        state: 'ready',
        text: { en: 'Teams lose time finding data. A shared catalogue would help.' },
      },
    })
    const draft = view.value.takeaways.draft.text
    await s.takeaways.save('a1', 'pr', { version: 0, text: draft ?? {} })
    view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways).toMatchObject({ version: 1, outOfDate: false })
    const [r] = s.memory.recommendations.values()
    if (r) await s.commands.decide('a1', 'pr', r.id, { version: r.version, decision: 'validate' })
    view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways.outOfDate).toBe(true)
  })

  it('a new draft revises the takeaways saved, rather than starting again', async () => {
    const s = await setup()
    await validateAll(s)
    await s.takeaways.save('a1', 'pr', {
      version: 0,
      text: {
        en: 'Teams lose time. A catalogue helps.',
        fr: 'Les équipes perdent du temps. Un catalogue aide.',
      },
    })
    await s.takeaways.draft('a1', 'pr', { consent: true })
    const [job] = s.takeawaysJobs
    if (!job) throw new Error('a draft job')
    await s.takeaways.draftJob(job)
    const request = s.fake.requests.find((r) => r.kind === 'takeaways')?.body as TakeawaysRequest
    expect(request.current).toBe('Teams lose time. A catalogue helps.')
  })

  it('checks the version seen, and translates a text written in one language', async () => {
    const s = await setup()
    await s.takeaways.save('a1', 'pr', {
      version: 0,
      text: { fr: 'Les équipes perdent du temps. Un catalogue aiderait.' },
    })
    expect(await s.takeaways.save('a1', 'pr', { version: 0, text: { fr: 'x. y.' } })).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    const job = s.translations.at(-1)
    if (!job) throw new Error('a translation job')
    await s.takeaways.translateJob(job)
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways).toMatchObject({
      translation: 'done',
      text: { en: '[en] Les équipes perdent du temps. Un catalogue aiderait.' },
    })
  })

  it('may draft from what is still to decide, and tells how much is not validated yet', async () => {
    const s = await setup()
    await run(s, true)
    expect(await s.takeaways.draft('a1', 'pr', { consent: false })).toEqual({
      ok: false,
      error: 'NO_INSIGHTS',
    })
    expect((await s.takeaways.draft('a1', 'pr', { consent: false, withProposed: true })).ok).toBe(
      true,
    )
    const [job] = s.takeawaysJobs
    if (!job) throw new Error('a draft job')
    await s.takeaways.draftJob(job)
    const sent = s.fake.requests.find((r) => r.kind === 'takeaways')?.body
    expect(JSON.stringify(sent)).toContain('to validate | ')
    // The agent sees the weight of each insight and the distribution, as counts only.
    const request = sent as TakeawaysRequest
    expect(request.insights[0]).toMatch(
      /\| high \| negative \| for 5 against 0 of 6 participants \| 5 facts \| /,
    )
    expect(request.overview).toEqual(
      expect.arrayContaining([
        'panel: 6 participants with accepted facts',
        'insights: 2 (high 1, medium 0, low 1)',
        'recommendations: 2 (build 2, test 0, investigate 0)',
      ]),
    )
    expect(request.overview.some((l) => l.startsWith('themes: Finding data 1, Sharing 1'))).toBe(
      true,
    )
    let view = await s.queries.overview('a1', 'pr')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.takeaways.draft).toMatchObject({ state: 'ready', withProposed: true })
    await s.takeaways.save('a1', 'pr', {
      version: 0,
      text: view.value.takeaways.draft.text ?? {},
      fromDraft: true,
    })
    view = await s.queries.overview('a1', 'pr')
    const before = view.ok ? view.value.takeaways.toValidate : 0
    expect(before).toBeGreaterThan(0)
    expect(view.ok && view.value.takeaways.outOfDate).toBe(false)
    await validateAll(s)
    view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways.toValidate).toBeLessThan(before)
  })
})

describe('Review of PR #14', () => {
  it('counts on a card only the insights counted, not the suggested ones', async () => {
    const s = await setup()
    await validateAll(s)
    await run(s)
    const [r] = s.memory.recommendations.values()
    const other = [...s.memory.insights.values()].find(
      (i) => !r?.links.some((l) => l.insightId === i.id),
    )
    if (!r || !other) throw new Error('fixtures')
    const suggested = { ...r.links[0], insightId: other.id, state: 'suggested' as const }
    s.memory.recommendations.set(r.id, { ...r, links: [...r.links, suggested] as typeof r.links })
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.recommendations[0]).toMatchObject({ insights: 1, suggested: 1 })
  })

  it('"Validate all shown" tells how many need a validated insight first', async () => {
    const s = await setup()
    await run(s, true)
    const all = [...s.memory.recommendations.values()]
    const r = await s.commands.validateMany(
      'a1',
      'pr',
      all.map((x) => ({ id: x.id, version: x.version })),
    )
    expect(r).toEqual({ ok: true, value: { done: 0, changed: 0, blocked: all.length } })
  })

  it('a failed draft keeps the previous one', async () => {
    const s = await setup()
    await validateAll(s)
    await s.takeaways.draft('a1', 'pr', { consent: true })
    const [first] = s.takeawaysJobs
    if (!first) throw new Error('a draft job')
    await s.takeaways.draftJob(first)
    const before = s.memory.takeaways.get('pr')?.draft.text
    await s.takeaways.draft('a1', 'pr', { consent: true })
    s.fake.state.unavailable = true
    await s.takeaways.draftJob(first)
    expect(s.memory.takeaways.get('pr')?.draft).toMatchObject({ state: 'failed', text: before })
  })

  it('a text written again in both languages ends a translation in flight', async () => {
    const s = await setup()
    await validateAll(s)
    await run(s)
    const [r] = s.memory.recommendations.values()
    if (!r) throw new Error('a recommendation')
    await s.commands.edit('a1', 'pr', r.id, {
      version: r.version,
      action: { en: 'Build a catalogue' },
    })
    const now = s.memory.recommendations.get(r.id)
    expect(now?.translation).toBe('translating')
    await s.commands.edit('a1', 'pr', r.id, {
      version: now?.version ?? 0,
      action: { en: 'Build a shared catalogue', fr: 'Créer un catalogue partagé' },
    })
    expect(s.memory.recommendations.get(r.id)).toMatchObject({
      translation: 'done',
      pendingTranslation: null,
    })
  })

  it('a draft used later rests on what it read, not on the project as it is then', async () => {
    const s = await setup()
    await validateAll(s)
    await s.takeaways.draft('a1', 'pr', { consent: true })
    const [job] = s.takeawaysJobs
    if (!job) throw new Error('a draft job')
    await s.takeaways.draftJob(job)
    // An insight the draft read is rejected before the draft is used.
    const [i] = s.memory.insights.values()
    if (!i) throw new Error('an insight')
    await s.insightCommands.decide('a1', 'pr', i.id, { version: i.version, decision: 'reject' })
    const draft = s.memory.takeaways.get('pr')?.draft.text
    await s.takeaways.save('a1', 'pr', { version: 0, text: draft ?? {}, fromDraft: true })
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways.outOfDate).toBe(true)
  })

  it('only the text of the draft rests on what the draft read', async () => {
    const s = await setup()
    await validateAll(s)
    await s.takeaways.draft('a1', 'pr', { consent: true })
    const [job] = s.takeawaysJobs
    if (!job) throw new Error('a draft job')
    await s.takeaways.draftJob(job)
    const [i] = s.memory.insights.values()
    if (!i) throw new Error('an insight')
    await s.insightCommands.decide('a1', 'pr', i.id, { version: i.version, decision: 'reject' })
    // Another text sent "from the draft" gets the basis of now, not the draft's.
    await s.takeaways.save('a1', 'pr', {
      version: 0,
      text: { en: 'Other words. Written by hand.', fr: 'Autres mots. Écrits à la main.' },
      fromDraft: true,
    })
    const view = await s.queries.overview('a1', 'pr')
    expect(view.ok && view.value.takeaways.outOfDate).toBe(false)
  })

  it('takeaways translations are counted apart from the drafts', async () => {
    const s = await setup()
    await s.takeaways.save('a1', 'pr', {
      version: 0,
      text: { fr: 'Les équipes perdent du temps. Un catalogue aide.' },
    })
    const job = s.translations.at(-1)
    if (!job) throw new Error('a translation job')
    await s.takeaways.translateJob(job)
    expect(s.fake.requests.at(-1)).toMatchObject({
      kind: 'translate',
      ref: 'takeaways-translation:pr',
    })
  })

  it('a run that finds no insight to read says so, not "no fact"', async () => {
    const s = await setup()
    await validateAll(s)
    const started = await s.runs.start('a1', 'pr', { withProposed: false, consent: false })
    if (!started.ok) throw new Error(started.error)
    for (const i of [...s.memory.insights.values()])
      await s.insightCommands.decide('a1', 'pr', i.id, { version: i.version, decision: 'reject' })
    await s.runs.runJob({ runId: started.value.runId, projectId: 'pr' })
    expect(s.memory.recRuns.get(started.value.runId)?.failure).toBe('NO_INSIGHTS')
  })
})
