export type Access = { readonly role: 'admin' | 'member'; readonly teamIds: readonly string[] }

/** Spec 026: `team` changes and sees everything; `reader` reads what is open to every member. */
export type Relation = 'team' | 'reader'

export const relationTo = (access: Access | null, teamId: string): Relation | null => {
  if (!access) return null
  return access.role === 'admin' || access.teamIds.includes(teamId) ? 'team' : 'reader'
}

/** Spec 026 FR-009: an admin, or the project's creator while in its team. */
export const canDeleteProject = (
  access: Access | null,
  accountId: string,
  project: { readonly teamId: string; readonly createdBy: string | null },
): boolean =>
  access?.role === 'admin' ||
  (project.createdBy === accountId && relationTo(access, project.teamId) === 'team')
