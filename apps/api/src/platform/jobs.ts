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
  /** One "Find insights" per project at a time (spec 013, `exclusive` keyed by project id). */
  insights: 'synthesis.insights',
  /** An insight's texts translated after a person's edit (spec 013 research R9). */
  insightTranslate: 'synthesis.translate',
  /** One "Find recommendations" per project at a time (spec 014, `exclusive` keyed by project). */
  recommendations: 'synthesis.recommendations',
  /** One key takeaways draft per project at a time (spec 014). */
  takeaways: 'synthesis.takeaways',
} as const

export type JobQueue = {
  /** Returns false when an equivalent job is already queued or running. */
  send(queue: string, data: object, options?: { singletonKey?: string }): Promise<boolean>
}

export type JobHandler = {
  readonly queue: string
  readonly handle: (data: unknown) => Promise<void>
}

/**
 * A run's job sends a heartbeat while it works: when its worker dies (redeploy, scale-in, crash),
 * pg-boss fails the job within this delay and frees the study or project for a new run, instead
 * of keeping it "running" until expiry. Runs are not retried: they would start over and bill the
 * person's AI provider again; the run shows as interrupted and the person starts it again.
 */
const RUN_HEARTBEAT_SECONDS = 60

const run = (expireInSeconds: number) =>
  ({
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds,
    heartbeatSeconds: RUN_HEARTBEAT_SECONDS,
  }) as const

/** A short job safe to run again (a translation overwrites the same texts). */
const retried = { retryLimit: 1, expireInSeconds: 5 * 60 } as const

const QUEUE_OPTIONS: Readonly<Record<string, { readonly policy?: 'exclusive' } & object>> = {
  [QUEUES.inventory]: run(30 * 60),
  [QUEUES.analysis]: run(60 * 60),
  [QUEUES.lexicon]: run(60 * 60),
  [QUEUES.cleaning]: run(120 * 60),
  [QUEUES.facts]: run(120 * 60),
  [QUEUES.translate]: retried,
  [QUEUES.insights]: run(60 * 60),
  [QUEUES.insightTranslate]: retried,
  [QUEUES.recommendations]: run(30 * 60),
  [QUEUES.takeaways]: run(10 * 60),
}

/** Creates missing queues and brings existing ones to the current settings (creation alone keeps old ones). */
export const createQueues = async (boss: PgBoss): Promise<void> => {
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
    await boss.createQueue(name, options)
    const { policy: _policy, ...settings } = options
    await boss.updateQueue(name, settings)
  }
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
