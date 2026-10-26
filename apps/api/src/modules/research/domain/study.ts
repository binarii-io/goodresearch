import { type Brand, err, ok, type Result } from '@goodresearch/shared'

export type StudyId = Brand<string, 'StudyId'>

/** Every type the product knows; only `interviews` can be created for now (FR-002). */
export const STUDY_TYPES = ['interviews', 'survey', 'usability-test'] as const
export type StudyType = (typeof STUDY_TYPES)[number]
const CREATABLE: readonly string[] = ['interviews']

export type StudyProps = {
  readonly id: StudyId
  readonly projectId: string
  readonly name: string
  readonly type: StudyType
  /** Spec 009: interview names and titles use pseudonyms instead of names. */
  readonly anonymised: boolean
  readonly createdBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const validName = (name: string): Result<string, 'VALIDATION'> => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 120 ? ok(trimmed) : err('VALIDATION')
}

/** One method run to collect evidence for a project's research question. */
export class Study {
  #props: StudyProps

  private constructor(props: StudyProps) {
    this.#props = props
  }

  static create(input: {
    id: string
    projectId: string
    name: string
    type: string
    createdBy: string | null
    now: Date
  }): Result<Study, 'VALIDATION'> {
    if (!CREATABLE.includes(input.type)) return err('VALIDATION')
    const name = validName(input.name)
    if (!name.ok) return name
    return ok(
      new Study({
        id: input.id as StudyId,
        projectId: input.projectId,
        name: name.value,
        type: input.type as StudyType,
        anonymised: false,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
        version: 0,
      }),
    )
  }

  static fromPersistence(props: StudyProps): Study {
    return new Study(props)
  }

  get id(): StudyId {
    return this.#props.id
  }
  get projectId(): string {
    return this.#props.projectId
  }
  get type(): StudyType {
    return this.#props.type
  }
  get name(): string {
    return this.#props.name
  }
  get version(): number {
    return this.#props.version
  }
  get anonymised(): boolean {
    return this.#props.anonymised
  }

  /** Turned on or off by any person who can act on the study (spec 009 FR-013). */
  setAnonymised(on: boolean, now: Date): void {
    this.#props = { ...this.#props, anonymised: on, updatedAt: now }
  }

  rename(name: string, now: Date): Result<void, 'VALIDATION'> {
    const valid = validName(name)
    if (!valid.ok) return valid
    this.#props = { ...this.#props, name: valid.value, updatedAt: now }
    return ok(undefined)
  }

  snapshot(): StudyProps {
    return { ...this.#props }
  }
}
