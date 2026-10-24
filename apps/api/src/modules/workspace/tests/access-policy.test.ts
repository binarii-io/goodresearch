import { describe, expect, it } from 'vitest'
import { canAccessTeam } from '../domain/access-policy.ts'

describe('canAccessTeam', () => {
  it('lets admins access any team', () => {
    expect(canAccessTeam({ role: 'admin', teamIds: [] }, 'team-a')).toBe(true)
  })

  it('lets members access only their teams', () => {
    const member = { role: 'member' as const, teamIds: ['team-a', 'team-b'] }
    expect(canAccessTeam(member, 'team-a')).toBe(true)
    expect(canAccessTeam(member, 'team-b')).toBe(true)
    expect(canAccessTeam(member, 'team-c')).toBe(false)
  })

  it('gives a member without team access to nothing', () => {
    expect(canAccessTeam({ role: 'member', teamIds: [] }, 'team-a')).toBe(false)
  })
})
