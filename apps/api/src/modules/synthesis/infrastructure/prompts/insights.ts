import { REGISTERS, WRITING_STYLE } from '@goodresearch/shared'
import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import {
  AiFailed,
  AiUnavailable,
  type InsightRequest,
  type InsightsAi,
  type RecommendationRequest,
  type TakeawaysRequest,
} from '../../application/ports.ts'

/** The ledger tasks of spec 013. */
export const INSIGHTS_TASK = 'insights'
export const TRANSLATION_TASK = 'insight-translation'
/** The ledger tasks of spec 014. */
export const RECOMMENDATIONS_TASK = 'recommendations'
export const TAKEAWAYS_TASK = 'takeaways'

/** It runs in the worker: a call over hundreds of facts may take a while. */
const TIMEOUT_MS = 180_000

/** Mark the requests for the test provider, which answers them from the prompt (dev, e2e). */
export const INSIGHTS_MARKER = '<fact-lines>'
export const TRANSLATION_MARKER = '<translate-insight>'
export const RECOMMENDATIONS_MARKER = '<insight-lines>'
export const TAKEAWAYS_MARKER = '<takeaways-input>'

const Texts = (what: string) =>
  z
    .object({
      en: z.string().describe(`${what} in English.`),
      fr: z.string().describe(`The same in French.`),
    })
    .describe(what)

// Lenient on lengths: the app checks and cuts what it keeps (research R8).
export const InsightsAnswer = z.object({
  insights: z
    .array(
      z.object({
        ref: z
          .string()
          .nullable()
          .describe('The id of the existing insight this updates, such as i2; null for a new one.'),
        theme: z.string().describe('The id of the theme, such as t1, or "other".'),
        statement: Texts('The finding, at most 200 characters, without any name or percentage'),
        description: Texts('What the facts show, at most 1,000 characters'),
        counterEvidence: Texts('What goes against it in the facts, or "None"'),
        minorityView: Texts('A view held by few participants, or "None"'),
        support: z.array(z.string()).describe('The ids of the supporting facts, such as f3.'),
        counter: z.array(z.string()).describe('The ids of the facts that go against it.'),
      }),
    )
    // No maxItems: with the nested lists, some providers reject the schema as too complex.
    .describe('At most 25 new insights, plus the updates.'),
})

export const TranslationAnswer = z.object({
  statement: z.string().nullable(),
  description: z.string().nullable(),
  counterEvidence: z.string().nullable(),
  minorityView: z.string().nullable(),
  action: z.string().nullable(),
  rationale: z.string().nullable(),
  successMeasure: z.string().nullable(),
  text: z.string().nullable(),
})

const Rating = z.enum(['high', 'medium', 'low'])

// Lenient on lengths: the app checks and cuts what it keeps (spec 014 FR-004).
export const RecommendationsAnswer = z.object({
  recommendations: z
    .array(
      z.object({
        ref: z
          .string()
          .nullable()
          .describe(
            'The id of the existing recommendation this updates, such as r2; null for a new one.',
          ),
        action: Texts('What the team should do, at most 200 characters, without any name'),
        rationale: Texts('Why, from the insights, at most 1,000 characters'),
        kind: z
          .enum(['build', 'test', 'investigate'])
          .describe(
            'build when the evidence is strong, test to try it first, investigate to learn more.',
          ),
        impact: Rating,
        effort: Rating,
        successMeasure: Texts('How to know it worked, at most 300 characters'),
        insights: z.array(z.string()).describe('The ids of the insights it rests on, such as i3.'),
      }),
    )
    .describe('At most 15 new recommendations, plus the updates.'),
})

export const TakeawaysAnswer = z.object({
  sentences: z
    .array(Texts('One sentence of the summary'))
    .describe('2 to 4 sentences, no percentage, no name.'),
})

// No name of the app goes here; facts come as lines of refs, codes and statements only.
const INSIGHTS_SYSTEM = `You help a user researcher find insights across the facts of a research project.
Each fact line reads: id | polarity | theme | participant | statement. Participants are codes; several facts can come from one participant.
An insight is a finding that holds across participants and matters to the research goal. Support it with the ids of its facts, and list the facts that go against it.
Always write the counter-evidence and the minority view; write "None" when there is none.
Write each text in English and in French. Never give a percentage or a share: the app computes them. Never name a person.
Cite only the fact ids given. Update an existing insight with its id when new facts belong to it, rather than writing it again.
Never propose again an insight of the list to avoid.
${REGISTERS.insight}

${WRITING_STYLE}`

const TRANSLATION_SYSTEM = `You translate the texts of an insight of a user research project, keeping their meaning and neutral tone.
Answer with the translation of each text given, and null for the others.
${REGISTERS.translation}

${WRITING_STYLE}`

