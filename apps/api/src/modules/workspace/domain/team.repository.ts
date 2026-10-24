export { ConcurrencyError } from '@goodresearch/shared'

import type { TeamId } from './actor.ts'
import type { Team } from './team.ts'

export interface TeamRepository {
  findById(id: TeamId): Promise<Team | null>
  existsByNameKey(nameKey: string, exceptId?: TeamId): Promise<boolean>
  /** Inserts or updates with optimistic locking; throws `ConcurrencyError` on a stale version. */
  save(team: Team): Promise<void>
  delete(id: TeamId): Promise<void>
}
