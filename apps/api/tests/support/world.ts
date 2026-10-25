import type { StartedTestContainer } from 'testcontainers'
import type { ModelRunner } from '../../src/modules/ai-gateway/application/ports.ts'
import type { InMemoryDrive } from '../../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { workspaceTeamMemberships } from '../../src/modules/workspace/infrastructure/schema.ts'
import type { Db } from '../../src/platform/db.ts'
import { signIn, startTestApp, testConfig } from './app.ts'
import { createTestDatabase } from './database.ts'
import { insertTeams } from './fixtures.ts'
import { startMockOidc } from './oidc.ts'

/** A running app with its own database and identity provider, plus helpers to arrange data. */
export const startWorld = async (
  options: { drive?: InMemoryDrive; config?: Record<string, string>; runner?: ModelRunner } = {},
) => {
  const oidc: { issuer: string; container: StartedTestContainer } = await startMockOidc()
  const database = await createTestDatabase()
  const { app, clock, runJobs } = await startTestApp(
    testConfig(oidc.issuer, options.config),
    database.db,
    {
      ...(options.drive ? { drive: options.drive } : {}),
      ...(options.runner ? { runner: options.runner } : {}),
    },
  )
  const db: Db = database.db

  const session = async (email: string) => {
    const result = await signIn(app, { email })
    if (result.status !== 'signed-in') throw new Error(`could not sign in ${email}`)
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: result.cookie },
    })
    return { cookie: result.cookie, id: me.json<{ id: string }>().id }
  }

  const team = async (name: string) => {
    const [id] = await insertTeams(db, [name])
    if (!id) throw new Error('fixture')
    return id
  }

  const addMember = async (accountId: string, teamId: string) => {
    await db
      .insert(workspaceTeamMemberships)
      .values({ teamId, accountId, grantedAt: new Date(), grantedBy: null })
  }

  const close = async () => {
    await app.close()
    await database.close()
    await oidc.container.stop()
  }

  return { app, db, clock, runJobs, session, team, addMember, close }
}

export type World = Awaited<ReturnType<typeof startWorld>>
