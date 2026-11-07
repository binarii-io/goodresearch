import { err, ok, type Result } from '@goodresearch/shared'

/** Limits of FR-002 and FR-003 (spec 036); `@goodresearch/contracts` validates the same ones at the boundary. */
const LIMITS = {
  tasks: 15,
  hypotheses: 15,
  warmUp: 10,
  debrief: 10,
  text: 600,
  long: 4000,
  sessionMinutes: [10, 240],
  taskMinutes: [1, 60],
} as const

export const INTERFACE_KINDS = ['prototype', 'live-application', 'other'] as const
export const SESSION_FORMATS = ['moderated-remote', 'moderated-in-person'] as const
export const QUESTIONNAIRES = ['none', 'sus-v1'] as const
export const EASE_QUESTIONS = ['none', 'seq-v1'] as const

export type TestedInterface = {
  readonly url: string
  readonly kind: (typeof INTERFACE_KINDS)[number]
  readonly description: string | null
}

export type ProtocolFraming = {
  readonly objective: string
  readonly hypotheses: readonly string[]
  readonly participants: string
  readonly format: (typeof SESSION_FORMATS)[number]
  readonly sessionMinutes: number
  readonly language: 'en' | 'fr'
  readonly consent: string
  readonly interface: TestedInterface
}

export type ProtocolScript = {
  readonly introduction: string
  readonly thinkAloud: string
  readonly warmUp: readonly string[]
  readonly debrief: readonly string[]
  readonly closing: string
}

export type TestTask = {
  readonly id: string
  readonly instruction: string
  readonly criterion: string
  readonly startUrl: string | null
  readonly minutes: number | null
}

export type TestProtocolContent = {
  readonly framing: ProtocolFraming
  readonly script: ProtocolScript
  readonly scenario: string
  readonly tasks: readonly TestTask[]
  readonly questionnaire: (typeof QUESTIONNAIRES)[number]
  readonly easeQuestion: (typeof EASE_QUESTIONS)[number]
  /** Ids of removed tasks, never minted again: the later analysis may still point at them (FR-004). */
  readonly retiredTaskIds: readonly string[]
}

/** What the editor, the assistant or a Drive change sends: task ids are optional. */
export type TestTaskInput = Omit<TestTask, 'id'> & { readonly id?: string | undefined }

export type TestProtocolInput = Omit<TestProtocolContent, 'tasks' | 'retiredTaskIds'> & {
  readonly tasks: readonly TestTaskInput[]
}

export type TestProtocolOrigin = 'assistant' | 'person' | 'drive'

