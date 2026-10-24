import type { Role } from './actor.ts'

/** Deployer configuration relevant to sign-in, lower-cased (ADMIN_EMAILS, ACCESS_ALLOWLIST). */
export type SignInRules = {
  readonly adminEmails: readonly string[]
  readonly allowedEmails: readonly string[]
  readonly allowedDomains: readonly string[]
}

export type SignInAttempt = {
  readonly action: 'create-user' | 'link-account' | 'sign-in'
  readonly email: string
  readonly emailVerified: boolean
  readonly providerTrusted: boolean
  /** Role of the existing account on a returning sign-in. */
  readonly existingRole: Role | undefined
}

const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1)

const isListed = (rules: SignInRules, email: string): boolean => {
  const normalised = email.trim().toLowerCase()
  return (
    rules.adminEmails.includes(normalised) ||
    rules.allowedEmails.includes(normalised) ||
    rules.allowedDomains.includes(domainOf(normalised))
  )
}

/**
 * FR-004 to FR-007. A verified email is required unless the provider is trusted. New accounts and
 * returning members must match the initial admin emails or the allow-list (exact email or exact
 * domain). Existing admins keep access: their role is managed in the app from then on.
 */
export const authorizeSignIn = (rules: SignInRules, attempt: SignInAttempt): boolean => {
  if (!attempt.emailVerified && !attempt.providerTrusted) return false
  if (attempt.action === 'sign-in' && attempt.existingRole === 'admin') return true
  return isListed(rules, attempt.email)
}

export const roleForNewAccount = (rules: SignInRules, email: string): Role =>
  rules.adminEmails.includes(email.trim().toLowerCase()) ? 'admin' : 'member'
