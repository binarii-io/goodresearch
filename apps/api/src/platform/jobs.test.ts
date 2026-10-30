import type { PgBoss } from 'pg-boss'
import { describe, expect, it } from 'vitest'
import { createQueues, QUEUES } from './jobs.ts'

/** Records queue settings the way pg-boss keeps them: creating an existing queue changes nothing. */
const fakeBoss = (existing: readonly string[] = []) => {
  const queues = new Map<string, Record<string, unknown>>(existing.map((name) => [name, {}]))
  const boss = {
    createQueue: async (name: string, options: Record<string, unknown>) => {
      if (!queues.has(name)) queues.set(name, { ...options })
    },
    updateQueue: async (name: string, options: Record<string, unknown>) => {
      if ('policy' in options) throw new Error('queue policy cannot be changed after creation')
      queues.set(name, { ...queues.get(name), ...options })
    },
  }
  return { boss: boss as unknown as PgBoss, queues }
}

describe('job queues', () => {
  it('creates every queue', async () => {
    const { boss, queues } = fakeBoss()
    await createQueues(boss)
    expect([...queues.keys()].sort()).toEqual(Object.values(QUEUES).sort())
  })

  it('frees the queue slot of a dead worker within a minute, instead of at expiry', async () => {
    const { boss, queues } = fakeBoss()
    await createQueues(boss)
    for (const [name, options] of queues) {
      if (options.policy !== 'exclusive') continue
      expect(options.heartbeatSeconds, name).toBeLessThanOrEqual(60)
    }
  })

  it('applies the settings to queues created by an earlier version', async () => {
    const { boss, queues } = fakeBoss(Object.values(QUEUES))
    await createQueues(boss)
    expect(queues.get(QUEUES.cleaning)).toMatchObject({ heartbeatSeconds: 60, retryLimit: 0 })
  })
})
