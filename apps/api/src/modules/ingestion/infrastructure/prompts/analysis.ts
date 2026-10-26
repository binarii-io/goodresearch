import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import { AiFailed, AiUnavailable, type Analyzer } from '../../application/ports.ts'

/** The ledger task of the analyses (spec 009). */
export const ANALYSIS_TASK = 'session-analysis'

/** Marks the request for the test provider, which answers it from the transcript (dev, e2e). */
export const ANALYSIS_MARKER = '<transcript>'

// Lenient on lengths: an answer slightly too long is cut by the app, not refused (it is billed).
const Person = z.object({
  name: z
    .string()
    .describe('First name and last name only, without company, site, team, job title or tags.'),
  quote: z
    .string()
    .describe('A short exact excerpt of the transcript (one sentence, at most 200 characters).'),
})

/** Schema-constrained answer (constitution IV); the app checks every quote. */
export const AnalysisAnswer = z.object({
  interviewees: z.array(Person).describe('The people interviewed.'),
  interviewers: z.array(Person).describe('The people conducting the interview.'),
  date: z
    .object({
      value: z.string().describe('The date of the interview, YYYY-MM-DD.'),
      quote: z.string(),
    })
    .nullable()
    .describe('Only when the transcript says it; otherwise null.'),
})

// No name of the app goes here: the schedule and the team stay in the app (research R4).
const SYSTEM = `You read the beginning of a research interview transcript.
Find who was interviewed, who conducted the interview, and the date of the interview when the text gives it.
Interviewers present the study, ask for consent, ask the questions and lead the conversation; interviewees answer about themselves, their work and their habits.
The first person to speak, often at length, is usually an interviewer: never take someone for the interviewee only because they speak first or alone.
A title like "A / B - Interview topic" lists the participants, not their roles.
Give each person as first name and last name only, as a person would write them: leave out what meeting tools add to names (company, site, office, team, job title, version, brackets or dashes).
Names like "[Person 1]" are placeholders: return them exactly as written.
For each answer, give a short quote copied exactly from the transcript (one sentence, at most 200 characters).
Give nothing you cannot quote. Never invent names or dates.`

/** The AI of the analyses through the AI Gateway: one schema-constrained call per analysis. */
export const createAiAnalyzer = (ai: {
  /** Read at each call: the gateway may be built after this module. */
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): Analyzer => ({
  analyze: async (accountId, ref, text) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        ANALYSIS_TASK,
        {
          system: SYSTEM,
          prompt: `${ANALYSIS_MARKER}\n${text}\n</transcript>`,
          schema: AnalysisAnswer,
          // A ceiling, not a cost: models that think count it in the output (spec 009, a cut
          // answer cannot be read).
          maxOutputTokens: 4_000,
        },
        { ref },
      )
      return object
    } catch (error) {
      if (error instanceof AiProviderRequired) throw new AiUnavailable()
      if (error instanceof ProviderCallError) throw new AiFailed(error.failure)
      throw new AiFailed('UNKNOWN')
    }
  },
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens) =>
    ai.estimateCost(accountId, inputChars + SYSTEM.length, outputTokens),
  costs: (refs) => ai.studyCosts(refs),
})
