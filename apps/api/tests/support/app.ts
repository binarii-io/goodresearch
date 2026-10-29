import { type AppConfig, loadConfig } from '@goodresearch/config'
import { fixedClock } from '@goodresearch/shared'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { composeApp } from '../../src/compose.ts'
import type { ModelRunner } from '../../src/modules/ai-gateway/application/ports.ts'
import type { InMemoryDrive } from '../../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import type { Db } from '../../src/platform/db.ts'

export const testConfig = (issuer: string, overrides: Record<string, string> = {}): AppConfig =>
  loadConfig({
    APP_URL: 'http://localhost:3000',
    AUTH_SECRET: 'test-secret-'.padEnd(48, 'q'),
    DATABASE_URL: 'postgres://unused-in-tests',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    ADMIN_EMAILS: 'admin@example.org',
    ACCESS_ALLOWLIST: 'alex@example.org,research.example.com',
    AUTH_PROVIDERS: 'mock',
    AUTH_MOCK_DISPLAY_NAME: 'Test provider',
    AUTH_MOCK_ISSUER: issuer,
    AUTH_MOCK_CLIENT_ID: 'goodresearch',
    AUTH_MOCK_CLIENT_SECRET: 'secret',
    ...overrides,
  })

export const startTestApp = async (
  config: AppConfig,
  db: Db,
  options: { rateLimit?: boolean; drive?: InMemoryDrive; runner?: ModelRunner } = {},
) => {
  const clock = fixedClock(new Date())
  const queued: { queue: string; data: object }[] = []
  const { app, modules } = await composeApp(
    config,
    {
      db,
      isReady: async () => true,
      clock,
      jobs: {
        send: async (queue, data) => {
          queued.push({ queue, data })
          return true
        },
      },
      ...(options.drive
        ? {
            drive: {
              gateway: options.drive,
              authorization: options.drive,
              documents: options.drive.documents,
            },
          }
        : {}),
      ...(options.runner ? { ai: { runner: options.runner } } : {}),
    },
    { logger: false, rateLimit: options.rateLimit ?? false },
  )
  await app.ready()
  /** Runs queued jobs as the worker would. */
  const runJobs = async () => {
    while (queued.length > 0) {
      const job = queued.shift()
      const handler = [
        ...modules.ingestion.jobs,
        ...modules.transcripts.jobs,
        ...modules.evidence.jobs,
      ].find((h) => h.queue === job?.queue)
      if (job && handler) await handler.handle(job.data)
    }
  }
  return { app, clock, runJobs }
}

const cookiesOf = (response: { headers: Record<string, unknown> }): string[] => {
  const raw = response.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return list.map((c: string) => c.split(';')[0] ?? '').filter((c) => c.length > 0)
}

/** Cookie header from cookies set by responses (later values win). */
const mergeCookies = (...groups: string[][]): string => {
  const jar = new Map<string, string>()
  for (const cookie of groups.flat()) {
    const [name] = cookie.split('=')
    if (name) jar.set(name, cookie)
  }
  return [...jar.values()].join('; ')
}

export type SignInResult =
  | { status: 'signed-in'; cookie: string }
  | { status: 'refused'; location: string }

/**
 * Runs the full OpenID Connect sign-in through the mock provider's login form, with the given claims.
 */
export const signIn = async (
  app: FastifyInstance,
  claims: { email: string; email_verified?: boolean | string; name?: string; sub?: string },
  headers: Record<string, string> = {},
): Promise<SignInResult> => {
  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/social',
    payload: { provider: 'mock', callbackURL: '/', errorCallbackURL: '/sign-in' },
    headers: { origin: 'http://localhost:3000', ...headers },
  })
  if (start.statusCode !== 200)
    throw new Error(`sign-in start failed: ${start.statusCode} ${start.body}`)
  const { url } = start.json<{ url: string }>()
  const startCookies = cookiesOf(start)

  const login = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      username: claims.sub ?? claims.email,
      claims: JSON.stringify({ email_verified: true, ...claims }),
    }),
  })
  const location = login.headers.get('location')
  if (!location) throw new Error(`mock provider did not redirect: ${login.status}`)
  const callback = new URL(location)

  const done: LightMyRequestResponse = await app.inject({
    method: 'GET',
    url: `${callback.pathname}${callback.search}`,
    headers: { cookie: mergeCookies(startCookies), ...headers },
  })
  const target = String(done.headers.location ?? '')
  const sessionCookies = cookiesOf(done)
  const signedIn = sessionCookies.some((c) => c.includes('session_token=') && !c.endsWith('='))
  return signedIn
    ? { status: 'signed-in', cookie: mergeCookies(startCookies, sessionCookies) }
    : { status: 'refused', location: target }
}
