import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import {
  AiFailed,
  AiUnavailable,
  type QualityAi,
  type ReviewRequest,
} from '../../application/ports.ts'

/** The ledger task of spec 016. */
export const REVIEW_TASK = 'interview-review'

/** It runs in the worker: a part may take a while to answer (as a cleaning chunk). */
const TIMEOUT_MS = 120_000

/** Marks the requests for the test provider, which answers them from the prompt (dev, e2e). */
export const REVIEW_MARKER = '<review-turns>'

// Lenient on lengths: the app checks and cuts what it keeps.
export const ReviewAnswer = z.object({
  sentences: z
    .array(
      z.object({
        id: z.string().describe('The id of the sentence, such as t3.2.'),
        kind: z
          .enum(['question', 'simple-reformulation', 'other'])
          .describe('What the sentence does.'),
        flag: z
          .object({
            kind: z.enum(['leading-question', 'reformulation-with-opinion', 'opinion']),
            reason: z
              .object({
                en: z.string().describe('Why, in English, at most 200 characters.'),
                fr: z.string().describe('The same reason in French, at most 200 characters.'),
              })
              .describe('Why this sentence orients the answer.'),
            recommendation: z
              .string()
              .nullable()
              .describe('A neutral wording, in the language of the interview.'),
            addedElement: z
              .string()
              .nullable()
              .describe(
                'For a reformulation with opinion: what it adds that the interviewee did not say.',
              ),
            excerpt: z
              .string()
              .nullable()
              .describe(
                'Only for a very long sentence: the words concerned, copied exactly from it; else null.',
              ),
          })
          .nullable()
          .describe('Only when the sentence orients the answer; else null.'),
      }),
    )
    // No maxItems: with the nested objects, Vertex rejects the schema as too complex (as the facts).
    .describe('Only the sentences that are a question, a reformulation or flagged.'),
})

// No name of the app goes here; the turns hold placeholders instead of known names. No example
// sentence either: the model copies them (spec 010).
export const REVIEW_SYSTEM = `You help a user researcher check how an interview was conducted.
You get the research goal, the questions of the interview guide and numbered turns with who speaks. In the interviewers' turns, sentences have their own ids: you answer only on those. Turns marked (context) are there to help you understand.

For each sentence, tell its kind:
- question: it asks something;
- simple-reformulation: the interviewer restates what the interviewee said, to check they understood;
- other: anything else. Leave those out of your answer unless you flag them.

A simple reformulation is good interviewing practice and is never flagged, whatever its wording: other words than the interviewee's, a summary, a question mark or a request to confirm do not make it leading.

Flag a sentence only when it orients the answer:
- leading-question: the question suggests the answer it expects, or takes for granted something the interviewee did not say;
- reformulation-with-opinion: the reformulation adds an idea, a cause or a judgement the interviewee did not express anywhere before it; name exactly what it adds;
- opinion: the interviewer gives their own opinion, or suggests a solution or an answer.

Asking a closed question to check a fact the interviewee stated is not leading. Reading a guide question aloud does not excuse it: judge the sentence itself. When in doubt, flag nothing.

For each flag, give the reason in English and in French, at most 200 characters each, and a neutral wording in the language of the interview.
Names like "[Person 1]" are placeholders: keep them as they are.`

const renderTurn = (t: ReviewRequest['turns'][number]) => {
  const head = `${t.id}${t.context ? ' (context)' : ''} — ${t.speaker}:`
  if (t.sentences.length === 0) return `${head} ${t.text}`
  return [head, ...t.sentences.map((s) => `  ${s.id}: ${s.text}`)].join('\n')
}

export const renderReview = (r: ReviewRequest) =>
  [
    `<goal>${r.goal || '(none)'}</goal>`,
    '<guide>',
    ...r.guide.map((q) => `- ${q}`),
    '</guide>',
    REVIEW_MARKER,
    ...r.turns.map(renderTurn),
    '</review-turns>',
  ].join('\n')

const failure = (error: unknown) => {
  if (error instanceof AiProviderRequired) return new AiUnavailable()
  if (error instanceof ProviderCallError) return new AiFailed(error.usage !== null)
  return new AiFailed(false)
}

/** The AI of the review through the AI Gateway: schema-constrained calls. */
export const createQualityAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): QualityAi => ({
  review: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        REVIEW_TASK,
        {
          system: REVIEW_SYSTEM,
          prompt: renderReview(request),
          schema: ReviewAnswer,
          // A long part went past 8,000 and its cut answer failed the interview.
          maxOutputTokens: 16_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.sentences.map((s) => ({ id: s.id, kind: s.kind, flag: s.flag ?? undefined }))
    } catch (error) {
      throw failure(error)
    }
  },
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens, calls) =>
    ai.estimateCost(accountId, inputChars + REVIEW_SYSTEM.length * calls, outputTokens),
  costs: (refs) => ai.studyCosts(refs),
})
