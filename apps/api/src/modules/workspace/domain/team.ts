import { err, ok, type Result } from '@goodresearch/shared'
import type { TeamId } from './actor.ts'

export type TeamProps = {
  readonly id: TeamId
  readonly name: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

export type TeamError = 'VALIDATION'

const MAX_NAME = 80

/** Uniqueness key: case and surrounding spaces are ignored (FR-021). */
export const teamNameKey = (name: string): string => name.trim().toLowerCase()

const validName = (name: string): Result<string, TeamError> => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME ? ok(trimmed) : err('VALIDATION')
}

export class Team {
  #props: TeamProps

  private constructor(props: TeamProps) {
    this.#props = props
  }

  static create(input: { id: string; name: string; now: Date }): Result<Team, TeamError> {
    const name = validName(input.name)
    if (!name.ok) return name
    return ok(
      new Team({
        id: input.id as TeamId,
        name: name.value,
        createdAt: input.now,
        updatedAt: input.now,
        version: 0,
      }),
    )
  }

  static fromPersistence(props: TeamProps): Team {
    return new Team(props)
  }

  get id(): TeamId {
    return this.#props.id
  }
  get name(): string {
    return this.#props.name
  }
  get nameKey(): string {
    return teamNameKey(this.#props.name)
  }
  get version(): number {
    return this.#props.version
  }

  rename(name: string, now: Date): Result<void, TeamError> {
    const valid = validName(name)
    if (!valid.ok) return valid
    this.#props = { ...this.#props, name: valid.value, updatedAt: now }
    return ok(undefined)
  }

  snapshot(): TeamProps {
    return { ...this.#props }
  }
}
