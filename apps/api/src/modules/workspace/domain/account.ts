import { err, ok, type Result } from '@goodresearch/shared'
import type { AccessEvent, AccessEventType } from './access-event.ts'
import type { AccountId, Role } from './actor.ts'

export type AccountStatus = 'active' | 'deactivated' | 'deleted'

export type AccountProps = {
  readonly id: AccountId
  /** `null` once deleted (anonymised). */
  readonly name: string | null
  readonly email: string | null
  readonly role: Role
  readonly status: AccountStatus
  readonly teamIds: readonly string[]
}

export type AccountError = 'ACCOUNT_DELETED' | 'LAST_ADMIN' | 'CONFIRMATION_MISMATCH'

/** How many active admins the workspace has, read under lock in the same transaction. */
export type AdminCount = { readonly activeAdmins: number }

type Team = { readonly id: string; readonly name: string }

/**
 * A person's access to the workspace: role, status and team memberships. Every change records an
 * access event; the last active admin can never lose admin access (FR-013).
 */
export class Account {
  #props: AccountProps
  #events: AccessEvent[] = []
  #endSessions = false

  private constructor(props: AccountProps) {
    this.#props = props
  }

  static fromPersistence(props: AccountProps): Account {
    return new Account(props)
  }

  get id(): AccountId {
    return this.#props.id
  }
  get role(): Role {
    return this.#props.role
  }
  get status(): AccountStatus {
    return this.#props.status
  }
  get teamIds(): readonly string[] {
    return this.#props.teamIds
  }
  /** True when the change requires ending every session of the account immediately. */
  get sessionsMustEnd(): boolean {
    return this.#endSessions
  }

  grantTeam(team: Team, actorId: string, now: Date): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (this.#props.teamIds.includes(team.id)) return ok(undefined)
    this.#props = { ...this.#props, teamIds: [...this.#props.teamIds, team.id] }
    this.#record('membership_granted', actorId, now, { teamId: team.id, teamName: team.name })
    return ok(undefined)
  }

  removeTeam(team: Team, actorId: string | null, now: Date): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (!this.#props.teamIds.includes(team.id)) return ok(undefined)
    this.#props = { ...this.#props, teamIds: this.#props.teamIds.filter((id) => id !== team.id) }
    this.#record('membership_removed', actorId, now, { teamId: team.id, teamName: team.name })
    return ok(undefined)
  }

  changeRole(
    role: Role,
    actorId: string,
    now: Date,
    admins: AdminCount,
  ): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (role === this.#props.role) return ok(undefined)
    if (this.#isLastActiveAdmin(admins)) return err('LAST_ADMIN')
    const from = this.#props.role
    this.#props = { ...this.#props, role }
    this.#record('role_changed', actorId, now, { from, to: role })
    return ok(undefined)
  }

  deactivate(actorId: string, now: Date, admins: AdminCount): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (this.#props.status === 'deactivated') return ok(undefined)
    if (this.#isLastActiveAdmin(admins)) return err('LAST_ADMIN')
    this.#props = { ...this.#props, status: 'deactivated' }
    this.#endSessions = true
    this.#record('deactivated', actorId, now, {})
    return ok(undefined)
  }

  reactivate(actorId: string, now: Date): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (this.#props.status === 'active') return ok(undefined)
    this.#props = { ...this.#props, status: 'active' }
    this.#record('reactivated', actorId, now, {})
    return ok(undefined)
  }

  /** Irreversible anonymisation (FR-014b): name and email erased, no role, no team, no session. */
  delete(
    confirmation: string,
    actorId: string,
    now: Date,
    admins: AdminCount,
  ): Result<void, AccountError> {
    if (this.#props.status === 'deleted') return err('ACCOUNT_DELETED')
    if (confirmation.trim().toLowerCase() !== this.#props.email?.toLowerCase())
      return err('CONFIRMATION_MISMATCH')
    if (this.#isLastActiveAdmin(admins)) return err('LAST_ADMIN')
    this.#props = {
      ...this.#props,
      name: null,
      email: null,
      role: 'member',
      status: 'deleted',
      teamIds: [],
    }
    this.#endSessions = true
    this.#record('deleted', actorId, now, {})
    return ok(undefined)
  }

  pullEvents(): AccessEvent[] {
    const events = this.#events
    this.#events = []
    return events
  }

  snapshot(): AccountProps {
    return { ...this.#props, teamIds: [...this.#props.teamIds] }
  }

  #isLastActiveAdmin(admins: AdminCount): boolean {
    return (
      this.#props.role === 'admin' && this.#props.status === 'active' && admins.activeAdmins <= 1
    )
  }

  #record(
    type: AccessEventType,
    actorId: string | null,
    occurredAt: Date,
    details: Record<string, unknown>,
  ): void {
    this.#events.push({ type, actorId, subjectId: this.#props.id, occurredAt, details })
  }
}
