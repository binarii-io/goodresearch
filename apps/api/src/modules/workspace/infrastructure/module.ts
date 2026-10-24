import type { Clock } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { makeAccountCommands } from '../application/commands/account-commands.ts'
import { makeCreateTeam } from '../application/commands/create-team.ts'
import { makeDeleteTeam } from '../application/commands/delete-team.ts'
import { makeRenameTeam } from '../application/commands/rename-team.ts'
import { makeSetLanguage } from '../application/commands/set-language.ts'
import type { ProjectCounter, WorkspaceUnitOfWork } from '../application/ports.ts'
import { makeGetAccessContext } from '../application/queries/get-access-context.ts'
import { makeGetMe } from '../application/queries/get-me.ts'
import {
  makeMemberQueries,
  type ProjectCountsByTeam,
} from '../application/queries/member-queries.ts'
import { makeTeamDirectory } from '../application/queries/team-directory.ts'
import type { SignInRules } from '../domain/sign-in-policy.ts'
import { drizzleAccountRepository } from './account.drizzle-repository.ts'
import { createAuthGate } from './auth-gate.ts'
import type { WorkspaceHandlers } from './http.routes.ts'
import { drizzleTeamRepository } from './team.drizzle-repository.ts'

/** Builds the workspace module from its infrastructure (called by the composition root). */
export const createWorkspaceModule = (deps: {
  db: Db
  clock: Clock
  rules: SignInRules
  /** Lazily bound: the research module is built after this one. */
  projects: () => { countByTeam: ProjectCounter['countByTeam']; countByTeams: ProjectCountsByTeam }
}) => {
  const { db, clock } = deps
  const uow: WorkspaceUnitOfWork = (work) =>
    db.transaction((tx) =>
      work({ teams: drizzleTeamRepository(tx), accounts: drizzleAccountRepository(tx) }),
    )

  const handlers: WorkspaceHandlers = {
    createTeam: makeCreateTeam({ uow, clock }),
    renameTeam: makeRenameTeam({ uow, clock }),
    deleteTeam: makeDeleteTeam({
      uow,
      clock,
      projects: { countByTeam: (id) => deps.projects().countByTeam(id) },
    }),
    setLanguage: makeSetLanguage({
      preferences: {
        setLanguage: async (accountId, language) => {
          await db.update(auth_users).set({ language }).where(eq(auth_users.id, accountId))
        },
      },
    }),
    accounts: makeAccountCommands({ uow, clock }),
    getMe: makeGetMe(db),
    queries: makeMemberQueries({ db, projectCounts: (ids) => deps.projects().countByTeams(ids) }),
  }

  return {
    authGate: createAuthGate({ db, rules: deps.rules, clock }),
    handlers,
    getAccessContext: makeGetAccessContext(db),
    ...makeTeamDirectory(db),
  }
}
