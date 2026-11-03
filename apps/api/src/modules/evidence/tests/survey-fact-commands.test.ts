import { ok } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeSurveyFactCommands } from '../application/commands/survey-fact-commands.ts'
import { AiUnavailable, type SurveyFactAnswer } from '../application/ports.ts'
import { makeSurveyFactQueries } from '../application/queries/survey-fact-queries.ts'
import type { FigureToday, SurveyFactDeps, ThemeNow } from '../application/survey-ports.ts'
import { inMemorySurveyFacts } from './fakes/in-memory-survey-facts.ts'

const at = new Date('2026-11-03T10:00:00Z')
const alex = { id: 'alex' }

const setup = (
  over: { type?: string; theme?: ThemeNow | null; counted?: number; provider?: string | null } = {},
) => {
  const memory = inMemorySurveyFacts()
  const today: { figure: FigureToday | null } = {
    figure: {
      snapshot: {
        itemId: 'i1',
        measure: 'agree',
        value: 40,
        base: 42,
        smallBase: false,
        ruleVersion: 0,
      },
      context: { itemText: 'Planning is easy', crossItemText: null, points: 5 },
      section: { id: 's1', title: 'Planning' },
    },
  }
  const queued: object[] = []
  const ai: { answer: SurveyFactAnswer[] | Error; sent: string[] } = { answer: [], sent: [] }
  const deps: SurveyFactDeps = {
    store: memory.store,
    surveys: {
      figures: async (_a, _s, refs) =>
        ok(
          refs.map((ref) =>
            today.figure && ref.itemId !== 'gone'
              ? { ...today.figure, snapshot: { ...today.figure.snapshot, measure: ref.measure } }
              : null,
          ),
        ),
      theme: async () => (over.theme === undefined ? null : over.theme),
      findingInput: async () =>
        ok({
          counted: over.counted ?? 42,
          figureCount: 1,
          figures: '- i1 "Planning is easy" (likert): base 42; agree 40 %',
          themes: [
            {
              id: 'th',
              item: 'Tell us more',
              label: 'Too many tools',
              description: 'People juggle tools.',
              answers: 12,
              base: 40,
            },
          ],
        }),
    },
    ai: {
      surveyFacts: async (_a, ref, request) => {
        ai.sent.push(ref, JSON.stringify(request))
        if (ai.answer instanceof Error) throw ai.answer
        return ai.answer
      },
      surveyEstimate: async (_a, chars) => chars / 1_000,
      providerOf: async () => (over.provider === undefined ? 'anthropic' : over.provider),
    },
    studyAccess: async () => ({
      role: 'member',
      type: over.type ?? 'survey',
      teamId: 't',
      anonymised: false,
      textAnalysed: 'with-corrections',
    }),
    knownNames: async () => ['Camille Martin'],
    translate: async (_a, _ref, request) => `(${request.to}) ${request.text}`,
    accountNames: async (ids) => new Map(ids.map((id) => [id, 'Alex'])),
    enqueueTranslation: async (job) => {
      queued.push(job)
      return true
    },
    clock: { now: () => at },
    log: { warn: () => undefined },
  }
  return {
    memory,
    today,
    queued,
    ai,
    commands: makeSurveyFactCommands(deps),
    queries: makeSurveyFactQueries(deps),
  }
}

const figure = { itemId: 'i1', measure: 'agree' as const }

