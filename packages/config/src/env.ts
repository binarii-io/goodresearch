import { readFileSync } from 'node:fs'
import { z } from 'zod'

export type Env = Readonly<Record<string, string | undefined>>

export type AuthProvider = {
  readonly key: string
  readonly displayName: string
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly trusted: boolean
}

export const AI_PROVIDER_KINDS = ['vertex', 'anthropic', 'openai', 'fake'] as const
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number]

/** Defaults suited to conversational assistants; deployers can change them (specs/004 research R7). */
const DEFAULT_MODELS: Record<AiProviderKind, string> = {
  vertex: 'gemini-3.8-flash',
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-5.5',
  fake: 'fake-model',
}

export type AiPrice = {
  readonly model: string
  readonly from: string
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

const pricesSchema = z.array(
  z.object({
    model: z.string().min(1),
    from: z.iso.date(),
    inputPerMillion: z.number().nonnegative(),
    outputPerMillion: z.number().nonnegative(),
  }),
)

export type AccessRules = {
  /** Lower-cased emails that become admin at their first sign-in. */
  readonly adminEmails: readonly string[]
  /** Lower-cased exact emails allowed to get an account. */
  readonly allowedEmails: readonly string[]
  /** Lower-cased exact domains allowed to get an account. */
  readonly allowedDomains: readonly string[]
}

export type AppConfig = {
  readonly appUrl: URL
  readonly authSecret: string
  readonly databaseUrl: string
  readonly s3: {
    readonly endpoint: string
    readonly region: string
    readonly bucket: string
    readonly accessKeyId: string
    readonly secretAccessKey: string
    readonly forcePathStyle: boolean
    readonly createBucket: boolean
  }
  readonly providers: readonly AuthProvider[]
  readonly access: AccessRules
  readonly trustedProxies: readonly string[]
  /** Sign-in attempts allowed per client IP and minute. */
  readonly signInRateLimit: number
  /** Google OAuth client shared by the Drive connector (spec 002) and Vertex AI (spec 004); `null` when not configured. */
  readonly google: { readonly clientId: string; readonly clientSecret: string } | null
  /** AI providers offered to people (spec 004); each person uses their own credentials. */
  readonly ai: {
    readonly offered: readonly AiProviderKind[]
    readonly models: Readonly<Record<AiProviderKind, string>>
    readonly timeoutMs: number
    /** Extra or replacing dated prices (USD per million tokens), on top of the built-in catalog. */
    readonly prices: readonly AiPrice[]
  }
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  readonly port: number
}

/** Raised when the environment is invalid; the message names every faulty variable. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

/** An empty value (as left in .env.example) means "not set". */
const optionalText = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional())

const email = z.email()
const domain = z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'invalid domain')
const providerKey = z.string().regex(/^[a-z][a-z0-9-]*$/, 'lower-case letters, digits and dashes')

/** Reads `NAME`, or the content of the file at `NAME_FILE` (Docker secrets). */
const resolveFileVariants = (env: Env): Record<string, string | undefined> => {
  const resolved: Record<string, string | undefined> = { ...env }
  for (const [name, path] of Object.entries(env)) {
    if (!name.endsWith('_FILE') || !path) continue
    const target = name.slice(0, -'_FILE'.length)
    if (resolved[target] === undefined) resolved[target] = readFileSync(path, 'utf8').trim()
  }
  return resolved
}

