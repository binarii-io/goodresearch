import { err, holdsName, ok, type Result } from '@goodresearch/shared'
import { type Polarity, STATEMENT_MAX, type Statement, type Translation } from './facts.ts'

/**
 * Spec 038: a fact from an observation of a usability test session a person accepted or edited.
 * Its evidence is the observation's moment, its verified quote and its screenshot, not transcript
 * verbatims; its theme is the protocol task.
 */
export type UsabilityFact = {
  readonly id: string
  readonly observationId: string
  readonly studyId: string
  readonly sessionId: string
  readonly statement: Statement
  readonly translation: Translation
  readonly polarity: Polarity
  readonly theme: { readonly id: string; readonly title: string }
  readonly origin: 'ai' | 'person'
  readonly status: 'accepted' | 'edited'
  readonly support: {
    readonly quote: string | null
    readonly momentMs: number
    readonly screenshotKey: string | null
    /** The participant's code or name as the session gives it; null when unknown. */
    readonly participant: string | null
  }
  readonly decidedBy: string
  readonly decidedAt: Date
  readonly version: number
}

export type ObservationFactInput = {
  readonly accountId: string
  readonly observationId: string
  readonly studyId: string
  readonly sessionId: string
  readonly statement: string
  readonly language: 'en' | 'fr'
  readonly polarity: Polarity
  readonly theme: { readonly id: string; readonly title: string }
  readonly quote: string | null
  readonly momentMs: number
  readonly screenshotKey: string | null
  readonly participant: string | null
  readonly origin: 'ai' | 'person'
}

/** Ledger ref of a usability fact's translation: shown with its session's analysis cost. */
export const usabilityTranslationRef = (sessionId: string) => `usability-analysis:${sessionId}`

/**
 * The fact of an observation, new or updated: the statement in the language written, the other one
 * translated behind (`translating`) unless it is unchanged. Refused when empty, too long or
 * holding a name the app knows.
 */
export const observationFact = (
  input: ObservationFactInput,
  current: UsabilityFact | null,
  names: readonly string[],
  at: Date,
  newId: () => string,
): Result<{ fact: UsabilityFact; translate: boolean }, 'VALIDATION' | 'NAME_IN_STATEMENT'> => {
  const text = input.statement.trim().slice(0, STATEMENT_MAX)
  if (text.length === 0) return err('VALIDATION')
  if (holdsName(text, names)) return err('NAME_IN_STATEMENT')
  const other = input.language === 'en' ? 'fr' : 'en'
  const same = current?.statement[input.language] === text
  const statement = {
    [input.language]: text,
    [other]: same && current ? current.statement[other] : '',
  } as Statement
  const translate = !same || current?.translation === 'not-translated'
  return ok({
    translate,
    fact: {
      id: current?.id ?? newId(),
      observationId: input.observationId,
      studyId: input.studyId,
      sessionId: input.sessionId,
      statement,
      translation: translate ? 'translating' : (current?.translation ?? 'done'),
      polarity: input.polarity,
      theme: input.theme,
      origin: input.origin,
      status: input.origin === 'person' ? 'edited' : 'accepted',
      support: {
        quote: input.quote,
        momentMs: Math.max(0, Math.round(input.momentMs)),
        screenshotKey: input.screenshotKey,
        participant: input.participant,
      },
      decidedBy: input.accountId,
      decidedAt: at,
      version: (current?.version ?? 0) + 1,
    },
  })
}

/** What a usability fact shows as its evidence line: its quote, else the moment it was seen. */
export const evidenceLine = (f: Pick<UsabilityFact, 'support'>): string => {
  if (f.support.quote) return f.support.quote
  const s = Math.floor(f.support.momentMs / 1000)
  return `Seen at ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
