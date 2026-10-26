import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import type { LexiconAi, Sources, StudyDirectory, TranscriptsDeps } from '../application/ports.ts'
import { makeEnrichmentQueries } from '../application/queries/enrichment-queries.ts'
import type { CommonWords } from '../domain/candidates.ts'
import { createCommonWords } from './common-words.ts'
import type { TranscriptsHandlers } from './http.routes.ts'
import { createTranscriptsStore } from './transcripts.drizzle-store.ts'

const LexiconJobPayload = z.object({ runId: z.string().min(1), studyId: z.string().min(1) })

/** Builds the transcripts module (spec 010): imported transcripts and the team lexicon. */
export const createTranscriptsModule = (deps: {
  db: Db
  clock: Clock
  studies: StudyDirectory
  /** The validated interviews and their text (ingestion module). */
  sources: Sources
  /** The AI of the readings, through the AI Gateway. */
  ai: LexiconAi
  enqueue: (queue: string, data: object, options: { singletonKey: string }) => Promise<boolean>
  /** Replaces the word lists (tests). */
  common?: CommonWords
  log?: { warn(object: object, message: string): void }
}) => {
  const transcripts: TranscriptsDeps = {
    store: createTranscriptsStore(deps.db),
    studies: deps.studies,
    sources: deps.sources,
    ai: deps.ai,
    common: deps.common ?? createCommonWords(),
    // One reading per study at a time (research R8).
    enqueue: (job) => deps.enqueue(QUEUES.lexicon, job, { singletonKey: job.studyId }),
    clock: deps.clock,
    log: deps.log ?? console,
  }
  const lexicon = makeLexiconCommands(transcripts)
  const handlers: TranscriptsHandlers = { lexicon, queries: makeEnrichmentQueries(transcripts) }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.lexicon,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = LexiconJobPayload.safeParse(data)
        if (!job.success)
          return transcripts.log.warn({ issues: job.error.issues }, 'invalid lexicon job ignored')
        return lexicon.runJob(job.data)
      },
    },
  ]
  return { handlers, jobs }
}
