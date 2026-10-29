import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import {
  AiFailed,
  AiUnavailable,
  type InsightRequest,
  type InsightsAi,
} from '../../application/ports.ts'

/** The ledger tasks of spec 013. */
export const INSIGHTS_TASK = 'insights'
export const TRANSLATION_TASK = 'insight-translation'

/** It runs in the worker: a call over hundreds of facts may take a while. */
const TIMEOUT_MS = 180_000

/** Mark the requests for the test provider, which answers them from the prompt (dev, e2e). */
export const INSIGHTS_MARKER = '<fact-lines>'
export const TRANSLATION_MARKER = '<translate-insight>'

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
})

// No name of the app goes here; facts come as lines of refs, codes and statements only.
const INSIGHTS_SYSTEM = `You help a user researcher find insights across the facts of a research project.
Each fact line reads: id | polarity | theme | participant | statement. Participants are codes; several facts can come from one participant.
An insight is a finding that holds across participants and matters to the research goal. Support it with the ids of its facts, and list the facts that go against it.
Always write the counter-evidence and the minority view; write "None" when there is none.
Write each text in English and in French. Never give a percentage or a share: the app computes them. Never name a person.
Cite only the fact ids given. Update an existing insight with its id when new facts belong to it, rather than writing it again.
Never propose again an insight of the list to avoid.`

const TRANSLATION_SYSTEM = `You translate the texts of an insight of a user research project, keeping their meaning and neutral tone.
Answer with the translation of each text given, and null for the others.`

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
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens, calls) =>
    ai.estimateCost(accountId, inputChars + INSIGHTS_SYSTEM.length * calls, outputTokens),
  costs: (refs) => ai.studyCosts(refs),
})
