import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aiProviderConnections,
  aiUsageEntries,
} from '../src/modules/ai-gateway/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const SECRET = 'test-ok-secret-key-9999'

describe('AI provider connection (spec 004)', () => {
  let world: World
  let admin: Who
  let alex: Who

  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })
  const gate = async (who: Who) => (await call(who, 'GET', '/api/me')).json().aiProvider

  beforeAll(async () => {
    world = await startWorld({ config: { AI_PROVIDERS: 'anthropic', AI_FAKE_PROVIDER: 'true' } })
    admin = await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
  })
  afterAll(async () => {
    await world?.close()
  })

  it('asks every new account for a provider (FR-002)', async () => {
    expect(await gate(alex)).toEqual({ required: true, status: 'none' })
    const page = (await call(alex, 'GET', '/api/ai-provider')).json()
    // Vertex AI is not offered without a Google client.
    expect(page).toMatchObject({
      offered: ['anthropic', 'fake'],
      connection: null,
      googleGranted: false,
    })
  })

  it('refuses a key that fails its check, with the reason, and saves nothing', async () => {
    const response = await call(alex, 'PUT', '/api/ai-provider/api-key', {
      provider: 'fake',
      apiKey: 'test-invalid-key-0000',
    })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      code: 'AI_CHECK_FAILED',
      detail: { failure: 'INVALID_CREDENTIAL' },
    })
    expect(await gate(alex)).toEqual({ required: true, status: 'none' })
  })

  it('saves a working key and never returns it (FR-006, SC-004)', async () => {
    const response = await call(alex, 'PUT', '/api/ai-provider/api-key', {
      provider: 'fake',
      apiKey: `  ${SECRET} `,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      provider: 'fake',
      credentialHint: '9999',
      status: 'working',
    })
    expect(response.body).not.toContain('test-ok-secret')
    expect(await gate(alex)).toEqual({ required: true, status: 'working' })
    const page = await call(alex, 'GET', '/api/ai-provider')
    expect(page.body).not.toContain('test-ok-secret')
    expect(page.json().usage).toEqual({ calls: 2, inputTokens: 8, outputTokens: 1 })
    const [row] = await world.db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.accountId, alex.id))
    expect(row?.encryptedCredential).not.toContain('test-ok-secret')
  })

  it('tests the provider again on demand', async () => {
    expect((await call(alex, 'POST', '/api/ai-provider/test')).json()).toEqual({
      ok: true,
      failure: null,
    })
  })

  it('keeps the usage ledger append-only and free of prompts (FR-010)', async () => {
    const rows = await world.db
      .select()
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, alex.id))
    expect(rows.map((r) => r.outcome)).toEqual(['INVALID_CREDENTIAL', 'success', 'success'])
    expect(JSON.stringify(rows)).not.toContain('Reply with')
    await expect(world.db.execute(sql`update ai_usage_entries set task = 'x'`)).rejects.toThrow()
    await expect(world.db.execute(sql`delete from ai_usage_entries`)).rejects.toThrow()
  })

  it('says Vertex AI needs a Google client when none is configured', async () => {
    const response = await call(alex, 'POST', '/api/ai-provider/google/start', { returnTo: '/' })
    expect(response.json().code).toBe('GOOGLE_NOT_CONFIGURED')
  })

  it('removes the provider, which brings the step back', async () => {
    expect((await call(alex, 'DELETE', '/api/ai-provider')).statusCode).toBe(204)
    expect(await gate(alex)).toEqual({ required: true, status: 'none' })
  })

  it('forgets the credentials of a deleted account but keeps its usage (FR-013)', async () => {
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: SECRET })
    const deleted = await call(admin, 'DELETE', `/api/members/${alex.id}`, {
      confirmation: 'alex@example.org',
    })
    expect(deleted.statusCode).toBeLessThan(300)
    const connections = await world.db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.accountId, alex.id))
    expect(connections).toEqual([])
    const usage = await world.db
      .select()
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, alex.id))
    expect(usage.length).toBeGreaterThan(0)
  })
})
