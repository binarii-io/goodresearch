import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type GoogleCloudApi,
  type ModelRunner,
  ProviderCallError,
} from '../src/modules/ai-gateway/application/ports.ts'
import { aiUsageEntries } from '../src/modules/ai-gateway/infrastructure/schema.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

/** Google's token endpoint for the consent exchange: the code names the account. */
const googleFetch: typeof fetch = async (input, init) => {
  const url = String(input)
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    const code = new URLSearchParams(String(init?.body)).get('code') ?? ''
    return Response.json({
      access_token: `access-${code}`,
      refresh_token: `refresh-${code}`,
      scope: `${CLOUD_SCOPE} openid email`,
    })
  }
  return new Response('not found', { status: 404 })
}

const googleCloud: GoogleCloudApi = {
  accessToken: async () => 'access',
  apiState: async () => 'enabled',
  canPredict: async () => true,
  accountEmail: async (accessToken) =>
    accessToken === 'access-other' ? 'someone-else@example.org' : 'alex@example.org',
}

/** Vertex AI answers, unless Google refuses the grant on the next call. */
let refuseNext: 'refused' | 'reauth-required' | null = null
const usage = { inputTokens: 5, outputTokens: 1 }
const runner: ModelRunner = {
  generateText: async () => {
    if (refuseNext) {
      const problem = refuseNext
      refuseNext = null
      throw new ProviderCallError('INVALID_CREDENTIAL', null, problem)
    }
    return { text: 'OK', usage }
  },
  generateObject: async () => {
    throw new Error('not used')
  },
  stream: () => {
    throw new Error('not used')
  },
}

describe('Reconnect Google (spec 030)', () => {
  let world: World
  let alex: Who
  const drive = new InMemoryDrive()

  const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: alex.cookie },
      ...(payload ? { payload } : {}),
    })
  const me = async () => (await call('GET', '/api/me')).json()
  const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? ''

  beforeAll(async () => {
    world = await startWorld({
      drive,
      runner,
      googleCloud,
      googleFetch,
      config: {
        AI_PROVIDERS: 'vertex',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      },
    })
    alex = await world.session('alex@example.org')
    const start = (await call('POST', '/api/ai-provider/google/start', { returnTo: '/' })).json()
    await call('GET', `/api/ai-provider/google/callback?state=${stateOf(start.url)}&code=c1`)
    const checked = await call('POST', '/api/ai-provider/vertex/check', {
      project: 'my-research-1',
      region: 'europe-west1',
    })
    expect(checked.json().saved).toBe(true)
  })
  afterAll(async () => {
    await world?.close()
  })

  it('records a refused grant with its reason, costs nothing, and does not send to the setup', async () => {
    refuseNext = 'reauth-required'
    expect((await call('POST', '/api/ai-provider/test')).json()).toEqual({
      ok: false,
      failure: 'INVALID_CREDENTIAL',
    })
    expect((await me()).aiProvider).toEqual({
      required: true,
      status: 'needs-attention',
      grantProblem: 'reauth-required',
    })
    const entries = await world.db
      .select()
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, alex.id))
    expect(entries.filter((e) => e.outcome === 'INVALID_CREDENTIAL')).toEqual([
      expect.objectContaining({ task: 'provider-check', inputTokens: null, outputTokens: null }),
    ])
  })

  it('opens Google on the saved account and comes back to the pop-up page, reconnected', async () => {
    const start = await call('POST', '/api/ai-provider/google/reconnect', {
      returnTo: '/studies/s1',
      popup: true,
    })
    expect(start.statusCode).toBe(200)
    const url = new URL(start.json().url)
    expect(url.searchParams.get('login_hint')).toBe('alex@example.org')
    const back = await call(
      'GET',
      `/api/ai-provider/google/callback?state=${stateOf(url.href)}&code=c2`,
    )
    // The cost of the checks' real call goes to the page that asked for it.
    expect(back.headers.location).toMatch(
      /^\/google\/done\?connection=vertex&result=reconnected&cost=\d+(\.\d+)?(e-\d+)?$/,
    )
    expect((await me()).aiProvider).toMatchObject({ status: 'working', grantProblem: null })
    const page = (await call('GET', '/api/ai-provider')).json()
    expect(page.connection).toMatchObject({ project: 'my-research-1', region: 'europe-west1' })
  })

  it('goes back where the person was when Google was cancelled, without a pop-up', async () => {
    const start = (
      await call('POST', '/api/ai-provider/google/reconnect', {
        returnTo: '/studies/s1',
        popup: false,
      })
    ).json()
    const back = await call(
      'GET',
      `/api/ai-provider/google/callback?state=${stateOf(start.url)}&error=access_denied`,
    )
    expect(back.headers.location).toBe('/studies/s1?google=cancelled')
  })

  it('sends another Google account to the full setup', async () => {
    const start = (
      await call('POST', '/api/ai-provider/google/reconnect', { returnTo: '/', popup: false })
    ).json()
    const back = await call(
      'GET',
      `/api/ai-provider/google/callback?state=${stateOf(start.url)}&code=other`,
    )
    expect(back.headers.location).toBe('/setup/ai-provider?provider=vertex&google=other-account')
  })

  it('checks the grant once per session without any AI call', async () => {
    const before = await world.db
      .select()
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, alex.id))
    expect((await call('POST', '/api/ai-provider/grant/check')).json()).toEqual({ state: 'ok' })
    const after = await world.db
      .select()
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, alex.id))
    expect(after.length).toBe(before.length)
  })

  it('reconnects Drive with the same access and keeps the person on their page', async () => {
    drive.nextConsentAccount = 'alex@example.org'
    const connect = await call('GET', '/api/sources/google-drive/connect?returnTo=/&access=write')
    const consent = new URL(connect.headers.location ?? '')
    await call('GET', `/api/sources/google-drive/callback?state=${stateOf(consent.href)}&code=c`)
    const [token] = [...drive.tokens.keys()]
    drive.refuse(token ?? '', 'refused')
    expect((await call('POST', '/api/sources/google-drive/grant/check')).json()).toEqual({
      state: 'problem',
      grantProblem: 'refused',
    })
    expect((await me()).drive).toEqual({
      status: 'lost',
      grantProblem: 'refused',
      account: 'alex@example.org',
    })
    const start = (
      await call('POST', '/api/sources/google-drive/reconnect', {
        returnTo: '/studies/s1',
        popup: true,
      })
    ).json()
    expect(new URL(start.url).searchParams.get('login_hint')).toBe('alex@example.org')
    const back = await call(
      'GET',
      `/api/sources/google-drive/callback?state=${stateOf(start.url)}&code=c`,
    )
    expect(back.headers.location).toBe('/google/done?connection=drive&result=reconnected')
    expect(drive.consents.at(-1)).toBe('write')
    expect((await me()).drive).toMatchObject({ status: 'connected', grantProblem: null })
  })
})
