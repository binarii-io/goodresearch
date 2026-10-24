import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './env.ts'

const valid = {
  APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'goodresearch',
  S3_ACCESS_KEY_ID: 'dev',
  S3_SECRET_ACCESS_KEY: 'devsecret',
  ADMIN_EMAILS: 'Admin@Example.org',
  AUTH_PROVIDERS: 'google',
  AUTH_GOOGLE_DISPLAY_NAME: 'Google',
  AUTH_GOOGLE_ISSUER: 'https://accounts.google.com',
  AUTH_GOOGLE_CLIENT_ID: 'id',
  AUTH_GOOGLE_CLIENT_SECRET: 'secret',
}

const errorOf = (env: Record<string, string | undefined>): string => {
  try {
    loadConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) return error.message
    throw error
  }
  throw new Error('expected a ConfigError')
}

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const config = loadConfig(valid)
    expect(config.providers).toEqual([
      {
        key: 'google',
        displayName: 'Google',
        issuer: 'https://accounts.google.com',
        clientId: 'id',
        clientSecret: 'secret',
        trusted: false,
      },
    ])
    expect(config.access.adminEmails).toEqual(['admin@example.org'])
    expect(config.logLevel).toBe('info')
    expect(config.port).toBe(3000)
    expect(config.s3.createBucket).toBe(false)
  })

  it('allows no provider (sign-in not configured)', () => {
    expect(loadConfig({ ...valid, AUTH_PROVIDERS: '' }).providers).toEqual([])
  })

  it('splits the allow-list into emails and domains, lower-cased', () => {
    const config = loadConfig({
      ...valid,
      ACCESS_ALLOWLIST: ' Sam@Example.org , Research.Example.com ',
    })
    expect(config.access.allowedEmails).toEqual(['sam@example.org'])
    expect(config.access.allowedDomains).toEqual(['research.example.com'])
  })

  it('names every invalid variable', () => {
    const message = errorOf({ ...valid, AUTH_SECRET: 'short', APP_URL: 'nope' })
    expect(message).toContain('AUTH_SECRET')
    expect(message).toContain('APP_URL')
  })

  it('reports missing provider settings by variable name', () => {
    const message = errorOf({ ...valid, AUTH_GOOGLE_CLIENT_ID: undefined })
    expect(message).toContain('AUTH_GOOGLE_CLIENT_ID')
  })

  it('rejects invalid allow-list and admin entries', () => {
    const message = errorOf({
      ...valid,
      ADMIN_EMAILS: 'not-an-email',
      ACCESS_ALLOWLIST: 'bad@, nodot',
    })
    expect(message).toContain('ADMIN_EMAILS: "not-an-email"')
    expect(message).toContain('ACCESS_ALLOWLIST: "bad@"')
    expect(message).toContain('ACCESS_ALLOWLIST: "nodot"')
  })

  it('refuses the local test provider with an https APP_URL', () => {
    const message = errorOf({
      ...valid,
      APP_URL: 'https://research.example.org',
      AUTH_PROVIDERS: 'mock',
      AUTH_MOCK_DISPLAY_NAME: 'Test provider',
      AUTH_MOCK_ISSUER: 'http://mock-oidc:8080/default',
      AUTH_MOCK_CLIENT_ID: 'goodresearch',
      AUTH_MOCK_CLIENT_SECRET: 'secret',
    })
    expect(message).toContain('local test provider')
  })

  it('enables the Google client only with both values, under the new or the old names', () => {
    expect(loadConfig(valid).google).toBeNull()
    expect(
      loadConfig({ ...valid, GOOGLE_CLIENT_ID: 'new', GOOGLE_CLIENT_SECRET: 'n' }).google,
    ).toEqual({ clientId: 'new', clientSecret: 'n' })
    expect(
      loadConfig({ ...valid, GOOGLE_DRIVE_CLIENT_ID: '', GOOGLE_DRIVE_CLIENT_SECRET: '' }).google,
    ).toBeNull()
    expect(
      loadConfig({ ...valid, GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 's' })
        .google,
    ).toEqual({
      clientId: 'id',
      clientSecret: 's',
    })
    expect(errorOf({ ...valid, GOOGLE_DRIVE_CLIENT_ID: 'id' })).toContain('set both or none')
  })

  it('offers the three AI providers by default, Vertex AI only with a Google client', () => {
    expect(loadConfig(valid).ai.offered).toEqual(['anthropic', 'openai'])
    const withGoogle = loadConfig({ ...valid, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })
    expect(withGoogle.ai.offered).toEqual(['vertex', 'anthropic', 'openai'])
    expect(loadConfig({ ...valid, AI_PROVIDERS: 'openai' }).ai.offered).toEqual(['openai'])
    expect(loadConfig({ ...valid, AI_PROVIDERS: '' }).ai.offered).toEqual([])
    expect(errorOf({ ...valid, AI_PROVIDERS: 'mistral' })).toContain('AI_PROVIDERS')
  })

  it('lets the deployer change the model of each provider', () => {
    const config = loadConfig({ ...valid, AI_MODEL_ANTHROPIC: 'a-model' })
    expect(config.ai.models.anthropic).toBe('a-model')
    expect(config.ai.models.openai).toBeTruthy()
  })

  it('refuses a server-wide Vertex AI key', () => {
    expect(errorOf({ ...valid, GOOGLE_VERTEX_API_KEY: 'k' })).toContain('GOOGLE_VERTEX_API_KEY')
  })

  it('allows the test AI provider only without https', () => {
    expect(loadConfig({ ...valid, AI_FAKE_PROVIDER: 'true' }).ai.offered).toContain('fake')
    expect(
      errorOf({ ...valid, APP_URL: 'https://research.example.org', AI_FAKE_PROVIDER: 'true' }),
    ).toContain('AI_FAKE_PROVIDER')
  })

  it('reads secrets from *_FILE variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    const file = join(dir, 'secret')
    writeFileSync(file, `${'s'.repeat(40)}\n`)
    const config = loadConfig({ ...valid, AUTH_SECRET: undefined, AUTH_SECRET_FILE: file })
    expect(config.authSecret).toBe('s'.repeat(40))
  })
})
