/** The questionnaire as this module sees it (the research module's, by port). */
export type SurveyItem = {
  readonly id: string
  readonly text: string
  readonly contact: boolean
  readonly kind: 'likert' | 'single-choice' | 'multiple-choice' | 'open'
  readonly options?: readonly string[]
}
export type SurveySection = {
  readonly id: string
  readonly kind: 'introduction' | 'profiling' | 'theme' | 'closing'
  readonly items: readonly SurveyItem[]
}

/** A response as the form service gives it; never who answered. */
export type RawResponse = {
  readonly id: string
  readonly submittedAt: string
  readonly answers: Readonly<Record<string, readonly string[]>>
}

export type StoredResponse = {
  readonly sourceId: string
  readonly submittedAt: Date
  readonly consent: 'given' | 'refused'
  /** Item id → values; no contact item, nothing on a refusal. */
  readonly answers: Readonly<Record<string, readonly string[]>>
}

export type ItemMap = Readonly<
  Record<string, { readonly formItemId: string; readonly questionId: string | null }>
>

export type ResponseState = 'counted' | 'out-of-target' | 'profile-not-answered' | 'refused-consent'

/** Item id → accepted options. */
export type Accepted = Readonly<Record<string, readonly string[]>>

const LEADING_NUMBER = /^\s*(\d+)/

/**
 * One response of the form into what the app keeps (spec 028 research R2, R3): each answer under
 * its item; a scale, or a grid's column, as its number. The contact item stops here (FR-006).
 */
export const toStored = (
  raw: RawResponse,
  map: ItemMap,
  sections: readonly SurveySection[],
  agree: string,
): { response: StoredResponse; unknownQuestions: string[]; unknownValues: number } => {
  const byQuestion = new Map(
    Object.entries(map)
      .filter(([, id]) => id.questionId)
      .map(([key, id]) => [id.questionId as string, key]),
  )
  const items = new Map(sections.flatMap((s) => s.items.map((i) => [i.id, i] as const)))
  const consentId = map.consent?.questionId
  // A refusal ends the form: any other answer proves consent, even if the label changed since.
  const given =
    (consentId ? raw.answers[consentId]?.includes(agree) === true : false) ||
    Object.keys(raw.answers).some((q) => q !== consentId)
  const base = { sourceId: raw.id, submittedAt: new Date(raw.submittedAt) }
  if (!given)
    return {
      response: { ...base, consent: 'refused', answers: {} },
      unknownQuestions: [],
      unknownValues: 0,
    }
  const answers: Record<string, readonly string[]> = {}
  const unknownQuestions: string[] = []
  let unknownValues = 0
  for (const [questionId, values] of Object.entries(raw.answers)) {
    if (questionId === consentId) continue
    const key = byQuestion.get(questionId)
    const item = key?.startsWith('item:') ? items.get(key.slice(5)) : undefined
    if (!item) {
      unknownQuestions.push(questionId)
      continue
    }
    if (item.contact) continue
    if (item.kind === 'likert')
      answers[item.id] = values.map((v) => LEADING_NUMBER.exec(v)?.[1] ?? v)
    else {
      answers[item.id] = values
      if (item.options) unknownValues += values.filter((v) => !item.options?.includes(v)).length
    }
  }
  return { response: { ...base, consent: 'given', answers }, unknownQuestions, unknownValues }
}

/** The state of a response, computed at each read (FR-008); the queries do the same in SQL. */
export const stateOf = (
  response: Pick<StoredResponse, 'consent' | 'answers'>,
  accepted: Accepted,
): ResponseState => {
  if (response.consent === 'refused') return 'refused-consent'
  const rule = Object.entries(accepted)
  if (rule.some(([item]) => !response.answers[item]?.length)) return 'profile-not-answered'
  return rule.every(([item, ok]) => response.answers[item]?.some((v) => ok.includes(v)))
    ? 'counted'
    : 'out-of-target'
}

const filterable = (sections: readonly SurveySection[]) =>
  new Map(
    sections
      .filter((s) => s.kind === 'profiling')
      .flatMap((s) => s.items)
      .filter((i) => i.kind === 'single-choice' || i.kind === 'multiple-choice')
      .map((i) => [i.id, i.options ?? []] as const),
  )

/** Choice items of a profiling section, and their options (FR-009). */
export const validRule = (accepted: Accepted, sections: readonly SurveySection[]): boolean => {
  const items = filterable(sections)
  return Object.entries(accepted).every(([id, values]) => {
    const options = items.get(id)
    return options && values.length > 0 && values.every((v) => options.includes(v))
  })
}

/** What still applies of a saved rule, after changes of the questionnaire. */
export const acceptedOf = (
  saved: Accepted,
  sections: readonly SurveySection[],
): { accepted: Accepted; stale: boolean } => {
  const items = filterable(sections)
  const accepted: Record<string, readonly string[]> = {}
  let stale = false
  for (const [id, values] of Object.entries(saved)) {
    const options = items.get(id)
    const kept = values.filter((v) => options?.includes(v))
    if (kept.length !== values.length) stale = true
    if (kept.length) accepted[id] = kept
  }
  return { accepted, stale }
}
