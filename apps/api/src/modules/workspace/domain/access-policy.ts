import type { Role } from './actor.ts'

/** FR-011: admins act on every team; members only on the teams they belong to. */
export const canAccessTeam = (
  access: { role: Role; teamIds: readonly string[] },
  teamId: string,
): boolean => access.role === 'admin' || access.teamIds.includes(teamId)