export type TestProtocolProps = {
  readonly studyId: string
  readonly content: TestProtocolContent
  readonly origin: TestProtocolOrigin
  readonly updatedBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const text = (value: string, max: number, min = 1): string | null => {
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

/** Same instruction for a person: case and spaces do not count. */
const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** A web address the participant can open: only `http` and `https` (FR-022: never fetched by the app). */
export const isWebAddress = (value: string): boolean => {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

const within = (value: number, [min, max]: readonly [number, number]) =>
  Number.isInteger(value) && value >= min && value <= max

const list = (values: readonly string[], max: number): string[] | null => {
  const built = values.map((v) => text(v, LIMITS.text))
  return built.length <= max && built.every((v) => v !== null) ? (built as string[]) : null
}

/** Ids sent and known are kept first, then the same instruction takes a previous id, else a new one. */
const identify = (
  previous: readonly { id: string; key: string }[],
  items: readonly { sent: string | undefined; key: string }[],
  newId: () => string,
  retired: ReadonlySet<string>,
): string[] => {
  const known = new Set(previous.map((p) => p.id))
  const used = new Set<string>()
  const kept = items.map((item) => {
    if (!item.sent || !known.has(item.sent) || used.has(item.sent)) return null
    used.add(item.sent)
    return item.sent
  })
  const fresh = () => {
    for (;;) {
      const id = newId()
      if (!retired.has(id) && !known.has(id) && !used.has(id)) return id
    }
  }
  return kept.map((id, i) => {
    if (id) return id
    const match = previous.find((p) => !used.has(p.id) && p.key === items[i]?.key)
    if (match) {
      used.add(match.id)
      return match.id
    }
    const minted = fresh()
    used.add(minted)
    return minted
  })
}

const buildFraming = (f: ProtocolFraming): ProtocolFraming | null => {
  const objective = text(f.objective, LIMITS.long, 0)
  const participants = text(f.participants, LIMITS.long, 0)
  const consent = text(f.consent, LIMITS.long)
  const hypotheses = list(f.hypotheses, LIMITS.hypotheses)
  const description =
    f.interface.description === null ? null : text(f.interface.description, LIMITS.long, 0)
  if (
    objective === null ||
    participants === null ||
    consent === null ||
    hypotheses === null ||
    (f.interface.description !== null && description === null) ||
    !isWebAddress(f.interface.url) ||
    !INTERFACE_KINDS.includes(f.interface.kind) ||
    !SESSION_FORMATS.includes(f.format) ||
    (f.language !== 'en' && f.language !== 'fr') ||
    !within(f.sessionMinutes, LIMITS.sessionMinutes)
  )
    return null
  return {
    ...f,
    objective,
    participants,
    consent,
    hypotheses,
    interface: {
      url: f.interface.url.trim(),
      kind: f.interface.kind,
      description: description || null,
    },
  }
}

const buildScript = (s: ProtocolScript): ProtocolScript | null => {
  const introduction = text(s.introduction, LIMITS.long, 0)
  const thinkAloud = text(s.thinkAloud, LIMITS.long, 0)
  const closing = text(s.closing, LIMITS.long, 0)
  const warmUp = list(s.warmUp, LIMITS.warmUp)
  const debrief = list(s.debrief, LIMITS.debrief)
  if (introduction === null || thinkAloud === null || closing === null || !warmUp || !debrief)
    return null
  return { introduction, thinkAloud, warmUp, debrief, closing }
}

const buildTask = (t: TestTaskInput): Omit<TestTask, 'id'> | null => {
  const instruction = text(t.instruction, LIMITS.text)
  const criterion = text(t.criterion, LIMITS.text)
  if (instruction === null || criterion === null) return null
  if (t.startUrl !== null && !isWebAddress(t.startUrl)) return null
  if (t.minutes !== null && !within(t.minutes, LIMITS.taskMinutes)) return null
  return { instruction, criterion, startUrl: t.startUrl?.trim() ?? null, minutes: t.minutes }
}

/** Checks and normalises a protocol (FR-002 to FR-004); task ids kept where they match. */
const build = (
  input: TestProtocolInput,
  previous: TestProtocolContent | null,
  newId: () => string,
): Result<TestProtocolContent, 'VALIDATION'> => {
  const framing = buildFraming(input.framing)
  const script = buildScript(input.script)
  const scenario = text(input.scenario, LIMITS.long, 0)
  if (!framing || !script || scenario === null) return err('VALIDATION')
  if (!QUESTIONNAIRES.includes(input.questionnaire) || !EASE_QUESTIONS.includes(input.easeQuestion))
    return err('VALIDATION')
  if (input.tasks.length < 1 || input.tasks.length > LIMITS.tasks) return err('VALIDATION')
  const tasks: Omit<TestTask, 'id'>[] = []
  for (const t of input.tasks) {
    const one = buildTask(t)
    if (!one) return err('VALIDATION')
    tasks.push(one)
  }

  const retired = new Set(previous?.retiredTaskIds ?? [])
  const before = (previous?.tasks ?? []).filter((t) => !retired.has(t.id))
  const taskIds = identify(
    before.map((t) => ({ id: t.id, key: normalise(t.instruction) })),
    input.tasks.map((t, i) => ({
      sent: t.id && !retired.has(t.id) ? t.id : undefined,
      key: normalise(tasks[i]?.instruction ?? ''),
    })),
    newId,
    retired,
  )
  const kept = new Set(taskIds)
  const retiredTaskIds = [...retired, ...before.map((t) => t.id).filter((id) => !kept.has(id))]
  return ok({
    framing,
    script,
    scenario,
    tasks: tasks.map((t, i) => ({ id: taskIds[i] as string, ...t })),
    questionnaire: input.questionnaire,
    easeQuestion: input.easeQuestion,
    retiredTaskIds,
  })
}

/**
 * The instrument of a usability test study (spec 036): framing, script, scenario and ordered tasks with
 * stable ids, which the later video analysis judges each session against. Same role as an interview guide
 * or a questionnaire, with its own rules.
 */
export class TestProtocol {
  #props: TestProtocolProps

  private constructor(props: TestProtocolProps) {
    this.#props = props
  }

  static create(c: {
    studyId: string
    content: TestProtocolInput
    origin: TestProtocolOrigin
    by: string
    now: Date
    newId: () => string
  }): Result<TestProtocol, 'VALIDATION'> {
    const content = build(c.content, null, c.newId)
    if (!content.ok) return content
    return ok(
      new TestProtocol({
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

  static fromPersistence(props: TestProtocolProps): TestProtocol {
    return new TestProtocol(props)
  }

  get studyId(): string {
    return this.#props.studyId
  }
  get version(): number {
    return this.#props.version
  }
  get content(): TestProtocolContent {
    return this.#props.content
  }

  /** A new version of the whole protocol; task ids are kept where they match, removed ones retired. */
  replace(c: {
    content: TestProtocolInput
    origin: TestProtocolOrigin
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

  snapshot(): TestProtocolProps {
    return { ...this.#props }
  }
}
