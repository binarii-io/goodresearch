import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeAccountCommands } from '../application/commands/account-commands.ts'
import { InMemoryWorkspace } from './fakes/in-memory-workspace.ts'

const admin = { id: 'admin-1', role: 'admin' as const }
const member = { id: 'member-1', role: 'member' as const }

describe('account commands', () => {
  let workspace: InMemoryWorkspace
  let commands: ReturnType<typeof makeAccountCommands>

  beforeEach(() => {
    workspace = new InMemoryWorkspace()
    workspace.addAccount({ id: 'admin-1', role: 'admin' })
    workspace.addAccount({ id: 'member-1', email: 'member@example.org' })
    workspace.addTeam({ id: 'team-a', name: 'Research' })
    commands = makeAccountCommands({
      uow: workspace.uow,
      clock: fixedClock(new Date('2026-10-24T10:00:00Z')),
    })
  })

  it('lets an admin grant and remove team access, recording access events', async () => {
    expect(
      await commands.grantTeamAccess({ actor: admin, accountId: 'member-1', teamId: 'team-a' }),
    ).toEqual({
      ok: true,
      value: undefined,
    })
    expect(workspace.accounts.get('member-1')?.teamIds).toEqual(['team-a'])
    await commands.removeTeamAccess({ actor: admin, accountId: 'member-1', teamId: 'team-a' })
    expect(workspace.events.map((e) => [e.type, e.actorId, e.subjectId])).toEqual([
      ['membership_granted', 'admin-1', 'member-1'],
      ['membership_removed', 'admin-1', 'member-1'],
    ])
  })

  it('hides every member command from members', async () => {
    expect(
      await commands.grantTeamAccess({ actor: member, accountId: 'member-1', teamId: 'team-a' }),
    ).toEqual({
      ok: false,
      error: 'MEMBER_NOT_FOUND',
    })
    expect(
      await commands.changeRole({ actor: member, accountId: 'member-1', role: 'admin' }),
    ).toEqual({
      ok: false,
      error: 'MEMBER_NOT_FOUND',
    })
  })

  it('reports unknown accounts and teams', async () => {
    expect(
      await commands.grantTeamAccess({ actor: admin, accountId: 'nobody', teamId: 'team-a' }),
    ).toEqual({
      ok: false,
      error: 'MEMBER_NOT_FOUND',
    })
    expect(
      await commands.grantTeamAccess({ actor: admin, accountId: 'member-1', teamId: 'nope' }),
    ).toEqual({
      ok: false,
      error: 'TEAM_NOT_FOUND',
    })
  })

  it('protects the last active admin', async () => {
    expect(
      await commands.changeRole({ actor: admin, accountId: 'admin-1', role: 'member' }),
    ).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
    })
    expect(await commands.deactivateAccount({ actor: admin, accountId: 'admin-1' })).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
    })
    await commands.changeRole({ actor: admin, accountId: 'member-1', role: 'admin' })
    expect(
      (await commands.changeRole({ actor: admin, accountId: 'admin-1', role: 'member' })).ok,
    ).toBe(true)
  })

  it('ends sessions on deactivation and deletion', async () => {
    await commands.deactivateAccount({ actor: admin, accountId: 'member-1' })
    expect(workspace.revokedSessions).toEqual(['member-1'])
    await commands.reactivateAccount({ actor: admin, accountId: 'member-1' })
    await commands.deleteAccount({
      actor: admin,
      accountId: 'member-1',
      confirmation: 'member@example.org',
    })
    expect(workspace.revokedSessions).toEqual(['member-1', 'member-1'])
    expect(workspace.accounts.get('member-1')?.status).toBe('deleted')
  })

  it('requires the current email to confirm a deletion', async () => {
    expect(
      await commands.deleteAccount({ actor: admin, accountId: 'member-1', confirmation: 'nope' }),
    ).toEqual({
      ok: false,
      error: 'CONFIRMATION_MISMATCH',
    })
  })
})