describe('survey facts (spec 029 US4)', () => {
  it('makes a proposed fact from today’s figure, with the app’s statement and its section', async () => {
    const { commands } = setup()
    const made = await commands.create(alex, 'st', { from: { figure }, polarity: 'neutral' })
    expect(made.ok && made.value).toMatchObject({
      status: 'proposed',
      statement: { en: '40 % of the 42 respondents agree with “Planning is easy”.' },
      theme: { id: 's1', title: 'Planning' },
      support: { kind: 'figure', figure: { value: 40, base: 42 } },
    })
  })

  it('refuses a figure that no longer exists, an interview study, a theme not accepted', async () => {
    const gone = setup()
    gone.today.figure = null
    expect(
      await gone.commands.create(alex, 'st', { from: { figure }, polarity: 'neutral' }),
    ).toEqual({ ok: false, error: 'FIGURE_NOT_FOUND' })
    expect(
      await setup({ type: 'interviews' }).commands.create(alex, 'st', {
        from: { figure },
        polarity: 'neutral',
      }),
    ).toEqual({ ok: false, error: 'NOT_A_SURVEY_STUDY' })
    const proposed: ThemeNow = {
      itemId: 'o1',
      itemText: 'Tell us more',
      status: 'proposed',
      label: { en: 'Too many tools', fr: 'Trop d’outils' },
      description: { en: 'People juggle tools.', fr: 'On jongle entre les outils.' },
      share: { answers: 12, base: 40 },
      quotes: ['too many tools'],
      section: { id: 's1', title: 'Planning' },
    }
    expect(
      await setup({ theme: proposed }).commands.create(alex, 'st', {
        from: { theme: { themeId: 'th' } },
        polarity: 'negative',
      }),
    ).toEqual({ ok: false, error: 'THEME_NOT_ACCEPTED' })
    const accepted = await setup({ theme: { ...proposed, status: 'accepted' } }).commands.create(
      alex,
      'st',
      { from: { theme: { themeId: 'th' } }, polarity: 'negative' },
    )
    expect(accepted.ok && accepted.value).toMatchObject({
      statement: { en: 'People juggle tools.' },
      support: { kind: 'theme', share: { answers: 12, base: 40 }, quotes: ['too many tools'] },
    })
  })

  it('translates an edit in the background under the study’s ref', async () => {
    const { commands, queued, memory } = setup()
    const made = await commands.create(alex, 'st', { from: { figure }, polarity: 'neutral' })
    if (!made.ok) throw new Error(made.error)
    const edited = await commands.decide(alex, 'st', made.value.id, {
      decision: 'edit',
      version: 1,
      statement: { fr: 'Peu trouvent la planification facile.' },
    })
    expect(edited.ok && edited.value.translation).toBe('translating')
    expect(queued).toEqual([
      expect.objectContaining({ factId: made.value.id, from: 'fr', survey: true }),
    ])
    await commands.translateJob(queued[0] as never)
    expect(memory.facts.get(made.value.id)).toMatchObject({
      translation: 'done',
      statement: { en: '(en) Peu trouvent la planification facile.' },
    })
    expect(
      await commands.decide(alex, 'other', made.value.id, { decision: 'accept', version: 2 }),
    ).toEqual({ ok: false, error: 'FACT_NOT_FOUND' })
  })

  it('shows a figure that moved, updates it to today or keeps it', async () => {
    const s = setup()
    const made = await s.commands.create(alex, 'st', { from: { figure }, polarity: 'neutral' })
    if (!made.ok) throw new Error(made.error)
    expect(
      await s.commands.figure(alex, 'st', made.value.id, { action: 'keep', version: 1 }),
    ).toEqual({
      ok: false,
      error: 'FIGURE_UNCHANGED',
    })
    if (s.today.figure)
      s.today.figure = {
        ...s.today.figure,
        snapshot: { ...s.today.figure.snapshot, value: 55, base: 50 },
      }
    const page = await s.queries.page('alex', 'st', { page: 1 })
    expect(page.ok && page.value.facts[0]).toMatchObject({
      figureChanged: { value: 55, base: 50 },
      itemRemoved: false,
    })
    const kept = await s.commands.figure(alex, 'st', made.value.id, { action: 'keep', version: 1 })
    expect(kept.ok).toBe(true)
    const after = await s.queries.page('alex', 'st', { page: 1 })
    expect(after.ok && after.value.facts[0]?.figureChanged).toBeNull()
    const updated = await s.commands.figure(alex, 'st', made.value.id, {
      action: 'update',
      version: 2,
    })
    expect(updated).toEqual({ ok: false, error: 'FIGURE_UNCHANGED' })
    s.today.figure = null
    const removed = await s.queries.page('alex', 'st', { page: 1 })
    expect(removed.ok && removed.value.facts[0]?.itemRemoved).toBe(true)
  })

  describe('Find facts (FR-010a)', () => {
    const accepted: ThemeNow = {
      itemId: 'o1',
      itemText: 'Tell us more',
      status: 'accepted',
      label: { en: 'Too many tools', fr: 'Trop d’outils' },
      description: { en: 'People juggle tools.', fr: 'On jongle entre les outils.' },
      share: { answers: 12, base: 40 },
      quotes: [],
      section: { id: 's1', title: 'Planning' },
    }

    it('proposes the figures and themes the AI points at, checked by the app, once each', async () => {
      const s = setup({ theme: accepted })
      await s.commands.create(alex, 'st', { from: { figure }, polarity: 'neutral' })
      s.ai.answer = [
        // Already a fact: left out.
        {
          figure: { itemId: 'i1', measure: 'agree', option: null },
          themeId: null,
          polarity: 'positive',
        },
        {
          figure: { itemId: 'i1', measure: 'disagree', option: null },
          themeId: null,
          polarity: 'negative',
        },
        // Not a figure the app computes, not an accepted theme: left out.
        {
          figure: { itemId: 'gone', measure: 'mean', option: null },
          themeId: null,
          polarity: 'neutral',
        },
        { figure: null, themeId: 'invented', polarity: 'neutral' },
        { figure: null, themeId: 'th', polarity: 'negative' },
      ]
      const found = await s.commands.find(alex, 'st')
      expect(found).toEqual({ ok: true, value: { created: 2, leftOut: 3 } })
      expect(s.ai.sent[0]).toBe('survey-facts:st')
      expect(s.ai.sent[1]).toContain('proposed: 40 % of the 42 respondents agree')
      const all = await s.memory.store.allOf('st')
      expect(
        all
          .filter((f) => f.origin === 'ai')
          .map((f) => f.support.kind)
          .sort(),
      ).toEqual(['figure', 'theme'])
      expect(all.every((f) => f.status === 'proposed')).toBe(true)
    })

    it('needs an AI provider, counted responses and an answer', async () => {
      expect(await setup({ provider: null }).commands.find(alex, 'st')).toEqual({
        ok: false,
        error: 'AI_PROVIDER_REQUIRED',
      })
      expect(await setup({ counted: 0 }).commands.find(alex, 'st')).toEqual({
        ok: false,
        error: 'NO_COUNTED_RESPONSE',
      })
      const failing = setup()
      failing.ai.answer = new Error('provider failed')
      expect(await failing.commands.find(alex, 'st')).toEqual({ ok: false, error: 'AI_FAILED' })
      failing.ai.answer = new AiUnavailable()
      expect(await failing.commands.find(alex, 'st')).toEqual({
        ok: false,
        error: 'AI_PROVIDER_REQUIRED',
      })
    })

    it('estimates what it sends and costs', async () => {
      const estimate = await setup().commands.estimateFind(alex, 'st')
      expect(estimate.ok && estimate.value).toMatchObject({
        figures: 1,
        themes: 1,
        aiConnected: true,
      })
      expect(estimate.ok && estimate.value.cost).toBeGreaterThan(0)
    })
  })
})
