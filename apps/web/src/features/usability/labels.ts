import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

type Outcome = 'success' | 'partial' | 'failure' | 'not-attempted'

/** Spec 038: a task's outcome, always with its text next to its colour (FR-011). */
export const OUTCOMES: Record<Outcome, MessageDescriptor> = {
  success: msg`Success`,
  partial: msg`Partial`,
  failure: msg`Failure`,
  'not-attempted': msg`Not attempted`,
}

export const OUTCOME_BADGES: Record<Outcome, 'success' | 'warning' | 'failure' | 'muted'> = {
  success: 'success',
  partial: 'warning',
  failure: 'failure',
  'not-attempted': 'muted',
}

export const KINDS: Record<
  'difficulty' | 'error' | 'positive' | 'verbatim' | 'assisted' | 'sus-answer',
  MessageDescriptor
> = {
  difficulty: msg`Difficulty`,
  error: msg`Error`,
  positive: msg`Positive`,
  verbatim: msg`Verbatim`,
  assisted: msg`Helped`,
  'sus-answer': msg`SUS answer`,
}

export const STAGES: Record<
  'preparing' | 'transcript' | 'screen-log' | 'task-map' | 'tasks' | 'checks',
  MessageDescriptor
> = {
  preparing: msg`Copying the video…`,
  transcript: msg`Transcribing…`,
  'screen-log': msg`Reading the screen…`,
  'task-map': msg`Placing the tasks…`,
  tasks: msg`Reading each task…`,
  checks: msg`Checking the observations…`,
}

export const STATES: Record<
  'waiting' | 'analysing' | 'done' | 'failed' | 'stopped',
  MessageDescriptor
> = {
  waiting: msg`Waiting`,
  analysing: msg`Analysing`,
  done: msg`Analysed`,
  failed: msg`Failed`,
  stopped: msg`Stopped`,
}

export const FAILURES: Record<
  | 'VIDEO_UNREADABLE'
  | 'AI_PROVIDER_REQUIRED'
  | 'MEDIA_NOT_SUPPORTED'
  | 'AI_FAILED'
  | 'STAGING_FAILED'
  | 'STOPPED',
  MessageDescriptor
> = {
  VIDEO_UNREADABLE: msg`The video could not be read from Drive.`,
  AI_PROVIDER_REQUIRED: msg`No AI provider is set up.`,
  MEDIA_NOT_SUPPORTED: msg`This AI provider cannot read video: it needs Vertex AI.`,
  AI_FAILED: msg`The AI provider failed. Try again.`,
  STAGING_FAILED: msg`The temporary copy for the AI provider could not be made.`,
  STOPPED: msg`Stopped before the end.`,
}

/** "mm:ss" of a moment of the video. */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A time on task as people read it ("2 min 05"). */
export const duration = (i18n: I18n, ms: number | null) => {
  if (ms === null) return null
  const s = Math.round(ms / 1000)
  const minutes = Math.floor(s / 60)
  const seconds = String(s % 60).padStart(2, '0')
  return i18n._(msg`${minutes} min ${seconds}`)
}
