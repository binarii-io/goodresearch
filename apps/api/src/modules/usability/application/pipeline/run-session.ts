import { join } from 'node:path'
import { type AnalysisFailure, type Stage, usabilityRef } from '../../domain/analysis.ts'
import { chunksOf, ownedBy } from '../../domain/chunks.ts'
import { dedupe, type Observation, QUOTE_MAX, TEXT_MAX } from '../../domain/observation.ts'
import { outcomeWithHelp, PATH_MAX, type TaskResult, timeOnTask } from '../../domain/task-result.ts'
import {
  joinChunks,
  type Segment,
  segmentOfQuote,
  segmentsBetween,
} from '../../domain/transcript.ts'
import { arbitrated, judged, needsArbiter } from '../../domain/verdict.ts'
import {
  type AnalysisOutput,
  type Crop,
  type FoundObservation,
  type ProtocolOfSession,
  ProviderAccessLost,
  ProviderMediaUnsupported,
  ProviderMissing,
  type ScreenLogEntry,
  type SessionRef,
  type StagedFile,
  type TaskSpan,
  type UsabilityDeps,
} from '../ports.ts'

/** A stage the pipeline could not pass; the session's analysis fails with it. */
export class AnalysisStopped extends Error {
  readonly failure: AnalysisFailure
  constructor(failure: AnalysisFailure) {
    super(failure)
    this.failure = failure
  }
}

/** The trial's settings (research R3, R5). */
export const KEYFRAME_EVERY_MS = 3000
export const LOG_BATCH = 40
export const TASK_MARGIN_MS = 15_000
export const DENSE_MS = 6000
export const CONTEXT_MS = 20_000
export const AT_ONCE = 3
const PEOPLE_TEXT_MAX = 8000

/** Runs `work` over `items`, `limit` at a time, keeping their order. */
export const mapLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const out: R[] = new Array(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i] as T, i)
    }
  })
  await Promise.all(lanes)
  return out
}

const between = (log: readonly ScreenLogEntry[], from: number, to: number) =>
  log.filter((e) => e.atMs >= from && e.atMs <= to)

/** Moments around an observation the judge sees: every second near it, every 4 s around. */
export const judgeMoments = (atMs: number, durationMs: number): number[] => {
  const dense = Array.from(
    { length: (2 * DENSE_MS) / 1000 + 1 },
    (_, i) => atMs - DENSE_MS + i * 1000,
  )
  const context = Array.from(
    { length: (2 * CONTEXT_MS) / 4000 + 1 },
    (_, i) => atMs - CONTEXT_MS + i * 4000,
  ).filter((t) => Math.abs(t - atMs) > DENSE_MS)
  return [...new Set([...context, ...dense])]
    .filter((t) => t >= 0 && t <= durationMs)
    .sort((a, b) => a - b)
}

/** Keeps what the app can stand behind (FR-006): a quote found, a moment within its task. */
export const checkFound = (
  found: readonly FoundObservation[],
  span: { startMs: number; endMs: number },
  transcript: readonly Segment[],
): FoundObservation[] =>
  dedupe(
    found
      .map((o) => ({
        ...o,
        // The model's values are kept inside what the tables hold (never trusted as they come).
        momentMs: Math.max(0, Math.round(o.momentMs)),
        text: o.text.trim().slice(0, TEXT_MAX),
        quote: o.quote ? o.quote.trim().slice(0, QUOTE_MAX) : null,
        susItem: o.kind === 'sus-answer' ? o.susItem : null,
        susValue: o.kind === 'sus-answer' ? o.susValue : null,
        taskId: null as string | null,
      }))
      .filter(
        (o) =>
          o.text.length > 0 &&
          o.momentMs >= span.startMs - TASK_MARGIN_MS &&
          o.momentMs <= span.endMs + TASK_MARGIN_MS &&
          (o.quote === null || segmentOfQuote(transcript, o.quote) !== null) &&
          (o.kind !== 'sus-answer' ||
            (o.susItem !== null &&
              o.susItem >= 1 &&
              o.susItem <= 10 &&
              o.susValue !== null &&
              o.susValue >= 1 &&
              o.susValue <= 5)),
      ),
  )

/** The text read for people (spec 037's promise): the beginning, as "Speaker: words" turns. */
export const peopleText = (segments: readonly Segment[]) => {
  let text = ''
  for (const s of segments) {
    const line = `${s.speaker}: ${s.text}\n`
    if (text.length + line.length > PEOPLE_TEXT_MAX) break
    text += line
  }
  return text
}

