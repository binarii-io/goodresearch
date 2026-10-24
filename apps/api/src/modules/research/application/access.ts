import type { AccessContext, TeamDirectory } from './ports.ts'

/** FR-011: admins act on every existing team; members only on theirs. */
export const canUseTeam = async (
  teams: TeamDirectory,
  access: AccessContext,
  teamId: string,
): Promise<boolean> =>
  access.role === 'admin' ? teams.teamExists(teamId) : access.teamIds.includes(teamId)
