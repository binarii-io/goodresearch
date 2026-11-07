/**
 * What comes next on an interview study (spec 023), from its state; computed, never by the model.
 * Planning interviews is up to the person and blocks nothing (spec 024).
 */
export type NextStep =
  | 'write-guide'
  | 'add-folder'
  | 'publish'
  | 'fieldwork'
  | 'analyse'
  | 'decide'
  | 'validate'
  | 'next-phase'

export const nextStep = (s: {
  hasGuide: boolean
  hasFolder: boolean
  published: readonly string[]
  /** Spec 025: where the interviews stand, read only once the preparation is done. */
  interviews?: 'none' | 'analyse' | 'decide' | 'validate' | 'done' | undefined
}): NextStep => {
  if (!s.hasGuide) return 'write-guide'
  if (!s.hasFolder) return 'add-folder'
  if (!s.published.includes('guide') || !s.published.includes('best-practices')) return 'publish'
  if (s.interviews === 'done') return 'next-phase'
  if (!s.interviews || s.interviews === 'none') return 'fieldwork'
  return s.interviews
}

/** What comes next on a survey study (spec 027 US6); the checks advise, they block nothing. */
export type SurveyNextStep =
  | 'write-questionnaire'
  | 'add-folder'
  | 'publish-questionnaire'
  | 'readiness'
  | 'open-form'
  | 'collect'
  | 'close-form'
  | 'theme-open-items'
  | 'make-facts'
  | 'decide-facts'
  | 'analysis-done'

export const surveyNextStep = (s: {
  hasQuestionnaire: boolean
  hasFolder: boolean
  published: readonly string[]
  checksDone: boolean
  /** Spec 028. */
  accepting: boolean
  counted: number
  target: number | null
  /** Spec 029: open items with 5 counted answers or more and no theme yet. */
  openToTheme: number
  facts: { total: number; toDecide: number }
}): SurveyNextStep => {
  if (!s.hasQuestionnaire) return 'write-questionnaire'
  if (!s.hasFolder) return 'add-folder'
  if (!s.published.includes('questionnaire')) return 'publish-questionnaire'
  if (s.accepting) return s.target !== null && s.counted >= s.target ? 'close-form' : 'collect'
  // Spec 029: once collected, the analysis: themes, then facts made and decided.
  if (s.counted > 0)
    return s.openToTheme > 0
      ? 'theme-open-items'
      : s.facts.total === 0
        ? 'make-facts'
        : s.facts.toDecide > 0
          ? 'decide-facts'
          : 'analysis-done'
  return s.checksDone ? 'open-form' : 'readiness'
}

/**
 * The next step of a usability test study (spec 036 FR-016), then its sessions (spec 037 FR-014):
 * decide them, make them ready for the video analysis, then the next phase.
 */
export type UsabilityNextStep =
  | 'write-protocol'
  | 'add-folder'
  | 'publish-protocol'
  | 'readiness'
  | 'run-sessions'
  | 'decide-sessions'
  | 'make-ready'
  | 'next-phase'

export const usabilityNextStep = (s: {
  hasProtocol: boolean
  hasFolder: boolean
  published: readonly string[]
  checksDone: boolean
  /** Spec 037: the study's test sessions, when read. */
  sessions?: { total: number; open: number; notReady: number } | undefined
}): UsabilityNextStep => {
  if (!s.hasProtocol) return 'write-protocol'
  if (!s.hasFolder) return 'add-folder'
  if (!s.published.includes('protocol')) return 'publish-protocol'
  // Sessions already found: the checks were the way to them, they no longer come first.
  if (!s.sessions || s.sessions.total === 0) return s.checksDone ? 'run-sessions' : 'readiness'
  if (s.sessions.open > 0) return 'decide-sessions'
  return s.sessions.notReady > 0 ? 'make-ready' : 'next-phase'
}