const RECOMMENDATIONS_SYSTEM = `You help a user researcher turn the insights of a research project into recommendations.
Each insight line reads: id | theme | confidence | polarity | participants for and against | statement.
A recommendation says what the team should do, why, and how to know it worked. Rest each one on the ids of the insights given.
Choose build only when the insights are strong, test to try an idea first, investigate to learn more. Rate impact and effort high, medium or low.
Write each text in English and in French. Never name a person, never give a percentage. Update an existing recommendation with its id rather than writing it again.
Never propose again a recommendation of the list to avoid.
${REGISTERS.recommendation}

${WRITING_STYLE}`

const TAKEAWAYS_SYSTEM = `You write the key takeaways of a research project: 2 to 4 short sentences a stakeholder reads first.
Base them only on the insights and recommendations given, weighed with the overview: how many participants back each insight, its confidence, how the insights spread over themes and polarity.
Items marked "to validate" are not verified yet: state them with caution, or leave them out.
When current takeaways are given, revise them: keep what still holds, change only what the insights and recommendations now say differently. Write each sentence in English and in French.
Never give a percentage or a share, never name a person.
${REGISTERS.takeaways}

${WRITING_STYLE}`

const renderRecommendations = (r: RecommendationRequest) =>
  [
    `<goal>${r.goal || '(none)'}</goal>`,
    '<recommendations>',
    ...r.recommendations,
    '</recommendations>',
    '<avoid>',
    ...r.avoid.map((a) => `- ${a}`),
    '</avoid>',
    RECOMMENDATIONS_MARKER,
    ...r.insights,
    '</insight-lines>',
  ].join('\n')

const renderTakeaways = (r: TakeawaysRequest) =>
  [
    TAKEAWAYS_MARKER,
    `<goal>${r.goal || '(none)'}</goal>`,
    `<current-takeaways>${r.current || '(none)'}</current-takeaways>`,
    '<overview>',
    ...r.overview,
    '</overview>',
    '<insights>',
    ...r.insights,
    '</insights>',
    '<recommendations>',
    ...r.recommendations,
    '</recommendations>',
  ].join('\n')

const render = (r: InsightRequest) =>
  [
    `<goal>${r.goal || '(none)'}</goal>`,
    '<themes>',
    ...r.themes.map((t) => `${t.ref}: ${t.title}`),
    'other: Other',
    '</themes>',
    '<insights>',
    ...r.insights.map(
      (i) =>
        `${i.ref} | ${i.theme} | ${i.statement} | support: ${i.support.join(',') || '-'} | counter: ${i.counter.join(',') || '-'}`,
    ),
    '</insights>',
    '<avoid>',
    ...r.avoid.map((s) => `- ${s}`),
    '</avoid>',
    INSIGHTS_MARKER,
    ...r.facts,
    '</fact-lines>',
  ].join('\n')

const failure = (error: unknown) => {
  if (error instanceof AiProviderRequired) return new AiUnavailable()
  if (error instanceof ProviderCallError) return new AiFailed(error.usage !== null)
  return new AiFailed(false)
}

/** The AI of the project insights through the AI Gateway: schema-constrained calls. */
export const createInsightsAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): InsightsAi => ({
  insights: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        INSIGHTS_TASK,
        {
          system: INSIGHTS_SYSTEM,
          prompt: render(request),
          schema: InsightsAnswer,
          maxOutputTokens: 12_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.insights.map((i) => ({ ...i, ref: i.ref ?? undefined }))
    } catch (error) {
      throw failure(error)
    }
  },
  translate: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        TRANSLATION_TASK,
        {
          system: TRANSLATION_SYSTEM,
          prompt: `${TRANSLATION_MARKER}\nfrom: ${request.from}\nto: ${request.to}\n${JSON.stringify(request.texts)}`,
          schema: TranslationAnswer,
          maxOutputTokens: 2_000,
        },
        { ref, timeoutMs: 60_000 },
      )
      return Object.fromEntries(
        Object.entries(object).filter((e): e is [string, string] => typeof e[1] === 'string'),
      )
    } catch (error) {
      throw failure(error)
    }
  },
  recommendations: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        RECOMMENDATIONS_TASK,
        {
          system: RECOMMENDATIONS_SYSTEM,
          prompt: renderRecommendations(request),
          schema: RecommendationsAnswer,
          maxOutputTokens: 10_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.recommendations.map((r) => ({ ...r, ref: r.ref ?? undefined }))
    } catch (error) {
      throw failure(error)
    }
  },
  takeaways: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        TAKEAWAYS_TASK,
        {
          system: TAKEAWAYS_SYSTEM,
          prompt: renderTakeaways(request),
          schema: TakeawaysAnswer,
          maxOutputTokens: 2_000,
        },
        { ref, timeoutMs: 60_000 },
      )
      return object.sentences
    } catch (error) {
      throw failure(error)
    }
  },
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens, calls, task = 'insights') =>
    ai.estimateCost(
      accountId,
      inputChars +
        (task === 'recommendations'
          ? RECOMMENDATIONS_SYSTEM
          : task === 'takeaways'
            ? TAKEAWAYS_SYSTEM
            : INSIGHTS_SYSTEM
        ).length *
          calls,
      outputTokens,
    ),
  costs: (refs) => ai.studyCosts(refs),
})
