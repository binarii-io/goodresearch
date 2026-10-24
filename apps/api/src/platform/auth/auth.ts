import type { AppConfig, AuthProvider } from '@goodresearch/config'
import { newId } from '@goodresearch/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { genericOAuth } from 'better-auth/plugins'
import type { Db } from '../db.ts'
import * as authSchema from './auth-schema.ts'

const DAY = 24 * 60 * 60

/** Set by our HTTP adapter from Fastify's `request.ip` (which honours TRUSTED_PROXIES); never trusted from clients. */
export const CLIENT_IP_HEADER = 'x-goodresearch-client-ip'

/** A sign-in attempt as seen by the domain (no library types leak out). */
export type SignInAttempt = {
  readonly action: 'create-user' | 'link-account' | 'sign-in'
  /** Existing account id on returning sign-ins. */
  readonly accountId: string | undefined
  readonly email: string
  readonly emailVerified: boolean
  readonly providerTrusted: boolean
}

/** Domain callbacks the auth library calls; implemented by the workspace module (compose.ts). */
export type AuthGate = {
  /** Decides whether the sign-in attempt is allowed. */
  authorize(attempt: SignInAttempt): Promise<boolean>
  /** Role of a new account, from the initial admin emails. */
  roleForNewAccount(email: string): 'admin' | 'member'
  /** Records the `account_created` access event (idempotent). */
  onAccountCreated(accountId: string): Promise<void>
  isActive(accountId: string): Promise<boolean>
  onSignedIn(accountId: string): Promise<void>
}

const ACCESS_DENIED = { error: 'access_denied' } as const

const toBoolean = (value: unknown): boolean => value === true || value === 'true'

const languageFrom = (acceptLanguage: string | null | undefined): 'en' | 'fr' =>
  acceptLanguage?.trim().toLowerCase().startsWith('fr') ? 'fr' : 'en'

const nameFrom = (name: unknown, email: string): string => {
  const candidate =
    typeof name === 'string' && name.trim().length > 0 ? name.trim() : email.split('@')[0]
  return (candidate ?? email).slice(0, 120)
}

const providerConfig = (provider: AuthProvider) => ({
  providerId: provider.key,
  name: provider.displayName,
  discoveryUrl: `${provider.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
  clientId: provider.clientId,
  clientSecret: provider.clientSecret,
  scopes: ['openid', 'email', 'profile'],
  requireIdTokenVerification: true,
  // A returning person's provider name and email replace the stored ones (if still allowed).
  overrideUserInfo: true,
  // Runs on every sign-in (with overrideUserInfo): a provider without a name claim must not erase the name.
  mapProfileToUser: (profile: Record<string, unknown>) => {
    const email = typeof profile.email === 'string' ? profile.email.toLowerCase() : ''
    return {
      emailVerified: toBoolean(profile.email_verified),
      name: nameFrom(profile.name ?? profile.preferred_username, email),
    }
  },
})

export const createAuth = (deps: {
  config: Pick<AppConfig, 'appUrl' | 'authSecret' | 'providers' | 'signInRateLimit'>
  db: Db
  gate: AuthGate
  /** Disabled only by tests that sign in many times in a row. */
  rateLimit?: boolean
}) => {
  const { config, db, gate } = deps
  const trusted = new Set(config.providers.filter((p) => p.trusted).map((p) => p.key))

  return betterAuth({
    appName: 'goodresearch',
    baseURL: config.appUrl.origin,
    basePath: '/api/auth',
    secret: config.authSecret,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema, transaction: true }),
    // goodresearch never manages passwords (constitution III).
    emailAndPassword: { enabled: false },
    user: {
      modelName: 'auth_users',
      additionalFields: {
        role: { type: 'string', required: true, defaultValue: 'member', input: false },
        status: { type: 'string', required: true, defaultValue: 'active', input: false },
        language: { type: 'string', required: true, defaultValue: 'en', input: false },
        lastSignInAt: { type: 'date', required: false, input: false },
      },
      validateUserInfo: async ({ user, source }) => {
        const providerId = source.oauth?.providerId
        if (source.method !== 'oauth' || !providerId || typeof user.email !== 'string')
          return ACCESS_DENIED
        const decision = await gate.authorize({
          action: source.action,
          accountId: typeof user.id === 'string' ? user.id : undefined,
          email: user.email.toLowerCase(),
          emailVerified: toBoolean(user.emailVerified),
          providerTrusted: trusted.has(providerId),
        })
        return decision ? undefined : ACCESS_DENIED
      },
    },
    session: {
      modelName: 'auth_sessions',
      expiresIn: 7 * DAY,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'auth_accounts',
      // Linking needs a verified email unless the deployer trusts the provider.
      accountLinking: {
        enabled: true,
        trustedProviders: [...trusted],
        allowDifferentEmails: false,
      },
      // Sign-in tokens are only for identity; encrypt them at rest. Sources (e.g. Drive) use their own grants (ADR-0005).
      encryptOAuthTokens: true,
    },
    verification: { modelName: 'auth_verifications' },
    rateLimit: {
      enabled: deps.rateLimit ?? true,
      storage: 'database',
      modelName: 'auth_rate_limits',
      // Per client IP. Sign-in only starts a redirect to the provider; offices share one IP (AUTH_SIGN_IN_RATE_LIMIT).
      customRules: { '/sign-in/social': { window: 60, max: config.signInRateLimit } },
    },
    advanced: {
      cookiePrefix: 'goodresearch',
      useSecureCookies: config.appUrl.protocol === 'https:',
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: () => newId() },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            // validateUserInfo already allowed this account; only its initial values are set here.
            const email = user.email.toLowerCase()
            return {
              data: {
                ...user,
                email,
                name: nameFrom(user.name, email),
                role: gate.roleForNewAccount(email),
                status: 'active',
                language: languageFrom(context?.headers?.get('accept-language')),
              },
            }
          },
          after: async (user) => {
            await gate.onAccountCreated(user.id)
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (!(await gate.isActive(session.userId))) {
              throw new APIError('UNAUTHORIZED', { message: 'access_denied' })
            }
          },
          after: async (session) => {
            await gate.onSignedIn(session.userId)
          },
        },
      },
    },
    plugins:
      config.providers.length > 0
        ? [genericOAuth({ config: config.providers.map(providerConfig) })]
        : [],
  })
}

export type Auth = ReturnType<typeof createAuth>