const baseSchema = z.object({
  APP_URL: z.url(),
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  DATABASE_URL: z.string().startsWith('postgres', 'must be a PostgreSQL connection URL'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool,
  S3_CREATE_BUCKET: bool,
  AUTH_PROVIDERS: z.string().default(''),
  ADMIN_EMAILS: z.string().min(1, 'list at least one initial admin email'),
  ACCESS_ALLOWLIST: z.string().default(''),
  TRUSTED_PROXIES: z.string().default(''),
  AUTH_SIGN_IN_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  // Before spec 004 the Google client was Drive-only; the old names are still read.
  GOOGLE_DRIVE_CLIENT_ID: optionalText,
  GOOGLE_DRIVE_CLIENT_SECRET: optionalText,
  AI_PROVIDERS: z.string().default('vertex,anthropic,openai'),
  AI_MODEL_VERTEX: optionalText,
  AI_MODEL_ANTHROPIC: optionalText,
  AI_MODEL_OPENAI: optionalText,
  AI_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AI_FAKE_PROVIDER: bool,
  AI_PRICES: optionalText,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
})

const providerSchema = z.object({
  displayName: z.string().min(1),
  issuer: z.url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  trusted: bool,
})

/** Hosts of the local test identity provider (compose.dev.yaml and tests). */
const MOCK_PROVIDER_HOSTS = ['mock-oidc', 'oidc.localtest.me', 'localhost', '127.0.0.1']

const fail = (issues: readonly string[]): never => {
  throw new ConfigError(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
}

const describeIssues = (prefix: string, error: z.ZodError): string[] =>
  error.issues.map((issue) => `${prefix}${issue.path.join('.')}: ${issue.message}`)

export const loadConfig = (rawEnv: Env): AppConfig => {
  const env = resolveFileVariants(rawEnv)
  const base = baseSchema.safeParse(env)
  if (!base.success) return fail(describeIssues('', base.error))
  const values = base.data
  const issues: string[] = []

  const providers: AuthProvider[] = []
  for (const key of list(values.AUTH_PROVIDERS)) {
    const keyCheck = providerKey.safeParse(key)
    if (!keyCheck.success) {
      issues.push(`AUTH_PROVIDERS: "${key}" ${keyCheck.error.issues[0]?.message ?? 'invalid'}`)
      continue
    }
    const prefix = `AUTH_${key.toUpperCase().replaceAll('-', '_')}_`
    const parsed = providerSchema.safeParse({
      displayName: env[`${prefix}DISPLAY_NAME`],
      issuer: env[`${prefix}ISSUER`],
      clientId: env[`${prefix}CLIENT_ID`],
      clientSecret: env[`${prefix}CLIENT_SECRET`],
      trusted: env[`${prefix}TRUSTED`],
    })
    if (!parsed.success) {
      issues.push(
        ...parsed.error.issues.map(
          (i) =>
            `${prefix}${String(i.path[0])
              .replace(/[A-Z]/g, (c) => `_${c}`)
              .toUpperCase()}: ${i.message}`,
        ),
      )
      continue
    }
    providers.push({ key, ...parsed.data })
  }

  const appUrl = new URL(values.APP_URL)
  if (appUrl.protocol === 'https:') {
    for (const provider of providers) {
      if (MOCK_PROVIDER_HOSTS.includes(new URL(provider.issuer).hostname)) {
        issues.push(
          `AUTH_${provider.key.toUpperCase()}_ISSUER: the local test provider cannot be used with an https APP_URL`,
        )
      }
    }
  }

  const adminEmails = list(values.ADMIN_EMAILS)
  for (const entry of adminEmails) {
    if (!email.safeParse(entry).success) issues.push(`ADMIN_EMAILS: "${entry}" is not an email`)
  }
  const allowedEmails: string[] = []
  const allowedDomains: string[] = []
  for (const entry of list(values.ACCESS_ALLOWLIST)) {
    if (entry.includes('@')) {
      if (email.safeParse(entry).success) allowedEmails.push(entry)
      else issues.push(`ACCESS_ALLOWLIST: "${entry}" is not an email`)
    } else if (domain.safeParse(entry).success) allowedDomains.push(entry)
    else issues.push(`ACCESS_ALLOWLIST: "${entry}" is not a domain`)
  }

  const googleId = values.GOOGLE_CLIENT_ID ?? values.GOOGLE_DRIVE_CLIENT_ID
  const googleSecret = values.GOOGLE_CLIENT_SECRET ?? values.GOOGLE_DRIVE_CLIENT_SECRET
  if (Boolean(googleId) !== Boolean(googleSecret)) {
    issues.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: set both or none')
  }

  const offered: AiProviderKind[] = []
  for (const entry of list(values.AI_PROVIDERS)) {
    if (entry === 'fake' || !(AI_PROVIDER_KINDS as readonly string[]).includes(entry))
      issues.push(`AI_PROVIDERS: "${entry}" is not one of vertex, anthropic, openai`)
    // Vertex AI uses the person's Google account: it needs the Google client.
    else if (entry !== 'vertex' || googleId) offered.push(entry as AiProviderKind)
  }
  // The Vertex AI library would use this server-wide key instead of each person's own Google
  // account, billing every call to the deployer (spec 004 FR-012).
  if (env.GOOGLE_VERTEX_API_KEY)
    issues.push(
      'GOOGLE_VERTEX_API_KEY: must not be set, Vertex AI uses each person’s own Google account',
    )
  if (values.AI_FAKE_PROVIDER) {
    if (appUrl.protocol === 'https:')
      issues.push('AI_FAKE_PROVIDER: the test AI provider cannot be used with an https APP_URL')
    else offered.push('fake')
  }

  let prices: AiPrice[] = []
  if (values.AI_PRICES) {
    try {
      const parsed = pricesSchema.safeParse(JSON.parse(values.AI_PRICES))
      if (parsed.success) prices = parsed.data
      else issues.push(...describeIssues('AI_PRICES.', parsed.error))
    } catch {
      issues.push(
        'AI_PRICES: must be a JSON array of { model, from, inputPerMillion, outputPerMillion }',
      )
    }
  }

  if (issues.length > 0) return fail(issues)

  return {
    appUrl,
    authSecret: values.AUTH_SECRET,
    databaseUrl: values.DATABASE_URL,
    s3: {
      endpoint: values.S3_ENDPOINT,
      region: values.S3_REGION,
      bucket: values.S3_BUCKET,
      accessKeyId: values.S3_ACCESS_KEY_ID,
      secretAccessKey: values.S3_SECRET_ACCESS_KEY,
      forcePathStyle: values.S3_FORCE_PATH_STYLE,
      createBucket: values.S3_CREATE_BUCKET,
    },
    providers,
    access: { adminEmails, allowedEmails, allowedDomains },
    trustedProxies: list(values.TRUSTED_PROXIES),
    signInRateLimit: values.AUTH_SIGN_IN_RATE_LIMIT,
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    ai: {
      offered,
      models: {
        ...DEFAULT_MODELS,
        ...(values.AI_MODEL_VERTEX ? { vertex: values.AI_MODEL_VERTEX } : {}),
        ...(values.AI_MODEL_ANTHROPIC ? { anthropic: values.AI_MODEL_ANTHROPIC } : {}),
        ...(values.AI_MODEL_OPENAI ? { openai: values.AI_MODEL_OPENAI } : {}),
      },
      timeoutMs: values.AI_CALL_TIMEOUT_MS,
      prices,
    },
    logLevel: values.LOG_LEVEL,
    port: values.PORT,
  }
}