/**
 * The analysis of one session (spec 038 FR-003 to FR-007, research R3): the video copied from
 * Drive for this analysis only, then transcript, screen log, task map, task readings, judge and
 * arbiter, screenshots. The copies are removed whatever happens.
 */
export const runSession = async (
  deps: UsabilityDeps,
  c: {
    accountId: string
    analysisId: string
    session: SessionRef & { video: NonNullable<SessionRef['video']> }
    protocol: ProtocolOfSession
    stage: (stage: Stage) => Promise<void>
    /** Throws `AnalysisStopped('STOPPED')` when a stop was asked. */
    checkpoint: () => Promise<void>
  },
): Promise<AnalysisOutput> => {
  const { accountId, session, protocol } = c
  const ref = usabilityRef(session.sessionId)
  const staged: StagedFile[] = []
  const work = await deps.media.workdir()
  try {
    await c.stage('preparing')
    const local = join(work.path, 'video.mp4')
    const got = await deps.sessions.download(
      accountId,
      session.studyId,
      session.video.fileId,
      local,
    )
    if (got === 'not-found' || got === 'access-lost') throw new AnalysisStopped('VIDEO_UNREADABLE')
    const durationMs = session.video.durationMs ?? (await deps.media.durationMs(local))
    const video = await upload(
      deps,
      accountId,
      staged,
      local,
      `${c.analysisId}/video.mp4`,
      'video/mp4',
    )

    // The shared screen, so frames show the interface and not the call's tiles.
    const probe = await deps.media.frames(
      local,
      [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(f * durationMs)),
      null,
      960,
    )
    const crop: Crop | null = await deps.ai.layout(accountId, ref, probe)
    await c.checkpoint()

    await c.stage('transcript')
    const spans = chunksOf(durationMs)
    const parts = await mapLimit(spans, AT_ONCE, async (span, i) => {
      const file = await deps.media.audio(
        local,
        span.startMs,
        span.endMs,
        join(work.path, `audio-${i}.flac`),
      )
      const audio = await upload(
        deps,
        accountId,
        staged,
        file,
        `${c.analysisId}/audio-${i}.flac`,
        'audio/flac',
      )
      const read = await deps.ai.transcript(accountId, ref, audio, span, protocol.language)
      return {
        language: read.language,
        // The model times the chunk from its own start.
        segments: read.segments.map((s) => ({
          ...s,
          startMs: s.startMs + span.startMs,
          endMs: s.endMs + span.startMs,
        })),
        keep: (ms: number) => ownedBy(ms, i, spans),
      }
    })
    const segments = joinChunks(parts)
    const language = parts.find((p) => p.language)?.language ?? null
    await c.checkpoint()

    await c.stage('screen-log')
    const keyframes = await deps.media.keyframes(local, KEYFRAME_EVERY_MS, crop)
    const batches: (typeof keyframes)[] = []
    for (let i = 0; i < keyframes.length; i += LOG_BATCH)
      batches.push(keyframes.slice(i, i + LOG_BATCH))
    const log = (await mapLimit(batches, AT_ONCE, (b) => deps.ai.screenLog(accountId, ref, b)))
      .flat()
      .sort((a, b) => a.atMs - b.atMs)
    await c.checkpoint()

    await c.stage('task-map')
    const map: TaskSpan[] = await deps.ai.taskMap(accountId, ref, {
      tasks: protocol.tasks,
      scenario: protocol.scenario,
      transcript: segments,
      log,
      durationMs,
    })
    await c.checkpoint()

    await c.stage('tasks')
    const readings = await mapLimit(protocol.tasks, AT_ONCE, async (task) => {
      const placed = map.find(
        (m) => m.taskId === task.id && m.found && m.startMs !== null && m.endMs !== null,
      )
      if (!placed || placed.startMs === null || placed.endMs === null)
        return { task, placed: null, reading: null }
      const span = {
        startMs: Math.max(0, placed.startMs - TASK_MARGIN_MS),
        endMs: Math.min(durationMs, placed.endMs + TASK_MARGIN_MS),
      }
      const transcript = segmentsBetween(segments, span.startMs, span.endMs)
      const reading = await deps.ai.task(accountId, ref, {
        video,
        task,
        span,
        transcript,
        log: between(log, span.startMs, span.endMs),
        language: protocol.language,
        sus: protocol.sus,
        ease: protocol.ease,
      })
      return { task, placed: { startMs: placed.startMs, endMs: placed.endMs }, reading }
    })
    await c.checkpoint()

    await c.stage('checks')
    const tasks: TaskResult[] = []
    const observations: Observation[] = []
    const screenshots: string[] = []
    for (const { task, placed, reading } of readings) {
      tasks.push({
        id: deps.newId(),
        analysisId: c.analysisId,
        taskId: task.id,
        outcome:
          reading && placed ? outcomeWithHelp(reading.outcome, reading.assisted) : 'not-attempted',
        startMs: placed?.startMs ?? null,
        endMs: placed?.endMs ?? null,
        timeOnTaskMs: placed ? timeOnTask(placed.startMs, placed.endMs) : null,
        path: (reading?.path ?? map.find((m) => m.taskId === task.id)?.note ?? '').slice(
          0,
          PATH_MAX,
        ),
        ease:
          reading?.ease !== null &&
          reading?.ease !== undefined &&
          reading.ease >= 1 &&
          reading.ease <= 7
            ? reading.ease
            : null,
        status: 'proposed',
        decidedBy: null,
        decidedAt: null,
        version: 1,
      })
      if (!reading || !placed) continue
      const kept = checkFound(reading.observations, placed, segments)
      const checked = await mapLimit(kept, AT_ONCE, async (o) => {
        const frames = await deps.media.frames(local, judgeMoments(o.momentMs, durationMs), crop)
        const near = segmentsBetween(segments, o.momentMs - CONTEXT_MS, o.momentMs + CONTEXT_MS)
        const judge = judged(
          await deps.ai.judge(accountId, ref, { observation: o, task, frames, transcript: near }),
        )
        const arbiter = needsArbiter(judge.verdict)
          ? arbitrated(
              await deps.ai.arbiter(accountId, ref, {
                observation: o,
                task,
                frames,
                transcript: near,
                judge,
              }),
            )
          : null
        const [shot] = await deps.media.frames(local, [o.momentMs], crop, 640)
        let key: string | null = null
        if (shot) {
          key = `usability/${session.studyId}/${session.sessionId}/${c.analysisId}/${deps.newId()}.jpg`
          await deps.store.registerScreenshot(key, session.studyId, deps.clock.now())
          await deps.screens.put(key, shot.jpeg)
          screenshots.push(key)
        }
        return { o, judge, arbiter, key }
      })
      for (const { o, judge, arbiter, key } of checked)
        observations.push({
          id: deps.newId(),
          analysisId: c.analysisId,
          taskId: task.id,
          kind: o.kind,
          momentMs: o.momentMs,
          text: o.text,
          quote: o.quote,
          seen: o.seen,
          susItem: o.susItem,
          susValue: o.susValue,
          screenshotKey: key,
          judge: judge.verdict,
          judgeReason: judge.reason,
          arbiter: arbiter?.verdict ?? null,
          arbiterReason: arbiter?.reason ?? null,
          origin: 'ai',
          status: 'proposed',
          decidedBy: null,
          decidedAt: null,
          version: 1,
        })
    }

    // Spec 037's promise: the people of a session without them, from this transcript.
    if (!session.hasPeople && segments.length)
      await deps.sessions
        .proposePeopleFromText(accountId, session.sessionId, peopleText(segments))
        .catch((error: unknown) =>
          deps.log.warn({ err: error, sessionId: session.sessionId }, 'people not proposed'),
        )

    return { language, segments, tasks, observations, screenshots }
  } finally {
    await deps.staging.remove(accountId, staged).catch((error: unknown) => {
      // Refused again: the bucket's one-day rule removes the copies; nothing more to say.
      if (isProviderRefusal(error)) return
      deps.log.error({ err: error, sessionId: session.sessionId }, 'staging copy not removed')
    })
    await work.release().catch(() => undefined)
  }
}

const isProviderRefusal = (error: unknown) =>
  error instanceof ProviderAccessLost ||
  error instanceof ProviderMissing ||
  error instanceof ProviderMediaUnsupported

const upload = async (
  deps: UsabilityDeps,
  accountId: string,
  staged: StagedFile[],
  path: string,
  name: string,
  mimeType: string,
): Promise<StagedFile> => {
  try {
    const file = await deps.staging.upload(accountId, path, name, mimeType)
    staged.push(file)
    return file
  } catch (error) {
    // The provider's refusals are named by the run (one place for every stage).
    if (error instanceof AnalysisStopped || isProviderRefusal(error)) throw error
    deps.log.error({ err: error }, 'staging upload failed')
    throw new AnalysisStopped('STAGING_FAILED')
  }
}
