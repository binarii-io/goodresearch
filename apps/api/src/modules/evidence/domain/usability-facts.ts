import { err, holdsName, ok, type Result } from '@goodresearch/shared'
import {
  type FactError,
  type FactStatus,
  type GivenStatement,
  type Polarity,
  reopened,
  STATEMENT_MAX,
  type Statement,
  statementOf,
  type Translation,
} from './facts.ts'

/** Spec 039: the decided outcomes of a task across a study's sessions. */
export type TaskOutcomes = {
  readonly success: number
  readonly partial: number
  readonly failure: number
  readonly notAttempted: number
}

/** An observation of a session: its moment, verified quote and screenshot (spec 038). */
export type ObservationSupport = {
  readonly kind: 'observation'
  readonly observationId: string
  readonly quote: string | null
  readonly momentMs: number
  readonly screenshotKey: string | null
  /** The participant's code or name as the session gives it; null when unknown. */
  readonly participant: string | null
}

/** Spec 039: a task's decided outcomes across the study's sessions. */
export type TaskSupport = {
  readonly kind: 'task'
  readonly taskId: string
  readonly outcomes: TaskOutcomes
  readonly sessions: number
  /** The counts changed after a person decided the fact: it is to decide again. */
  readonly figuresChanged: boolean
}

/**
 * A fact of a usability test study (specs 038, 039), with the lifecycle of every fact: to decide
 * (`proposed`), accepted, edited, rejected. From an observation of a session (decided with it), or
 * from a task's outcomes across the sessions; its theme is the protocol task.
 */
export type UsabilityFact = {
  readonly id: string
  readonly studyId: string
  /** The observation's session; null for a task fact. */
  readonly sessionId: string | null
  readonly statement: Statement
  readonly translation: Translation
  readonly polarity: Polarity
  readonly theme: { readonly id: string; readonly title: string }
  readonly origin: 'ai' | 'person'
  readonly status: FactStatus
  readonly support: ObservationSupport | TaskSupport
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
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
  /** Spec 039: the observation's status; its fact has the same. */
  readonly status: FactStatus
  /** Who decided the observation and when; null while it is to decide. */
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
}

/** Ledger ref of a usability fact's translation: shown with its session's analysis cost. */
export const usabilityTranslationRef = (sessionId: string) => `usability-analysis:${sessionId}`

/** Spec 039: ledger ref of a task fact's translation, counted in the study's analysis cost. */
export const usabilityStudyRef = (studyId: string) => `usability-study:${studyId}`

/**
 * The fact of an observation, new or updated, with the observation's status (spec 039): the
 * statement in the language written, the other one translated behind (`translating`) unless it is
 * unchanged. Refused when empty, too long or holding a name the app knows.
 */
export const observationFact = (
  input: ObservationFactInput,
  current: UsabilityFact | null,
  names: readonly string[],
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
      studyId: input.studyId,
      sessionId: input.sessionId,
      statement,
      translation: translate ? 'translating' : (current?.translation ?? 'done'),
      polarity: input.polarity,
      theme: input.theme,
      origin: input.origin,
      status: input.status,
      support: {
        kind: 'observation',
        observationId: input.observationId,
        quote: input.quote,
        momentMs: Math.max(0, Math.round(input.momentMs)),
        screenshotKey: input.screenshotKey,
        participant: input.participant,
      },
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      version: (current?.version ?? 0) + 1,
    },
  })
}

const sum = (o: TaskOutcomes) => o.success + o.partial + o.failure + o.notAttempted

/**
 * Spec 039 FR-008a: a task's polarity from its outcomes: negative when failures and non-attempts
 * are at least half of the sessions, positive when successes are at least 80 %, neutral otherwise.
 */
