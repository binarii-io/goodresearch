import { err, ok, type Result } from '@goodresearch/shared'

/** Limits of FR-002 (spec 006); `@goodresearch/contracts` validates the same ones at the boundary. */
const LIMITS = {
  sections: 12,
  questions: 60,
  followUps: 8,
  hypotheses: 15,
  text: 600,
  framing: 4000,
  title: 120,
  minutes: 180,
} as const

export const SECTION_KINDS = ['introduction', 'warm-up', 'theme', 'wrap-up'] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

export type GuideFraming = {
  readonly objectives: string
  readonly hypotheses: readonly string[]
  readonly audience: string
  readonly format: string
}

export type GuideQuestion = {
  readonly id: string
  readonly text: string
  readonly followUps: readonly string[]
}

export type GuideSection = {
  readonly id: string
  readonly kind: SectionKind
  readonly title: string
  readonly minutes: number
  readonly questions: readonly GuideQuestion[]
}

export type GuideContent = {
  readonly framing: GuideFraming
  readonly sections: readonly GuideSection[]
}

/** What the editor or the assistant sends: ids are optional (research R4). */
export type GuideInput = {
  readonly framing: GuideFraming
  readonly sections: readonly {
    readonly id?: string | undefined
    readonly kind: SectionKind
    readonly title: string
    readonly minutes: number
    readonly questions: readonly {
      readonly id?: string | undefined
      readonly text: string
      readonly followUps: readonly string[]
    }[]
  }[]
}

export type GuideOrigin = 'assistant' | 'person' | 'drive'

export type InterviewGuideProps = {
  readonly studyId: string
  readonly content: GuideContent
  readonly origin: GuideOrigin
  readonly updatedBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const text = (value: string, max: number, min = 1): string | null => {
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

/** Same text for a person: case and spaces do not count. */
const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Gives ids (research R4): first, every id sent that the previous version has is kept (once);
 * then the others take a previous item with the same key not used yet; otherwise a new id. Two
 * passes, so a text match never takes an id that a later item claims explicitly.
 */
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

/** Checks and normalises a guide (FR-002); ids from the previous version where they match. */
const build = (
  input: GuideInput,
  previous: GuideContent | null,
  newId: () => string,
): Result<GuideContent, 'VALIDATION'> => {
  const f = input.framing
  const objectives = text(f.objectives, LIMITS.framing, 0)
  const audience = text(f.audience, LIMITS.framing, 0)
  const format = text(f.format, LIMITS.framing, 0)
  const hypotheses = f.hypotheses.map((h) => text(h, LIMITS.text))
  if (
    objectives === null ||
    audience === null ||
    format === null ||
    hypotheses.length > LIMITS.hypotheses ||
    hypotheses.some((h) => h === null)
  )
    return err('VALIDATION')

  const count = input.sections.reduce((n, s) => n + s.questions.length, 0)
  if (input.sections.length < 1 || input.sections.length > LIMITS.sections) return err('VALIDATION')
  if (count > LIMITS.questions) return err('VALIDATION')

  const sections: GuideSection[] = []
  for (const sec of input.sections) {
    const title = text(sec.title, LIMITS.title)
    if (
      title === null ||
      !SECTION_KINDS.includes(sec.kind) ||
      !Number.isInteger(sec.minutes) ||
      sec.minutes < 1 ||
      sec.minutes > LIMITS.minutes
    )
      return err('VALIDATION')
    const questions: GuideQuestion[] = []
    for (const q of sec.questions) {
      const questionText = text(q.text, LIMITS.text)
      const followUps = q.followUps.map((u) => text(u, LIMITS.text))
      if (
        questionText === null ||
        followUps.length > LIMITS.followUps ||
        followUps.some((u) => u === null)
      )
        return err('VALIDATION')
      questions.push({ id: '', text: questionText, followUps: followUps as string[] })
    }
    sections.push({ id: '', kind: sec.kind, title, minutes: sec.minutes, questions })
  }

  const before = previous?.sections ?? []
  const sectionIds = identify(
    before.map((p) => ({ id: p.id, key: normalise(p.title) })),
    input.sections.map((sec, i) => ({ sent: sec.id, key: normalise(sections[i]?.title ?? '') })),
    newId,
  )
  const questionIds = identify(
    before.flatMap((p) => p.questions.map((q) => ({ id: q.id, key: normalise(q.text) }))),
    input.sections.flatMap((sec, i) =>
      sec.questions.map((q, j) => ({
        sent: q.id,
        key: normalise(sections[i]?.questions[j]?.text ?? ''),
      })),
    ),
    newId,
  )
  let n = 0
  const identified = sections.map((sec, i) => ({
    ...sec,
    id: sectionIds[i] ?? newId(),
    questions: sec.questions.map((q) => ({ ...q, id: questionIds[n++] ?? newId() })),
  }))
  return ok({
    framing: { objectives, hypotheses: hypotheses as string[], audience, format },
    sections: identified,
  })
}

/**
 * The protocol of an interview study (spec 006, context map "InterviewGuide"): framing, ordered
 * sections, main questions with stable ids and their follow-ups.
 */
export class InterviewGuide {
  #props: InterviewGuideProps

  private constructor(props: InterviewGuideProps) {
    this.#props = props
  }

  static create(c: {
    studyId: string
    content: GuideInput
    origin: GuideOrigin
    by: string
    now: Date
    newId: () => string
  }): Result<InterviewGuide, 'VALIDATION'> {
    const content = build(c.content, null, c.newId)
    if (!content.ok) return content
    return ok(
      new InterviewGuide({
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

  static fromPersistence(props: InterviewGuideProps): InterviewGuide {
    return new InterviewGuide(props)
  }

  get studyId(): string {
    return this.#props.studyId
  }
  get version(): number {
    return this.#props.version
  }

  /** A new version of the whole guide; question ids are kept where they match (research R4). */
  replace(c: {
    content: GuideInput
    origin: GuideOrigin
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

  snapshot(): InterviewGuideProps {
    return { ...this.#props }
  }
}
