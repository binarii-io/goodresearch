import { describe, expect, it } from 'vitest'
import { Account, type AccountProps } from '../domain/account.ts'

const now = new Date('2026-10-24T10:00:00Z')
const actor = 'admin-1'

const account = (overrides: Partial<AccountProps> = {}) =>
  Account.fromPersistence({
    id: 'acc-1' as AccountProps['id'],
    name: 'Alex',
    email: 'alex@example.org',
    role: 'member',
    status: 'active',
    teamIds: [],
    ...overrides,
  })

const team = { id: 'team-a', name: 'Research' }

describe('Account', () => {
  it('grants and removes team access idempotently, recording one event per change', () => {
    const a = account()
    expect(a.grantTeam(team, actor, now)).toEqual({ ok: true, value: undefined })
    a.grantTeam(team, actor, now)
    expect(a.teamIds).toEqual(['team-a'])
    a.removeTeam(team, actor, now)
    a.removeTeam(team, actor, now)
    expect(a.teamIds).toEqual([])
    expect(a.pullEvents().map((e) => [e.type, e.details])).toEqual([
      ['membership_granted', { teamId: 'team-a', teamName: 'Research' }],
      ['membership_removed', { teamId: 'team-a', teamName: 'Research' }],
    ])
  })

  it('promotes and demotes, but never the last active admin', () => {
    const member = account()
    member.changeRole('admin', actor, now, { activeAdmins: 1 })
    expect(member.role).toBe('admin')
    const lastAdmin = account({ role: 'admin' })
    expect(lastAdmin.changeRole('member', actor, now, { activeAdmins: 1 })).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
    })
    expect(lastAdmin.changeRole('member', actor, now, { activeAdmins: 2 }).ok).toBe(true)
    expect(member.pullEvents()).toMatchObject([
      { type: 'role_changed', details: { from: 'member', to: 'admin' } },
    ])
  })

  it('deactivates and reactivates, keeping teams, but never the last active admin', () => {
    const a = account({ teamIds: ['team-a'] })
    a.deactivate(actor, now, { activeAdmins: 1 })
    expect(a.status).toBe('deactivated')
    expect(a.sessionsMustEnd).toBe(true)
    a.reactivate(actor, now)
    expect(a.status).toBe('active')
    expect(a.teamIds).toEqual(['team-a'])
    expect(account({ role: 'admin' }).deactivate(actor, now, { activeAdmins: 1 })).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
    })
  })

  it('deletes by anonymisation after a matching confirmation', () => {
    const a = account({ teamIds: ['team-a'], role: 'admin' })
    expect(a.delete('wrong@example.org', actor, now, { activeAdmins: 2 })).toEqual({
      ok: false,
      error: 'CONFIRMATION_MISMATCH',
    })
    expect(a.delete('ALEX@example.org', actor, now, { activeAdmins: 2 }).ok).toBe(true)
    expect(a.snapshot()).toMatchObject({
      name: null,
      email: null,
      role: 'member',
      status: 'deleted',
      teamIds: [],
    })
    expect(a.sessionsMustEnd).toBe(true)
    expect(a.pullEvents().map((e) => e.type)).toEqual(['deleted'])
  })

  it('never deletes the last active admin', () => {
    expect(
      account({ role: 'admin' }).delete('alex@example.org', actor, now, { activeAdmins: 1 }),
    ).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
    })
  })

  it('treats deletion as terminal', () => {
    const deleted = account({ status: 'deleted', name: null, email: null })
    expect(deleted.grantTeam(team, actor, now)).toEqual({ ok: false, error: 'ACCOUNT_DELETED' })
    expect(deleted.changeRole('admin', actor, now, { activeAdmins: 1 })).toEqual({
      ok: false,
      error: 'ACCOUNT_DELETED',
    })
    expect(deleted.deactivate(actor, now, { activeAdmins: 2 })).toEqual({
      ok: false,
      error: 'ACCOUNT_DELETED',
    })
    expect(deleted.reactivate(actor, now)).toEqual({ ok: false, error: 'ACCOUNT_DELETED' })
    expect(deleted.delete('x', actor, now, { activeAdmins: 2 })).toEqual({
      ok: false,
      error: 'ACCOUNT_DELETED',
    })
  })
})
