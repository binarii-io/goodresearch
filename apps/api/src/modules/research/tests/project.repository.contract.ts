import { describe, expect, it } from 'vitest'
import { ConcurrencyError, type ProjectRepository } from '../domain/project.repository.ts'
import { Project } from '../domain/project.ts'

const now = new Date('2026-10-24T10:00:00Z')

const aProject = (id: string, teamId: string): Project => {
  const result = Project.create({
    id,
    teamId,
    name: 'Study',
    goal: 'Line 1\nLine 2',
    createdBy: null,
    now,
  })
  if (!result.ok) throw new Error('fixture')
  return result.value
}

/** Behaviour every ProjectRepository must have; run against the fake and the Drizzle adapter. */
export const projectRepositoryContract = (
  name: string,
  setup: () => Promise<{ repository: ProjectRepository; teamIds: [string, string] }>,
) => {
  describe(`ProjectRepository contract: ${name}`, () => {
    it('stores and reloads a project with its line breaks', async () => {
      const { repository, teamIds } = await setup()
      await repository.save(aProject('00000000-0000-7000-8000-000000000001', teamIds[0]))
      const loaded = await repository.findById('00000000-0000-7000-8000-000000000001')
      expect(loaded?.snapshot()).toMatchObject({
        name: 'Study',
        goal: 'Line 1\nLine 2',
        teamId: teamIds[0],
        version: 0,
      })
    })

    it('increments the version on update and rejects stale saves', async () => {
      const { repository, teamIds } = await setup()
      await repository.save(aProject('00000000-0000-7000-8000-000000000002', teamIds[0]))
      const first = await repository.findById('00000000-0000-7000-8000-000000000002')
      const second = await repository.findById('00000000-0000-7000-8000-000000000002')
      if (!first || !second) throw new Error('missing')
      first.rename('First', now)
      await repository.save(first)
      expect((await repository.findById('00000000-0000-7000-8000-000000000002'))?.version).toBe(1)
      second.rename('Second', now)
      await expect(repository.save(second)).rejects.toBeInstanceOf(ConcurrencyError)
    })

    it('returns null for an unknown id', async () => {
      const { repository } = await setup()
      expect(await repository.findById('00000000-0000-7000-8000-00000000ffff')).toBeNull()
    })
  })
}
