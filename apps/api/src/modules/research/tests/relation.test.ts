import { describe, expect, it } from 'vitest'
import { canDeleteProject, relationTo } from '../domain/relation.ts'

const member = { role: 'member' as const, teamIds: ['a'] }

describe('relation to what a team owns (spec 026)', () => {
  it('gives the team relation to an admin and to members of the owning team', () => {
    expect(relationTo({ role: 'admin', teamIds: [] }, 'a')).toBe('team')
    expect(relationTo(member, 'a')).toBe('team')
  })

  it('gives the reader relation to any other active member, even of no team', () => {
    expect(relationTo(member, 'b')).toBe('reader')
    expect(relationTo({ role: 'member', teamIds: [] }, 'a')).toBe('reader')
  })

  it('gives nothing without an active account', () => {
    expect(relationTo(null, 'a')).toBeNull()
  })

  it('lets an admin delete, and a creator only while in the team (FR-009)', () => {
    const project = { teamId: 'a', createdBy: 'me' }
    expect(canDeleteProject({ role: 'admin', teamIds: [] }, 'other', project)).toBe(true)
    expect(canDeleteProject(member, 'me', project)).toBe(true)
    expect(canDeleteProject(member, 'other', project)).toBe(false)
    expect(canDeleteProject({ role: 'member', teamIds: ['b'] }, 'me', project)).toBe(false)
    expect(canDeleteProject(null, 'me', project)).toBe(false)
  })
})
