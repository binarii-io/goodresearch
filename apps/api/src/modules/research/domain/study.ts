import { type Brand, err, ok, type Result } from '@goodresearch/shared'

export type StudyId = Brand<string, 'StudyId'>

/** Every type the product knows; only `interviews` can be created for now (FR-002). */
export const STUDY_TYPES = ['interviews', 'survey', 'usability-test'] as const
export type StudyType = (typeof STUDY_TYPES)[number]
const CREATABLE: readonly string[] = ['interviews']

/** Spec 012 FR-002: the corrected text (proposed corrections included), or the clean version only. */
export type TextAnalysed = 'with-corrections' | 'clean-only'

export type StudyProps = {
  readonly id: StudyId
  /** Spec 019: a study belongs to a team, like a project. */
  readonly teamId: string
  /** The projects it feeds, earliest link first; none is allowed. */
  readonly projectIds: readonly string[]
  /** Spec 019: read by the AI steps inside the study; a copy of the project's at creation. */
  readonly goal: string
  readonly name: string
  readonly type: StudyType
  /** Spec 009: interview names and titles use pseudonyms instead of names. */
  readonly anonymised: boolean
  /** Spec 012: the text Analysis reads. */
  readonly textAnalysed: TextAnalysed
  readonly createdBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const validGoal = (goal: string): Result<string, 'VALIDATION'> => {
  const trimmed = goal.trim()
  return trimmed.length <= 10_000 ? ok(trimmed) : err('VALIDATION')
}

const validName = (name: string): Result<string, 'VALIDATION'> => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 120 ? ok(trimmed) : err('VALIDATION')
}

/** One method run to collect evidence, for the research questions of the projects it feeds. */
export class Study {
  #props: StudyProps

  private constructor(props: StudyProps) {
    this.#props = props
  }

  static create(input: {
    id: string
    teamId: string
    projectId: string
    goal: string
    name: string
    type: string
    createdBy: string | null
    now: Date
  }): Result<Study, 'VALIDATION'> {
    if (!CREATABLE.includes(input.type)) return err('VALIDATION')
    const name = validName(input.name)
    if (!name.ok) return name
    const goal = validGoal(input.goal)
    if (!goal.ok) return goal
    return ok(
      new Study({
        id: input.id as StudyId,
        teamId: input.teamId,
        projectIds: [input.projectId],
        goal: goal.value,
        name: name.value,
        type: input.type as StudyType,
        anonymised: false,
        textAnalysed: 'with-corrections',
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
  get teamId(): string {
    return this.#props.teamId
  }
  get projectIds(): readonly string[] {
    return this.#props.projectIds
  }
  get goal(): string {
    return this.#props.goal
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

  get textAnalysed(): TextAnalysed {
    return this.#props.textAnalysed
  }

  /** Spec 012 FR-002: set by any person who can act on the study. */
  setTextAnalysed(mode: TextAnalysed, now: Date): void {
    this.#props = { ...this.#props, textAnalysed: mode, updatedAt: now }
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

  /** Spec 019: only a project of its team, once. */
  attach(
    project: { id: string; teamId: string },
    now: Date,
  ): Result<void, 'DIFFERENT_TEAM' | 'ALREADY_LINKED'> {
    if (project.teamId !== this.#props.teamId) return err('DIFFERENT_TEAM')
    if (this.#props.projectIds.includes(project.id)) return err('ALREADY_LINKED')
    this.#props = {
      ...this.#props,
      projectIds: [...this.#props.projectIds, project.id],
      updatedAt: now,
    }
    return ok(undefined)
  }

  /** Spec 019: a study can end up without a project: its team's Studies page lists it. */
  detach(projectId: string, now: Date): Result<void, 'NOT_LINKED'> {
    if (!this.#props.projectIds.includes(projectId)) return err('NOT_LINKED')
    this.#props = {
      ...this.#props,
      projectIds: this.#props.projectIds.filter((id) => id !== projectId),
      updatedAt: now,
    }
    return ok(undefined)
  }

  changeGoal(goal: string, now: Date): Result<void, 'VALIDATION'> {
    const valid = validGoal(goal)
    if (!valid.ok) return valid
    this.#props = { ...this.#props, goal: valid.value, updatedAt: now }
    return ok(undefined)
  }

  /** With its only project (spec 019 R7). */
  moveToTeam(teamId: string, now: Date): void {
    this.#props = { ...this.#props, teamId, updatedAt: now }
  }

  snapshot(): StudyProps {
    return { ...this.#props }
  }
}
