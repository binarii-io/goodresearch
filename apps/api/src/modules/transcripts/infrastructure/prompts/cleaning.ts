import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import {
  AiFailed,
  AiUnavailable,
  type CleaningAi,
  type CleaningRequest,
} from '../../application/ports.ts'

/** The ledger task of the cleanings (spec 011). */
export const CLEANING_TASK = 'cleaning'

/** It runs in the worker: a chunk may take a while to answer (as a lexicon batch). */
const CLEANING_TIMEOUT_MS = 120_000

/** Marks the request for the test provider, which answers it from the turns (dev, e2e). */
export const CLEANING_MARKER = '<turns>'

// Lenient on lengths: the app narrows and cuts what it keeps (research R4).
export const CleaningAnswer = z.object({
  corrections: z
    .array(
      z.object({
        turn: z.string().describe('The id of the turn, such as t3.'),
        kind: z
          .enum(['term', 'transcription', 'speaker', 'name'])
          .describe(
            'term: a spelling of a known term; transcription: a misheard or mistyped word; speaker: the turn is spoken by another speaker; name: a person’s name to hide.',
          ),
        original: z
          .string()
          .describe(
            'The words to change, copied exactly from the turn (for a speaker: the speaker).',
          ),
        before: z
          .string()
          .nullable()
          .describe('Up to 5 words written just before the original in the turn, or null.'),
        replacement: z.string().describe('What it should read (for a speaker: the right speaker).'),
        reason: z
          .string()
          .nullable()
          .describe('Why, in one short sentence (at most 200 characters).'),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    )
    .describe('Only real errors; an empty list when the turns are right.'),
  decisions: z
    .array(
      z.object({
        occurrence: z.string().describe('The id of the place, such as o2.'),
        isTerm: z.boolean().describe('True when the word written there means the term.'),
        reason: z.string().nullable(),
      }),
    )
    .describe('One answer for each place to decide.'),
})

// No name of the app goes here; the turns hold placeholders instead of known names.
const SYSTEM = `You correct interview transcripts made by a transcription tool, without rewriting them.
You get the team's terms, the speakers, some places to decide, and numbered turns.
Propose a correction only for a real transcription error: a misheard or mistyped word, a known term written another way, or a turn given to the wrong speaker.
Never reword, summarise, fix grammar or style, or change the meaning. One correction changes at most 8 words of one turn.
Copy the original exactly from the turn, with the words just before it when the turn holds it more than once.
Names like "[Person 1]" are placeholders: never change them and never use them in a replacement, except to name a speaker.
Turns marked (context) are there to help you understand: do not correct them.
For each place to decide, say whether the word written there means the term, from its context.`

const NAME_RULE = `Names of other people (not placeholders) may be hidden with the kind "name".`

const render = (r: CleaningRequest) =>
  [
    '<terms>',
    ...r.terms.map(
      (t) =>
        `- ${t.form}${t.variants.length ? ` (also written: ${t.variants.join(', ')})` : ''}${t.definition ? `: ${t.definition}` : ''}${t.scope === 'case-by-case' ? ' [only in some places]' : ''}`,
    ),
    '</terms>',
    '<speakers>',
    ...r.speakers.map((s) => `- ${s}`),
    '</speakers>',
    '<decide>',
    ...r.chunk.occurrences.map(
      (o) => `${o.id} in ${o.turn}: is "${o.spelling}" the term "${o.form}"?`,
    ),
    '</decide>',
    CLEANING_MARKER,
    ...r.chunk.turns.map(
      (t) =>
        `${t.id}${t.context ? ' (context)' : ''} — ${t.speakerSent ?? '(no speaker)'}: ${t.sent}`,
    ),
    '</turns>',
  ].join('\n')

/** The AI of the cleanings through the AI Gateway: one schema-constrained call per chunk. */
export const createCleaningAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject'>
}): CleaningAi => ({
  correct: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        CLEANING_TASK,
        {
          system: request.anonymised ? `${SYSTEM}\n${NAME_RULE}` : SYSTEM,
          prompt: render(request),
          schema: CleaningAnswer,
          maxOutputTokens: 8_000,
        },
        { ref, timeoutMs: CLEANING_TIMEOUT_MS },
      )
      return object
    } catch (error) {
      if (error instanceof AiProviderRequired) throw new AiUnavailable()
      if (error instanceof ProviderCallError) throw new AiFailed(error.usage !== null)
      throw new AiFailed(false)
    }
  },
})
