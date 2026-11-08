import { REGISTERS, WRITING_STYLE } from '@goodresearch/shared'
import { z } from 'zod'
import {
  AiProviderRequired,
  type Gateway,
  isInvalidAnswer,
  ProviderCallError,
} from '../../../ai-gateway/index.ts'
import {
  AiFailed,
  AiUnavailable,
  type FactRequest,
  type FactsAi,
  type SurveyFactRequest,
  type VerbatimRequest,
} from '../../application/ports.ts'

/** The ledger tasks of spec 012. */
export const VERBATIMS_TASK = 'fact-verbatims'
export const FACTS_TASK = 'facts'
export const TRANSLATION_TASK = 'fact-translation'
/** Spec 029 FR-010a. */
export const SURVEY_FACTS_TASK = 'survey-facts'

/** It runs in the worker: a part may take a while to answer (as a cleaning chunk). */
const TIMEOUT_MS = 120_000

/** Mark the requests for the test provider, which answers them from the prompt (dev, e2e). */
export const VERBATIMS_MARKER = '<interview-turns>'
export const FACTS_MARKER = '<verbatims>'
export const TRANSLATION_MARKER = '<translate>'
export const SURVEY_FACTS_MARKER = '<survey-figures>'

// Lenient on lengths: the app checks and cuts what it keeps (research R6).
export const VerbatimsAnswer = z.object({
  verbatims: z
    .array(
      z.object({
        turn: z.string().describe('The id of the turn, such as t3.'),
        text: z
          .string()
          .describe('The excerpt, copied exactly from the turn: one idea, 3 to 120 words.'),
        reason: z
          .string()
          .nullable()
          .describe('Why it matters to the research goal, in one short sentence.'),
      }),
    )
    .max(60)
    .describe('What the interviewees said that matters; an empty list when nothing does.'),
})

export const FactsAnswer = z.object({
  facts: z
    .array(
      z.object({
        ref: z
          .string()
          .nullable()
          .describe('The id of the existing fact this takes up, such as F2; null for a new one.'),
        statement: z
          .object({
            en: z.string().describe('The fact in English, at most 200 characters.'),
            fr: z.string().describe('The same fact in French, at most 200 characters.'),
          })
          .describe('A short, neutral statement of what the interviewee says, without any name.'),
        polarity: z.enum(['positive', 'negative', 'neutral']),
        theme: z.string().describe('The id of the theme, such as s2, or "other".'),
        verbatims: z
          .array(z.string())
          .describe('The ids of the verbatims that support it, such as v3; ids only.'),
      }),
    )
    // No maxItems: with the nested list of ids, Vertex rejects the schema as too complex (400 INVALID_ARGUMENT).
    .describe('At most 80 facts.'),
})

/** Facts kept from one answer (contracts: at most 80 per batch). */
const FACTS_MAX = 80

export const TranslationAnswer = z.object({ statement: z.string() })

// The app writes each statement from its own figure (spec 029 FR-010a): the AI only points.
export const SurveyFactsAnswer = z.object({
  facts: z
    .array(
      z.object({
        figure: z
          .object({
            itemId: z.string().describe('The id of the question, as listed.'),
            measure: z
              .enum(['option', 'agree', 'disagree', 'mean'])
              .describe('option: the share of one answer; agree, disagree, mean: of a scale.'),
            option: z
              .string()
              .nullable()
              .describe('With option: the answer, copied exactly as listed; otherwise null.'),
          })
          .nullable()
          .describe('A figure worth a fact, or null for a theme.'),
        themeId: z.string().nullable().describe('The id of an accepted theme, or null.'),
        polarity: z.enum(['positive', 'negative', 'neutral']),
      }),
    )
    .describe('At most 10 facts, the most telling first.'),
})

// No name of the app goes here; the turns hold placeholders instead of known names.
const VERBATIMS_SYSTEM = `You help a user researcher analyse an interview transcript.
You get the research goal, the themes of the interview guide and numbered turns, each with who speaks.
Pick the verbatims: excerpts where an interviewee says something that matters to the research goal (a need, a pain, a practice, an opinion, an idea).
Copy each verbatim exactly from its turn, one idea each, from 3 to 120 words. Never reword or summarise.
Never pick words spoken by an interviewer. Turns marked (context) are there to help you understand: pick nothing in them.
Names like "[Person 1]" are placeholders: keep them as they are.`

const FACTS_SYSTEM = `You help a user researcher turn the verbatims of one interview into facts.
A fact is a short, neutral statement of what the interviewee says or does, supported by one or more of the verbatims given.
Group the verbatims that say the same thing into one fact. Write each fact in English and in French, at most 200 characters each.
Never name a person, never use placeholders like "[Person 1]", never add what the verbatims do not say.
Give each fact a polarity (positive, negative or neutral for the interviewee) and the theme it belongs to, or "other".
Some facts of this interview already exist: when one says the same thing, take it up with its id (and the verbatims that support it) rather than writing it again. Never repeat a decided fact.
${REGISTERS.fact}

${WRITING_STYLE}`

