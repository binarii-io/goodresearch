import { REGISTERS, WRITING_STYLE } from '@goodresearch/shared'
import { z } from 'zod'
import { AiProviderRequired, type Gateway, ProviderCallError } from '../../../ai-gateway/index.ts'
import { AiFailed, AiUnavailable, type ThemesAi } from '../../application/ports.ts'

/** The ledger tasks of spec 029. */
export const THEMES_TASK = 'survey-themes'
export const THEMES_MERGE_TASK = 'survey-themes-merge'
export const THEMES_TRANSLATION_TASK = 'survey-themes-translation'

/** It runs in the worker: a part of 150 answers may take a while. */
const TIMEOUT_MS = 120_000

/** Mark the requests for the test provider, which answers them from the prompt (dev, e2e). */
export const THEMES_MARKER = '<open-answers>'
export const MERGE_MARKER = '<themes-to-merge>'
export const TRANSLATE_MARKER = '<translate-theme>'

const Bilingual = (what: string) =>
  z.object({
    en: z.string().describe(`${what}, in English`),
    fr: z.string().describe(`${what}, in French`),
  })

// Lenient on lengths and counts: the app checks and cuts what it keeps (spec 029 FR-008).
export const ThemesAnswer = z.object({
  themes: z.array(
    z.object({
      label: Bilingual('A short label of 2 to 6 words'),
      description: Bilingual('One or two neutral sentences on what these answers say'),
      answers: z
        .array(
          z.object({
            n: z.number().int().describe('The number of an answer of the list'),
            quote: z
              .string()
              .nullable()
              .describe('An exact excerpt of that answer, copied as is, or null'),
          }),
        )
        .describe('Every answer of this theme; an answer in one theme only'),
      existing: z
        .string()
        .nullable()
        .describe('The id of an existing theme these answers join, or null for a new theme'),
    }),
  ),
})

export const MergeAnswer = z.object({
  merges: z.array(
    z.object({
      keep: z.string().describe('The ref of the theme to keep, such as t1'),
      merge: z.array(z.string()).describe('The refs of the themes that say the same'),
    }),
  ),
})

export const ThemeTranslationAnswer = z.object({ text: z.string() })

// No name of the app goes here; answers come masked (ADR-0012).
const THEMES_SYSTEM = `You help a user researcher read the open answers to one question of a survey.
Group the answers into themes: what several respondents say, in their own terms. Each theme has a short label and a neutral description, in English and in French.
List every answer of a theme by its number, and quote an exact excerpt of it when one says the theme well; never reword a quote.
Answers hold marks such as [Person 1], [email] or [link] instead of what was masked: keep them as they are, never guess what they hide.
Never propose again a theme of the list to avoid. An answer that fits no theme stays out.
${REGISTERS.insight}

${WRITING_STYLE}`

const MERGE_SYSTEM = `You help a user researcher tidy themes found in several parts of a survey's open answers.
Say which themes say the same thing, keeping one of each group. Leave the others alone.`

const TRANSLATION_SYSTEM = `You translate the label or description of a theme of survey answers, keeping its meaning and its neutral tone.
Answer with the translation only.
${REGISTERS.translation}`

const failure = (error: unknown) => {
  if (error instanceof AiProviderRequired) return new AiUnavailable()
  if (error instanceof ProviderCallError) return new AiFailed(error.usage !== null)
  return new AiFailed(false)
}

export const renderThemes = (r: Parameters<ThemesAi['themes']>[2]) =>
  [
    `<question>\n${r.item}\n</question>`,
    `<themes-to-avoid>\n${r.rejected.join('\n')}\n</themes-to-avoid>`,
    `<existing-themes>\n${r.existing.map((e) => `${e.id} — ${e.label}`).join('\n')}\n</existing-themes>`,
    THEMES_MARKER,
    ...r.answers.map((a) => `${a.number}. ${a.text}`),
    '</open-answers>',
  ].join('\n')

/** Themes of open answers through the AI Gateway: schema-constrained calls. */
export const createThemesAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(accountId: string, inputChars: number, outputTokens: number): Promise<number | null>
}): ThemesAi => ({
  themes: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        THEMES_TASK,
        {
          system: THEMES_SYSTEM,
          prompt: renderThemes(request),
          schema: ThemesAnswer,
          maxOutputTokens: 12_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.themes
    } catch (error) {
      throw failure(error)
    }
  },
  merge: async (accountId, ref, themes) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        THEMES_MERGE_TASK,
        {
          system: MERGE_SYSTEM,
          prompt: [
            MERGE_MARKER,
            ...themes.map((t) => `${t.ref} — ${t.label}: ${t.description}`),
            '</themes-to-merge>',
          ].join('\n'),
          schema: MergeAnswer,
          maxOutputTokens: 2_000,
        },
        { ref, timeoutMs: TIMEOUT_MS },
      )
      return object.merges
    } catch (error) {
      throw failure(error)
    }
  },
  translate: async (accountId, ref, request) => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        THEMES_TRANSLATION_TASK,
        {
          system: TRANSLATION_SYSTEM,
          prompt: `${TRANSLATE_MARKER}\nfrom: ${request.from}\nto: ${request.to}\n${request.text}`,
          schema: ThemeTranslationAnswer,
          maxOutputTokens: 600,
        },
        { ref, timeoutMs: 30_000 },
      )
      return object.text
    } catch (error) {
      throw failure(error)
    }
  },
  providerOf: (accountId) => ai.gateway().providerOf(accountId),
  estimate: (accountId, inputChars, outputTokens, calls) =>
    ai.estimateCost(accountId, inputChars + THEMES_SYSTEM.length * calls, outputTokens),
})