export const taskPolarity = (o: TaskOutcomes): Polarity => {
  const n = sum(o)
  if (n === 0) return 'neutral'
  if ((o.failure + o.notAttempted) * 2 >= n) return 'negative'
  if (o.success * 5 >= n * 4) return 'positive'
  return 'neutral'
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The statement of a task fact, written by the app in both languages (no AI). */
export const taskStatement = (
  task: { index: number; instruction: string },
  o: TaskOutcomes,
): Statement => {
  const n = sum(o)
  const en = [
    o.success ? count(o.success, 'success', 'successes') : null,
    o.partial ? count(o.partial, 'partial success', 'partial successes') : null,
    o.failure ? count(o.failure, 'failure', 'failures') : null,
    o.notAttempted ? count(o.notAttempted, 'not attempted', 'not attempted') : null,
  ].filter(Boolean)
  const fr = [
    o.success ? count(o.success, 'réussite', 'réussites') : null,
    o.partial ? count(o.partial, 'réussite partielle', 'réussites partielles') : null,
    o.failure ? count(o.failure, 'échec', 'échecs') : null,
    o.notAttempted ? count(o.notAttempted, 'non tentée', 'non tentées') : null,
  ].filter(Boolean)
  const title = task.instruction.trim().slice(0, 200)
  return {
    en: `Task ${task.index} — ${title}: ${en.join(', ')} out of ${count(n, 'session', 'sessions')}.`.slice(
      0,
      STATEMENT_MAX,
    ),
    fr: `Tâche ${task.index} — ${title} : ${fr.join(', ')} sur ${count(n, 'séance', 'séances')}.`.slice(
      0,
      STATEMENT_MAX,
    ),
  }
}

export type TaskFactInput = {
  readonly studyId: string
  readonly task: { readonly id: string; readonly index: number; readonly instruction: string }
  readonly outcomes: TaskOutcomes
}

const sameOutcomes = (a: TaskOutcomes, b: TaskOutcomes) =>
  a.success === b.success &&
  a.partial === b.partial &&
  a.failure === b.failure &&
  a.notAttempted === b.notAttempted

/**
 * Spec 039 FR-008a: the fact of a task, new or updated, or null when unchanged. While it is to
 * decide, its statement follows the counts; once decided, a change of the counts sends it back to
 * decide, marked `figuresChanged`; a person's edited statement is kept until the counts change.
 */
export const taskFact = (
  input: TaskFactInput,
  current: UsabilityFact | null,
  newId: () => string,
): UsabilityFact | null => {
  const statement = taskStatement(input.task, input.outcomes)
  const sessions = sum(input.outcomes)
  const support = (figuresChanged: boolean): TaskSupport => ({
    kind: 'task',
    taskId: input.task.id,
    outcomes: input.outcomes,
    sessions,
    figuresChanged,
  })
  if (!current)
    return {
      id: newId(),
      studyId: input.studyId,
      sessionId: null,
      statement,
      translation: 'done',
      polarity: taskPolarity(input.outcomes),
      theme: { id: input.task.id, title: input.task.instruction },
      origin: 'ai',
      status: 'proposed',
      support: support(false),
      decidedBy: null,
      decidedAt: null,
      version: 1,
    }
  if (current.support.kind !== 'task') return null
  if (sameOutcomes(current.support.outcomes, input.outcomes)) return null
  const decided = current.status !== 'proposed'
  return {
    ...current,
    statement,
    translation: 'done',
    polarity: taskPolarity(input.outcomes),
    theme: { id: input.task.id, title: input.task.instruction },
    origin: 'ai',
    status: 'proposed',
    support: support(decided || current.support.figuresChanged),
    decidedBy: null,
    decidedAt: null,
    version: current.version + 1,
  }
}

/** What a usability fact shows as its evidence line: its quote, the moment seen, or its outcomes. */
export const evidenceLine = (f: Pick<UsabilityFact, 'support' | 'statement'>): string => {
  if (f.support.kind === 'task') return f.statement.en
  if (f.support.quote) return f.support.quote
  const s = Math.floor(f.support.momentMs / 1000)
  return `Seen at ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The participant of a usability fact's evidence, when it has one. */
export const participantOf = (f: Pick<UsabilityFact, 'support'>): string | null =>
  f.support.kind === 'observation' ? f.support.participant : null

/**
 * Spec 039: a person decides a task fact (no observation behind it): accept, edit its statement,
 * reject or reopen, with the version seen. A decision clears "figures changed".
 */
export const decideTaskFact = (
  fact: UsabilityFact,
  d: {
    readonly decision: 'accept' | 'reject' | 'edit' | 'reopen'
    readonly version: number
    readonly statement?: GivenStatement | undefined
  },
  by: string,
  now: Date,
  names: readonly string[],
): Result<UsabilityFact, FactError> => {
  if (fact.support.kind !== 'task') return err('VALIDATION')
  const support = { ...fact.support, figuresChanged: false }
  if (d.decision === 'reopen') {
    const back = reopened(fact, d.version)
    return back.ok ? ok({ ...back.value, support }) : back
  }
  if (d.version !== fact.version) return err('VERSION_CONFLICT')
  const decided = { decidedBy: by, decidedAt: now, version: fact.version + 1, support }
  if (d.decision !== 'edit')
    return ok({ ...fact, ...decided, status: d.decision === 'accept' ? 'accepted' : 'rejected' })
  const made = statementOf(d.statement ?? {}, fact.statement, names)
  if (!made.ok) return made
  return ok({
    ...fact,
    ...decided,
    status: 'edited',
    origin: 'person',
    statement: made.value.statement,
    translation: made.value.translation ?? fact.translation,
  })
}
