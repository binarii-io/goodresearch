import { err, ok, type Result } from '@goodresearch/shared'

/** Limits of FR-004 (spec 027); `@goodresearch/contracts` validates the same ones at the boundary. */
const LIMITS = {
  sections: 12,
  items: 80,
  hypotheses: 15,
  options: 20,
  text: 600,
  framing: 4000,
  title: 120,
} as const

export const QUESTIONNAIRE_SECTION_KINDS = [
  'introduction',
  'profiling',
  'theme',
  'closing',
] as const
export type QuestionnaireSectionKind = (typeof QUESTIONNAIRE_SECTION_KINDS)[number]

export type QuestionnaireFraming = {
  readonly objective: string
  readonly hypotheses: readonly string[]
  readonly audience: string
  readonly recruitment: 'targeted' | 'wide-then-filter'
  readonly administration: string
  readonly targetResponses: number | null
  readonly targetReason: string
  readonly language: 'en' | 'fr'
  readonly consent: string
  readonly thanks: string
  readonly shuffle: boolean
}

type ItemCommon = {
  readonly text: string
  readonly measure: 'factual' | 'subjective'
  readonly required: boolean
  readonly subTheme: string | null
  /** The one optional item asking an address to send the results (FR-024). */
  readonly contact: boolean
}

type ItemKind =
  | {
      readonly kind: 'likert'
      readonly points: 5 | 7
      readonly lowLabel: string
      readonly highLabel: string
    }
  | {
      readonly kind: 'single-choice' | 'multiple-choice'
      readonly options: readonly string[]
      /** Options with a meaningful order are never shuffled. */
      readonly ordered: boolean
    }
  | { readonly kind: 'open' }

export type QuestionnaireItem = { readonly id: string } & ItemCommon & ItemKind

export type QuestionnaireSection = {
  readonly id: string
  readonly kind: QuestionnaireSectionKind
  readonly title: string
  readonly items: readonly QuestionnaireItem[]
}

export type QuestionnaireContent = {
  readonly framing: QuestionnaireFraming
  readonly sections: readonly QuestionnaireSection[]
}

/** What the editor or the assistant sends: ids are optional. */
export type QuestionnaireItemInput = { readonly id?: string | undefined } & ItemCommon & ItemKind

export type QuestionnaireInput = {
  readonly framing: QuestionnaireFraming
  readonly sections: readonly {
    readonly id?: string | undefined
    readonly kind: QuestionnaireSectionKind
    readonly title: string
    readonly items: readonly QuestionnaireItemInput[]
  }[]
}

export type QuestionnaireOrigin = 'assistant' | 'person' | 'drive'

