import { eq } from 'drizzle-orm'
import type { StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { workspaceAccessEvents } from '../src/modules/workspace/infrastructure/schema.ts'
import { auth_users } from '../src/platform/auth/auth-schema.ts'
import type { Db } from '../src/platform/db.ts'
import { signIn, startTestApp, testConfig } from './support/app.ts'
import { createTestDatabase } from './support/database.ts'
import { startMockOidc } from './support/oidc.ts'

// SC-005: every sign-in case matches FR-004 to FR-007, and no refused attempt creates an account.
describe('sign-in through an OpenID Connect provider', () => {
  let oidc: { issuer: string; container: StartedTestContainer }
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let db: Db
  let app: Awaited<ReturnType<typeof startTestApp>>['app']

  beforeAll(async () => {
    oidc = await startMockOidc()
    database = await createTestDatabase()
    db = database.db
    ;({ app } = await startTestApp(testConfig(oidc.issuer), db))
  })

  afterAll(async () => {
    await app?.close()
    await database?.close()
    await oidc?.container.stop()
  })

  const accountByEmail = async (email: string) => {
    const [row] = await db.select().from(auth_users).where(eq(auth_users.email, email))
    return row
  }

  it('makes an initial admin email an admin, with the browser language', async () => {
    const result = await signIn(
      app,
      { email: 'admin@example.org', name: 'Ada Admin' },
      { 'accept-language': 'fr-FR,fr;q=0.9' },
    )
    expect(result.status).toBe('signed-in')
    const account = await accountByEmail('admin@example.org')
    expect(account).toMatchObject({
      role: 'admin',
      status: 'active',
      language: 'fr',
      name: 'Ada Admin',
    })
    const events = await db
      .select()
      .from(workspaceAccessEvents)
      .where(eq(workspaceAccessEvents.subjectId, account?.id ?? ''))
    expect(events.map((e) => e.type)).toEqual(['account_created'])
    if (result.status !== 'signed-in') return
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: result.cookie },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({
      email: 'admin@example.org',
      role: 'admin',
      language: 'fr',
      teams: [],
    })
  })

  it('creates a member for an allow-listed email, named after the email when the provider sends no name', async () => {
    expect((await signIn(app, { email: 'alex@example.org' })).status).toBe('signed-in')
    expect(await accountByEmail('alex@example.org')).toMatchObject({
      role: 'member',
      name: 'alex',
      language: 'en',
    })
  })

  it('keeps the name when a provider without a name claim signs the person in again', async () => {
    await signIn(app, { sub: 'nameless', email: 'nameless@research.example.com' })
    await signIn(app, { sub: 'nameless', email: 'nameless@research.example.com' })
    expect((await accountByEmail('nameless@research.example.com'))?.name).toBe('nameless')
  })

  it('creates a member for an allow-listed domain', async () => {
    expect((await signIn(app, { email: 'sam@research.example.com' })).status).toBe('signed-in')
    expect(await accountByEmail('sam@research.example.com')).toMatchObject({ role: 'member' })
  })

  it('refuses a non-listed email without creating an account', async () => {
    const result = await signIn(app, { email: 'kim@other.example' })
    expect(result.status).toBe('refused')
    expect(await accountByEmail('kim@other.example')).toBeUndefined()
  })

  it('refuses an unverified email from an untrusted provider without creating an account', async () => {
    const result = await signIn(app, { email: 'lee@research.example.com', email_verified: false })
    expect(result.status).toBe('refused')
    expect(await accountByEmail('lee@research.example.com')).toBeUndefined()
  })

  it('accepts the string "true" for email_verified', async () => {
    expect(
      (await signIn(app, { email: 'str@research.example.com', email_verified: 'true' })).status,
    ).toBe('signed-in')
  })

  it('refuses a deactivated account', async () => {
    await signIn(app, { email: 'dee@research.example.com' })
    await db
      .update(auth_users)
      .set({ status: 'deactivated' })
      .where(eq(auth_users.email, 'dee@research.example.com'))
    expect((await signIn(app, { email: 'dee@research.example.com' })).status).toBe('refused')
  })

  it('updates the email of a returning person when the new one is still allowed', async () => {
    await signIn(app, { sub: 'person-1', email: 'old@research.example.com' })
    const before = await accountByEmail('old@research.example.com')
    expect((await signIn(app, { sub: 'person-1', email: 'new@research.example.com' })).status).toBe(
      'signed-in',
    )
    expect((await accountByEmail('new@research.example.com'))?.id).toBe(before?.id)
  })

  it('refuses a returning member whose new email is no longer allowed', async () => {
    await signIn(app, { sub: 'person-2', email: 'moving@research.example.com' })
    expect((await signIn(app, { sub: 'person-2', email: 'moving@other.example' })).status).toBe(
      'refused',
    )
  })

  it('rejects requests without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('trusted provider', () => {
  let oidc: { issuer: string; container: StartedTestContainer }
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let app: Awaited<ReturnType<typeof startTestApp>>['app']

  beforeAll(async () => {
    oidc = await startMockOidc()
    database = await createTestDatabase()
    ;({ app } = await startTestApp(
      testConfig(oidc.issuer, { AUTH_MOCK_TRUSTED: 'true' }),
      database.db,
    ))
  })

  afterAll(async () => {
    await app?.close()
    await database?.close()
    await oidc?.container.stop()
  })

  it('accepts an unverified email when the deployer trusts the provider', async () => {
    expect(
      (await signIn(app, { email: 'una@research.example.com', email_verified: false })).status,
    ).toBe('signed-in')
  })
})

describe('rate limiting', () => {
  let oidc: { issuer: string; container: StartedTestContainer }
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let app: Awaited<ReturnType<typeof startTestApp>>['app']

  beforeAll(async () => {
    oidc = await startMockOidc()
    database = await createTestDatabase()
    ;({ app } = await startTestApp(testConfig(oidc.issuer), database.db, { rateLimit: true }))
  })

  afterAll(async () => {
    await app?.close()
    await database?.close()
    await oidc?.container.stop()
  })

  const attempt = (remoteAddress: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'mock', callbackURL: '/' },
      headers: { origin: 'http://localhost:3000', 'x-goodresearch-client-ip': '1.2.3.4' },
      remoteAddress,
    })

  it('slows down repeated sign-in attempts per client IP, ignoring a spoofed IP header', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 22; i++) statuses.push((await attempt('10.0.0.1')).statusCode)
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
    // Another client is not affected (the bucket is not shared).
    expect((await attempt('10.0.0.2')).statusCode).toBe(200)
  })
})
