import { z } from 'zod'
import {
  AiProviderRequired,
  type Gateway,
  isAuthorisationFailure,
  ProviderCallError,
} from '../../../ai-gateway/index.ts'
import { AiFailed, AiUnavailable, type LexiconAi } from '../../application/ports.ts'
import type { Batch } from '../../domain/excerpts.ts'

/** The ledger task of the lexicon readings (spec 010). */
export const LEXICON_TASK = 'lexicon'

/**
 * A batch's answer lists tens of terms with definitions: longer than a chat answer. It runs in the
 * worker, so it may wait (the default limit is for calls a person waits on).
 */
const LEXICON_TIMEOUT_MS = 120_000

/** Marks the request for the test provider, which answers it from the candidates (dev, e2e). */
export const LEXICON_MARKER = '<candidates>'

// Lenient on lengths: an answer slightly too long is cut by the app, not refused (it is billed).
export const LexiconAnswer = z.object({
  terms: z
    .array(
      z.object({
        form: z
          .string()
          .describe(
            'The correct spelling of the term. For a transcription error, the spelling as written.',
          ),
        kind: z
          .enum(['domain', 'suspect'])
          .describe(
            'domain: a real term of the field to keep; suspect: a word the transcription tool probably misheard.',
          ),
        correction: z
          .string()
          .nullable()
          .describe('For a suspect term: what the speaker most probably said; otherwise null.'),
        category: z.enum([
          'product',
          'organisation',
          'place',
          'acronym',
          'jargon',
          'role',
          'person',
          'other',
        ]),
        definition: z
          .string()
          .nullable()
          .describe('What it means, in one short sentence (at most 200 characters), or null.'),
        variants: z
          .array(z.string())
          .describe('The candidates, copied exactly, that are spellings of this term.'),
        existingTerm: z
          .string()
          .nullable()
          .describe('One of the known terms when these candidates are its spellings; else null.'),
        quote: z
          .string()
          .describe('A short exact excerpt (at most 200 characters) where the term appears.'),
      }),
    )
    .describe('Only the candidates that are terms; leave out ordinary words.'),
})

// No name of the app goes here; the excerpts hold placeholders instead of known names.
const SYSTEM = `You build the vocabulary of a research team from interview transcripts.
You get candidate words found in the transcripts, each with short excerpts, and the team's known terms.
Group the candidates that are spellings of the same term (typos, spaces, case, mishearings) and give for each term its correct form, its kind, a category, a short definition and its variants.
Leave out ordinary words, fillers and interjections. Names like "[Person 1]" are placeholders: never use them as terms.
A candidate close to a known term is usually one of its spellings: then give that known term as existingTerm.
Variants must be copied exactly from the candidates. The quote must be copied exactly from one excerpt.
Never invent a term, a variant or a quote.`

const render = (batch: Batch) =>
  [
    LEXICON_MARKER,
    ...batch.candidates.map(
      (c) => `- ${c.spelling}\n${c.excerpts.map((e) => `  > ${e}`).join('\n')}`,
    ),
    '</candidates>',
    batch.knownForms.length
      ? `<known-terms>\n${batch.knownForms.map((f) => `- ${f}`).join('\n')}\n</known-terms>`
      : '<known-terms></known-terms>',
  ].join('\n')

/** The AI of the lexicon readings through the AI Gateway: one schema-constrained call per batch. */
export const createLexiconAi = (ai: {
  /** Read at each call: the gateway may be built after this module. */
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): LexiconAi => ({
  propose: async (accountId, ref, batch) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        LEXICON_TASK,
        {
          system: SYSTEM,
          prompt: render(batch),
          schema: LexiconAnswer,
          // A ceiling, not a cost: thinking models count their reasoning in the output, and a
          // cut answer cannot be read (4,000 cut answers of 30 terms).
          maxOutputTokens: 16_000,
        },
        { ref, timeoutMs: LEXICON_TIMEOUT_MS },
      )
      return object.terms
    } catch (error) {
      if (error instanceof AiProviderRequired) throw new AiUnavailable()
      // Access refused: the next batches would fail the same way, the reading stops asking.
      if (error instanceof ProviderCallError && isAuthorisationFailure(error.failure))
        throw new AiUnavailable()
      // An answer that came back (tokens counted) but does not fit the schema.
      if (error instanceof ProviderCallError) throw new AiFailed(error.usage !== null)
      throw new AiFailed(false)
    }
  },
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  // The instructions go with every batch.
  estimate: (accountId, inputChars, outputTokens, calls) =>
    ai.estimateCost(accountId, inputChars + SYSTEM.length * calls, outputTokens),
  costs: (refs) => ai.studyCosts(refs),
})
