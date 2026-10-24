import { type Brand, err, ok, type Result } from '@goodresearch/shared'

export type ProjectId = Brand<string, 'ProjectId'>

export type ProjectProps = {
  readonly id: ProjectId
  /** Team of the workspace module, by id only. */
  readonly teamId: string
  readonly name: string
  readonly goal: string
  readonly createdBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

export type ProjectError = 'VALIDATION'

const MAX_NAME = 120
const MAX_GOAL = 10_000

const validName = (name: string): Result<string, ProjectError> => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME ? ok(trimmed) : err('VALIDATION')
}

/** Goals keep their line breaks (FR-016); only their length is limited. */
const validGoal = (goal: string): Result<string, ProjectError> =>
  goal.length <= MAX_GOAL ? ok(goal) : err('VALIDATION')

/** A research question (FR-015 to FR-020). */
export class Project {
  #props: ProjectProps

  private constructor(props: ProjectProps) {
    this.#props = props
  }

  static create(input: {
    id: string
    teamId: string
    name: string
    goal: string
    createdBy: string | null
    now: Date
  }): Result<Project, ProjectError> {
    const name = validName(input.name)
    if (!name.ok) return name
    const goal = validGoal(input.goal)
    if (!goal.ok) return goal
    return ok(
      new Project({
        id: input.id as ProjectId,
        teamId: input.teamId,
        name: name.value,
        goal: goal.value,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
        version: 0,
      }),
    )
  }

  static fromPersistence(props: ProjectProps): Project {
    return new Project(props)
  }

  get id(): ProjectId {
    return this.#props.id
  }
  get teamId(): string {
    return this.#props.teamId
  }
  get name(): string {
    return this.#props.name
  }
  get goal(): string {
    return this.#props.goal
  }
  get version(): number {
    return this.#props.version
  }

  rename(name: string, now: Date): Result<void, ProjectError> {
    const valid = validName(name)
    if (!valid.ok) return valid
    this.#props = { ...this.#props, name: valid.value, updatedAt: now }
    return ok(undefined)
  }

  updateGoal(goal: string, now: Date): Result<void, ProjectError> {
    const valid = validGoal(goal)
    if (!valid.ok) return valid
    this.#props = { ...this.#props, goal: valid.value, updatedAt: now }
    return ok(undefined)
  }

  moveToTeam(teamId: string, now: Date): void {
    this.#props = { ...this.#props, teamId, updatedAt: now }
  }

  snapshot(): ProjectProps {
    return { ...this.#props }
  }
}
