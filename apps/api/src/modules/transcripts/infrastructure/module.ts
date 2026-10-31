import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeAnalysedText } from '../application/analysed-text.ts'
import { makeCleaningCommands } from '../application/commands/cleaning-commands.ts'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import type {
  CleanFilesPort,
  CleaningAi,
  CleaningDeps,
  CleaningNames,
  LexiconAi,
  Sources,
  StudyDirectory,
  TranscriptsDeps,
} from '../application/ports.ts'
import { makeCleaningQueries } from '../application/queries/cleaning-queries.ts'
import { makeEnrichmentQueries } from '../application/queries/enrichment-queries.ts'
import type { CommonWords } from '../domain/candidates.ts'
import { isCleaningLive } from '../domain/correction-run.ts'
import { createCleaningStore } from './cleaning.drizzle-store.ts'
import { createCommonWords } from './common-words.ts'
import type { TranscriptsHandlers } from './http.routes.ts'
import { createTranscriptsStore } from './transcripts.drizzle-store.ts'

const LexiconJobPayload = z.object({ runId: z.string().min(1), studyId: z.string().min(1) })
const CleaningJobPayload = LexiconJobPayload.extend({ all: z.boolean().default(false) })

/** Builds the transcripts module: imported transcripts, the team lexicon (spec 010), Cleaning (spec 011). */
export const createTranscriptsModule = (deps: {
  db: Db
  clock: Clock
  studies: StudyDirectory
  /** The validated interviews and their text (ingestion module). */
  sources: Sources
  /** The AI of the readings, through the AI Gateway. */
  ai: LexiconAi
  /** Spec 011: the AI of the cleanings, the interviews' people, the study folder to write in. */
  cleaningAi: CleaningAi
  cleaningNames: CleaningNames
  cleanFiles: CleanFilesPort
  enqueue: (queue: string, data: object, options: { singletonKey: string }) => Promise<boolean>
  /** Spec 012: a "Find facts" of the study is running (Evidence module, bound late). */
  factsLive?: (studyId: string) => Promise<boolean>
  /** Spec 016: a review of the interviews of the study is running (Quality module, bound late). */
  qualityLive?: (studyId: string) => Promise<boolean>
  /** Replaces the word lists (tests). */
  common?: CommonWords
  log?: { warn(object: object, message: string): void }
}) => {
  const cleaningStore = createCleaningStore(deps.db)
  const transcripts: TranscriptsDeps = {
    store: createTranscriptsStore(deps.db),
    // One Enrichment run per study (spec 011 research R6).
    otherRunLive: async (studyId) =>
      isCleaningLive(await cleaningStore.openCleaningRun(studyId), deps.clock.now()) ||
      ((await deps.factsLive?.(studyId)) ?? false),
    reviewLive: async (studyId) => (await deps.qualityLive?.(studyId)) ?? false,
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
  const cleaningDeps: CleaningDeps = {
    ...transcripts,
    cleaning: cleaningStore,
    cleaningAi: deps.cleaningAi,
    cleaningNames: deps.cleaningNames,
    cleanFiles: deps.cleanFiles,
    enqueueCleaning: (job) => deps.enqueue(QUEUES.cleaning, job, { singletonKey: job.studyId }),
  }
  const cleaning = makeCleaningCommands(cleaningDeps, lexicon)
  const cleaningQueries = makeCleaningQueries(cleaningDeps)
  const handlers: TranscriptsHandlers = {
    lexicon,
    queries: makeEnrichmentQueries(transcripts),
    cleaning,
    cleaningQueries,
  }
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
    {
      queue: QUEUES.cleaning,
      handle: async (data) => {
        const job = CleaningJobPayload.safeParse(data)
        if (!job.success)
          return transcripts.log.warn({ issues: job.error.issues }, 'invalid cleaning job ignored')
        return cleaning.runCleaningJob(job.data)
      },
    },
  ]
  const analysed = makeAnalysedText(cleaningDeps, lexicon, async (studyId) =>
    isCleaningLive(await cleaningStore.openCleaningRun(studyId), deps.clock.now()),
  )
  /** Spec 012: the text Analysis reads, the missing imports, the Enrichment runs. */
  return { handlers, jobs, ...analysed }
}