export type QuestionnaireProps = {
  readonly studyId: string
  readonly content: QuestionnaireContent
  readonly origin: QuestionnaireOrigin
  readonly updatedBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const text = (value: string, max: number, min = 1): string | null => {
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

/** A title at the form service: on one line. */
const line = (value: string, max: number): string | null => text(value.replace(/\s+/g, ' '), max)

/** Same text for a person: case and spaces do not count. */
const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** Ids sent and known are kept first, then the same text takes a previous id, else a new one. */
const identify = (
  previous: readonly { id: string; key: string }[],
  items: readonly { sent: string | undefined; key: string }[],
  newId: () => string,
): string[] => {
  const known = new Set(previous.map((p) => p.id))
  const used = new Set<string>()
  const kept = items.map((item) => {
    if (!item.sent || !known.has(item.sent) || used.has(item.sent)) return null
    used.add(item.sent)
    return item.sent
  })
  return kept.map((id, i) => {
    if (id) return id
    const match = previous.find((p) => !used.has(p.id) && p.key === items[i]?.key)
    if (match) {
      used.add(match.id)
      return match.id
    }
    return newId()
  })
}

const buildFraming = (f: QuestionnaireFraming): QuestionnaireFraming | null => {
  const objective = text(f.objective, LIMITS.framing, 0)
  const audience = text(f.audience, LIMITS.framing, 0)
  const administration = text(f.administration, LIMITS.framing, 0)
  const targetReason = text(f.targetReason, LIMITS.framing, 0)
  const consent = text(f.consent, LIMITS.framing)
  const thanks = text(f.thanks, LIMITS.framing)
  const hypotheses = f.hypotheses.map((h) => text(h, LIMITS.text))
  if (
    objective === null ||
    audience === null ||
    administration === null ||
    targetReason === null ||
    consent === null ||
    thanks === null ||
    hypotheses.length > LIMITS.hypotheses ||
    hypotheses.some((h) => h === null) ||
    (f.targetResponses !== null && (!Number.isInteger(f.targetResponses) || f.targetResponses < 1))
  )
    return null
  return {
    ...f,
    objective,
    audience,
    administration,
    targetReason,
    consent,
    thanks,
    hypotheses: hypotheses as string[],
  }
}

const buildItem = (
  item: QuestionnaireItemInput,
  section: QuestionnaireSectionKind,
): QuestionnaireItem | null => {
  const itemText = line(item.text, LIMITS.text)
  if (itemText === null) return null
  const subTheme = item.subTheme === null ? null : line(item.subTheme, LIMITS.title)
  if (item.subTheme !== null && (subTheme === null || section !== 'theme')) return null
  if (item.contact && (item.kind !== 'open' || item.required || section !== 'closing')) return null
  const common = {
    id: '',
    text: itemText,
    measure: item.measure,
    required: item.required,
    subTheme,
    contact: item.contact,
  }
  if (item.kind === 'open') return { ...common, kind: 'open' }
  if (item.kind === 'likert') {
    const lowLabel = line(item.lowLabel, LIMITS.title)
    const highLabel = line(item.highLabel, LIMITS.title)
    if (lowLabel === null || highLabel === null || (item.points !== 5 && item.points !== 7))
      return null
    return { ...common, kind: 'likert', points: item.points, lowLabel, highLabel }
  }
  const options = item.options.map((o) => line(o, LIMITS.text))
  if (
    options.length < 2 ||
    options.length > LIMITS.options ||
    options.some((o) => o === null) ||
    // The form service refuses two identical options.
    new Set(options).size !== options.length
  )
    return null
  return { ...common, kind: item.kind, options: options as string[], ordered: item.ordered }
}

/** Checks and normalises a questionnaire (FR-002 to FR-005); ids kept where they match. */
const build = (
  input: QuestionnaireInput,
  previous: QuestionnaireContent | null,
  newId: () => string,
): Result<QuestionnaireContent, 'VALIDATION'> => {
  const framing = buildFraming(input.framing)
  if (!framing) return err('VALIDATION')
  if (input.sections.length > LIMITS.sections) return err('VALIDATION')
  const items = input.sections.flatMap((s) => s.items)
  if (items.length > LIMITS.items) return err('VALIDATION')
  if (items.filter((i) => i.contact).length > 1) return err('VALIDATION')
  if (!input.sections.some((s) => s.kind === 'theme' && s.items.length > 0))
    return err('VALIDATION')

  const sections: QuestionnaireSection[] = []
  for (const sec of input.sections) {
    const title = line(sec.title, LIMITS.title)
    if (title === null || !QUESTIONNAIRE_SECTION_KINDS.includes(sec.kind)) return err('VALIDATION')
    const built: QuestionnaireItem[] = []
    for (const item of sec.items) {
      const one = buildItem(item, sec.kind)
      if (!one) return err('VALIDATION')
      built.push(one)
    }
    sections.push({ id: '', kind: sec.kind, title, items: built })
  }

  const before = previous?.sections ?? []
  const sectionIds = identify(
    before.map((p) => ({ id: p.id, key: normalise(p.title) })),
    input.sections.map((sec, i) => ({ sent: sec.id, key: normalise(sections[i]?.title ?? '') })),
    newId,
  )
  const itemIds = identify(
    before.flatMap((p) => p.items.map((q) => ({ id: q.id, key: normalise(q.text) }))),
    input.sections.flatMap((sec, i) =>
      sec.items.map((q, j) => ({
        sent: q.id,
        key: normalise(sections[i]?.items[j]?.text ?? ''),
      })),
    ),
    newId,
  )
  let n = 0
  return ok({
    framing,
    sections: sections.map((sec, i) => ({
      ...sec,
      id: sectionIds[i] ?? newId(),
      items: sec.items.map((q) => ({ ...q, id: itemIds[n++] ?? newId() })),
    })),
  })
}

/**
 * The instrument of a survey study (spec 027): framing, ordered sections, items with stable ids.
 * Same shape as an interview guide, with its own rules.
 */
export class Questionnaire {
  #props: QuestionnaireProps

  private constructor(props: QuestionnaireProps) {
    this.#props = props
  }

  static create(c: {
    studyId: string
    content: QuestionnaireInput
    origin: QuestionnaireOrigin
    by: string
    now: Date
    newId: () => string
  }): Result<Questionnaire, 'VALIDATION'> {
    const content = build(c.content, null, c.newId)
    if (!content.ok) return content
    return ok(
      new Questionnaire({
        studyId: c.studyId,
        content: content.value,
        origin: c.origin,
        updatedBy: c.by,
        createdAt: c.now,
        updatedAt: c.now,
        version: 0,
      }),
    )
  }

  static fromPersistence(props: QuestionnaireProps): Questionnaire {
    return new Questionnaire(props)
  }

  get studyId(): string {
    return this.#props.studyId
  }
  get version(): number {
    return this.#props.version
  }

  /** A new version of the whole questionnaire; item ids are kept where they match. */
  replace(c: {
    content: QuestionnaireInput
    origin: QuestionnaireOrigin
    by: string
    now: Date
    newId: () => string
  }): Result<void, 'VALIDATION'> {
    const content = build(c.content, this.#props.content, c.newId)
    if (!content.ok) return content
    this.#props = {
      ...this.#props,
      content: content.value,
      origin: c.origin,
      updatedBy: c.by,
      updatedAt: c.now,
    }
    return ok(undefined)
  }

  snapshot(): QuestionnaireProps {
    return { ...this.#props }
  }
}
