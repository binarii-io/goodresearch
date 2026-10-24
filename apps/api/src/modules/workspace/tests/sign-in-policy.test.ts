import { describe, expect, it } from 'vitest'
import { authorizeSignIn, roleForNewAccount, type SignInRules } from '../domain/sign-in-policy.ts'

const rules: SignInRules = {
  adminEmails: ['admin@example.org'],
  allowedEmails: ['alex@example.org'],
  allowedDomains: ['research.example.com'],
}

const attempt = (overrides: Partial<Parameters<typeof authorizeSignIn>[1]> = {}) => ({
  action: 'create-user' as const,
  email: 'alex@example.org',
  emailVerified: true,
  providerTrusted: false,
  existingRole: undefined,
  ...overrides,
})

describe('authorizeSignIn', () => {
  it('refuses an unverified email from an untrusted provider', () => {
    expect(authorizeSignIn(rules, attempt({ emailVerified: false }))).toBe(false)
  })

  it('accepts an unverified email from a trusted provider', () => {
    expect(authorizeSignIn(rules, attempt({ emailVerified: false, providerTrusted: true }))).toBe(
      true,
    )
  })

  it('accepts initial admins even when they are not allow-listed', () => {
    expect(authorizeSignIn(rules, attempt({ email: 'admin@example.org' }))).toBe(true)
  })

  it('accepts an exact allow-listed email, ignoring case', () => {
    expect(authorizeSignIn(rules, attempt({ email: 'Alex@Example.org' }))).toBe(true)
  })

  it('accepts an allow-listed domain but not its subdomains', () => {
    expect(authorizeSignIn(rules, attempt({ email: 'sam@research.example.com' }))).toBe(true)
    expect(authorizeSignIn(rules, attempt({ email: 'sam@eu.research.example.com' }))).toBe(false)
    expect(authorizeSignIn(rules, attempt({ email: 'sam@example.com' }))).toBe(false)
  })

  it('refuses anyone else', () => {
    expect(authorizeSignIn(rules, attempt({ email: 'kim@other.example' }))).toBe(false)
  })

  it('re-checks the allow-list when a member signs in again', () => {
    expect(
      authorizeSignIn(
        rules,
        attempt({ action: 'sign-in', existingRole: 'member', email: 'kim@other.example' }),
      ),
    ).toBe(false)
    expect(authorizeSignIn(rules, attempt({ action: 'sign-in', existingRole: 'member' }))).toBe(
      true,
    )
  })

  it('lets an existing admin sign in even after leaving the configuration', () => {
    expect(
      authorizeSignIn(
        rules,
        attempt({ action: 'sign-in', existingRole: 'admin', email: 'former@other.example' }),
      ),
    ).toBe(true)
  })

  it('still requires a verified email for an existing admin', () => {
    expect(
      authorizeSignIn(
        rules,
        attempt({ action: 'sign-in', existingRole: 'admin', emailVerified: false }),
      ),
    ).toBe(false)
  })
})

describe('roleForNewAccount', () => {
  it('makes initial admins admin and everyone else member', () => {
    expect(roleForNewAccount(rules, 'ADMIN@example.org')).toBe('admin')
    expect(roleForNewAccount(rules, 'alex@example.org')).toBe('member')
  })
})
