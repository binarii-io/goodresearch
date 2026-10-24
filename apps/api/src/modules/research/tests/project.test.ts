import { describe, expect, it } from 'vitest'
import { Project } from '../domain/project.ts'

const t0 = new Date('2026-10-24T10:00:00Z')
const t1 = new Date('2026-10-24T11:00:00Z')

const create = (overrides: Partial<Parameters<typeof Project.create>[0]> = {}) =>
  Project.create({
    id: 'p1',
    teamId: 'team-a',
    name: 'Onboarding study',
    goal: '',
    createdBy: 'a1',
    now: t0,
    ...overrides,
  })

const created = () => {
  const result = create()
  if (!result.ok) throw new Error('fixture')
  return result.value
}

describe('Project', () => {
  it('trims the name and accepts 1 to 120 characters', () => {
    const trimmed = create({ name: '  Study  ' })
    expect(trimmed.ok && trimmed.value.name).toBe('Study')
    expect(create({ name: 'a'.repeat(120) }).ok).toBe(true)
    expect(create({ name: 'a'.repeat(121) })).toEqual({ ok: false, error: 'VALIDATION' })
    expect(create({ name: '  ' })).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('accepts a goal up to 10,000 characters and keeps line breaks', () => {
    const goal = 'Question?\n\n- objective 1\n- objective 2'
    const result = create({ goal })
    expect(result.ok && result.value.goal).toBe(goal)
    expect(create({ goal: 'g'.repeat(10_000) }).ok).toBe(true)
    expect(create({ goal: 'g'.repeat(10_001) })).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('updates updatedAt only when name, goal or team change', () => {
    const project = created()
    expect(project.snapshot().updatedAt).toEqual(t0)
    project.rename('New name', t1)
    expect(project.snapshot().updatedAt).toEqual(t1)

    const other = created()
    other.updateGoal('A goal', t1)
    expect(other.snapshot().updatedAt).toEqual(t1)

    const moved = created()
    moved.moveToTeam('team-b', t1)
    expect(moved.teamId).toBe('team-b')
    expect(moved.snapshot().updatedAt).toEqual(t1)
  })

  it('does not change anything on an invalid edit', () => {
    const project = created()
    expect(project.rename('', t1)).toEqual({ ok: false, error: 'VALIDATION' })
    expect(project.name).toBe('Onboarding study')
    expect(project.snapshot().updatedAt).toEqual(t0)
  })
})