const TRANSLATION_SYSTEM = `You translate a short fact of a user research study, keeping its meaning and its neutral tone.
Answer with the translation only, at most 200 characters.
${REGISTERS.translation}

${WRITING_STYLE}`

const SURVEY_FACTS_SYSTEM = `You help a user researcher pick the facts of a survey study.
You get the figures the app computed over the counted responses, and the themes a person accepted in the open answers.
Pick at most 10 figures or themes that say something telling: a clear majority, a split, a low or high score, a frequent theme. Prefer what answers the questions of the study.
Point at each one only: a figure by the id of its question, its measure and, for the share of one answer, that answer copied exactly; a theme by its id. The app writes the statement.
Avoid small bases unless nothing else says it. Never propose again a fact of the list of existing facts.
Give each a polarity: positive, negative or neutral for the respondents.`

const renderSurveyFacts = (r: SurveyFactRequest) =>
  [
    '<existing-facts>',
    ...r.existing,
    '</existing-facts>',
    '<accepted-themes>',
    ...r.themes.map(
      (t) =>
        `${t.id} — "${t.item}": ${t.label} (${t.answers} of ${t.base} answers). ${t.description}`,
    ),
    '</accepted-themes>',
    SURVEY_FACTS_MARKER,
    r.figures,
    '</survey-figures>',
  ].join('\n')

const renderVerbatims = (r: VerbatimRequest) =>
  [
    `<goal>${r.goal || '(none)'}</goal>`,
    '<themes>',
    ...r.themes.map((t) => `- ${t}`),
    '</themes>',
    VERBATIMS_MARKER,
    ...r.turns.map((t) => `${t.id}${t.context ? ' (context)' : ''} — ${t.speaker}: ${t.text}`),
    '</interview-turns>',
  ].join('\n')

const renderFacts = (r: FactRequest) =>
  [
    `<goal>${r.goal || '(none)'}</goal>`,
    '<themes>',
    ...r.themes.map((t) => `${t.id}: ${t.title}`),
    '</themes>',
    '<existing-facts>',
    ...r.existing.map(
      (f) =>
        `${f.ref} (${f.status}) | ${f.polarity} | ${f.theme} | ${f.statement}${f.verbatims.length > 0 ? ` | verbatims ${f.verbatims.join(',')}` : ''}`,
    ),
    '</existing-facts>',
    FACTS_MARKER,
    ...r.verbatims.map((v) => `${v.id} — ${v.speaker}: ${v.text}`),
    '</verbatims>',
  ].join('\n')

const failure = (error: unknown) => {
  if (error instanceof AiProviderRequired) return new AiUnavailable()
  if (error instanceof ProviderCallError) return new AiFailed(isInvalidAnswer(error))
  return new AiFailed(false)
}

/** The AI of the Analysis phase through the AI Gateway: schema-constrained calls. */
export const createFactsAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): FactsAi => ({
  verbatims: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        VERBATIMS_TASK,
        {
          system: VERBATIMS_SYSTEM,
          prompt: renderVerbatims(request),
          schema: VerbatimsAnswer,
          maxOutputTokens: 8_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.verbatims
    } catch (error) {
      throw failure(error)
    }
  },
  facts: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        FACTS_TASK,
        {
          system: FACTS_SYSTEM,
          prompt: renderFacts(request),
          schema: FactsAnswer,
          maxOutputTokens: 12_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.facts.slice(0, FACTS_MAX).map((f) => ({ ...f, ref: f.ref ?? undefined }))
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
          prompt: `${TRANSLATION_MARKER}\nfrom: ${request.from}\nto: ${request.to}\n${request.text}`,
          schema: TranslationAnswer,
          maxOutputTokens: 400,
        },
        { ref, timeoutMs: 30_000 },
      )
      return object.statement
    } catch (error) {
      throw failure(error)
    }
  },
  surveyFacts: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        SURVEY_FACTS_TASK,
        {
          system: SURVEY_FACTS_SYSTEM,
          prompt: renderSurveyFacts(request),
          schema: SurveyFactsAnswer,
          maxOutputTokens: 2_000,
        },
        // A person waits for it in the Analysis tab.
        { ref, timeoutMs: 60_000 },
      )
      return object.facts.slice(0, 20)
    } catch (error) {
      throw failure(error)
    }
  },
  surveyEstimate: (accountId, inputChars) =>
    ai.estimateCost(accountId, inputChars + SURVEY_FACTS_SYSTEM.length, 2_000),
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens, calls) =>
    ai.estimateCost(
      accountId,
      inputChars + (VERBATIMS_SYSTEM.length + FACTS_SYSTEM.length) * calls,
      outputTokens,
    ),
  costs: (refs) => ai.studyCosts(refs),
})
