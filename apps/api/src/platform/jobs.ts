import type { PgBoss } from 'pg-boss'

/** Every queue of the app, created by the `migrate` entrypoint. */
export const QUEUES = {
  /** One inventory per study at a time (policy `exclusive` keyed by study id). */
  inventory: 'ingestion.inventory',
  /** One analysis run per study at a time (spec 009, `exclusive` keyed by study id). */
  analysis: 'ingestion.analysis',
  /** One lexicon reading per study at a time (spec 010, `exclusive` keyed by study id). */
  lexicon: 'transcripts.lexicon',
  /** One cleaning per study at a time (spec 011, `exclusive` keyed by study id). */
  cleaning: 'transcripts.cleaning',
  /** One "Find facts" per study at a time (spec 012, `exclusive` keyed by study id). */
  facts: 'evidence.facts',
  /** A fact's statement translated after a person's edit (spec 012 research R9). */
  translate: 'evidence.translate',
} as const

export type JobQueue = {
  /** Returns false when an equivalent job is already queued or running. */
  send(queue: string, data: object, options?: { singletonKey?: string }): Promise<boolean>
}

export type JobHandler = {
  readonly queue: string
  readonly handle: (data: unknown) => Promise<void>
}

export const createQueues = async (boss: PgBoss): Promise<void> => {
  await boss.createQueue(QUEUES.inventory, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  })
  await boss.createQueue(QUEUES.analysis, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 60 * 60,
  })
  await boss.createQueue(QUEUES.lexicon, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 60 * 60,
  })
  await boss.createQueue(QUEUES.cleaning, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 120 * 60,
  })
  await boss.createQueue(QUEUES.facts, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 120 * 60,
  })
  await boss.createQueue(QUEUES.translate, { retryLimit: 1, expireInSeconds: 5 * 60 })
}

export const createJobQueue = (boss: PgBoss): JobQueue => ({
  send: async (queue, data, options) => (await boss.send(queue, data, options ?? {})) !== null,
})

/** Runs each handler for every job of its queue, one job at a time per worker. */
export const registerHandlers = async (
  boss: PgBoss,
  handlers: readonly JobHandler[],
): Promise<void> => {
  for (const handler of handlers) {
    await boss.work(handler.queue, { batchSize: 1 }, async ([job]) => {
      if (job) await handler.handle(job.data)
    })
  }
}
