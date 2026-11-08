import { z } from 'zod'
import type { Gateway, RequestPart } from '../../../ai-gateway/index.ts'
import type { AnalysisAi, Frame, ScreenLogEntry } from '../../application/ports.ts'
import { OBSERVATION_KINDS } from '../../domain/observation.ts'
import { OUTCOMES } from '../../domain/task-result.ts'
import type { Segment } from '../../domain/transcript.ts'
import { providerError } from '../provider-error.ts'

/** Ledger tasks of the analysis (spec 038), one per stage. */
export const TASKS = {
  layout: 'usability-layout',
  transcript: 'usability-transcript',
  screenLog: 'usability-screen-log',
  taskMap: 'usability-task-map',
  task: 'usability-task',
  judge: 'usability-judge',
  arbiter: 'usability-arbiter',
} as const

/** Marks each stage's text for the dev and test provider, which answers it (fake-usability.ts). */
export const marker = (stage: keyof typeof TASKS) => `<usability:${stage}>`

const TIMEOUT_MS = 10 * 60_000

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const lines = (segments: readonly Segment[]) =>
  segments.map((s) => `[${mmss(s.startMs)}] ${s.speaker}: ${s.text}`).join('\n')

const logLines = (log: readonly ScreenLogEntry[]) =>
  log.map((e) => `[${mmss(e.atMs)}] ${e.screen} — ${e.action}`).join('\n')

const images = (frames: readonly Frame[]): RequestPart[] =>
  frames.flatMap((f) => [
    { type: 'text' as const, text: `Frame at ${mmss(f.atMs)}:` },
    { type: 'image' as const, data: f.jpeg, mimeType: 'image/jpeg' as const },
  ])

const LANGUAGE = { en: 'English', fr: 'French' } as const

const RULES = `Never invent: everything you report must be seen in the video or the frames, or said in the transcript.
Quotes are copied word for word from the transcript. Times are seconds from the start of the whole video.
Never write a person's name in a description: say "the participant" or "the facilitator".`

const Layout = z.object({
  shared: z.boolean().describe('Whether a screen share is visible.'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

const Transcript = z.object({
  language: z.string().nullable(),
  segments: z.array(
    z.object({
      speaker: z.string().describe('"Facilitator", "Participant" or another role; never a name.'),
      start: z.number().describe('Seconds from the start of this audio.'),
      end: z.number(),
      text: z.string(),
    }),
  ),
})

const ScreenLog = z.object({
  entries: z.array(
    z.object({
      at: z.number().describe('Seconds, the time written above the frame.'),
      screen: z.string().describe('The page or screen shown, and what matters on it.'),
      action: z
        .string()
        .describe('What changed since the previous frame (click, typing, message).'),
    }),
  ),
})

const TaskMap = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string(),
      found: z.boolean(),
      start: z.number().nullable(),
      end: z.number().nullable(),
      note: z.string().describe('Why it was not found, or how the task started and ended.'),
    }),
  ),
})

const TaskAnswer = z.object({
  outcome: z.enum(OUTCOMES),
  path: z.string().describe('The way taken, in a few steps.'),
  ease: z
    .number()
    .nullable()
    .describe("The participant's answer to the ease question (1-7), if asked."),
  assisted: z.boolean().describe('Whether the facilitator helped to finish it.'),
  observations: z.array(
    z.object({
      kind: z.enum(OBSERVATION_KINDS),
      at: z.number().describe('Seconds from the start of the whole video.'),
      text: z.string().describe('One neutral sentence, in the study language, without names.'),
      quote: z.string().nullable().describe('Word for word from the transcript, or null.'),
      seen: z.string().nullable().describe('What is seen on screen that shows it, or null.'),
      susItem: z.number().nullable(),
      susValue: z.number().nullable(),
    }),
  ),
})

const Judge = z.object({
  verdict: z.enum(['kept', 'not-confirmed', 'rejected']),
  contrary: z
    .string()
    .nullable()
    .describe('The evidence that contradicts it, with its time; null unless rejected.'),
  reason: z.string(),
})

const Arbiter = z.object({ verdict: z.enum(['kept', 'rejected']), reason: z.string() })

/**
 * The model calls of the pipeline through the AI Gateway (research R2, R3): the strong tier reads
 * sound, maps tasks, reads tasks and arbitrates; the standard tier reads frames and judges.
 */
export const createAnalysisAi = (ai: {
  gateway: () => Pick<Gateway, 'generateObject' | 'providerOf'>
  estimateCost(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    tier?: 'standard' | 'strong',
  ): Promise<number | null>
  studyCosts(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}): AnalysisAi => {
  const call = async <T>(
    accountId: string,
    ref: string,
    stage: keyof typeof TASKS,
    tier: 'standard' | 'strong',
    system: string,
    parts: RequestPart[],
    schema: z.ZodType<T>,
  ): Promise<T> => {
    try {
      const { object } = await ai.gateway().generateObject(
        accountId,
        TASKS[stage],
        {
          system,
          parts: [{ type: 'text', text: marker(stage) }, ...parts],
          schema,
          maxOutputTokens: 16_000,
        },
        { ref, timeoutMs: TIMEOUT_MS, tier },
      )
      return object
    } catch (error) {
      throw providerError(error)
    }
  }

  return {
    layout: async (accountId, ref, frames) => {
      const box = await call(
        accountId,
        ref,
        'layout',
        'standard',
        `You look at frames of a recorded video call of a usability test. Find the rectangle of the shared screen (the tested interface), in pixels of the frames, leaving out the call's tiles and toolbars. If no screen is shared, say so.`,
        images(frames),
        Layout,
      )
      return box.shared && box.width > 0 && box.height > 0
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null
    },

    transcript: async (accountId, ref, audio, span, language) => {
      const read = await call(
        accountId,
        ref,
        'transcript',
        'strong',
        `You transcribe the sound of a usability test session, word for word, in the language spoken (the study is in ${LANGUAGE[language]}). Split it into speaker turns with their start and end in seconds from the start of this audio. Name speakers by role: "Facilitator" leads the session and gives the tasks, "Participant" tries them; others "Observer". Never write names as speakers. Keep hesitations that matter ("hmm", "where is…").`,
        [
          {
            type: 'text',
            text: `This audio covers ${mmss(span.startMs)} to ${mmss(span.endMs)} of the session.`,
          },
          { type: 'file', uri: audio.uri, mimeType: audio.mimeType },
        ],
        Transcript,
      )
      return {
        language: read.language,
        segments: read.segments
          .filter((s) => s.text.trim() && Number.isFinite(s.start))
          .map((s) => ({
            speaker: s.speaker.slice(0, 40),
            startMs: Math.round(s.start * 1000),
            endMs: Math.round(Math.max(s.end, s.start) * 1000),
            text: s.text.trim(),
          })),
      }
    },

    screenLog: async (accountId, ref, frames) => {
      const read = await call(
        accountId,
        ref,
        'screenLog',
        'standard',
        `You log what a usability test participant's screen shows, frame by frame (each frame has its time above it). For each frame that differs from the one before, say the screen and what changed. Short messages, error banners and tooltips matter even if they show on one frame only.`,
        images(frames),
        ScreenLog,
      )
      return read.entries.map((e) => ({
        atMs: Math.round(e.at * 1000),
        screen: e.screen.slice(0, 300),
        action: e.action.slice(0, 300),
      }))
    },

    taskMap: async (accountId, ref, input) => {
      const read = await call(
        accountId,
        ref,
        'taskMap',
        'strong',
        `You place the tasks of a usability test in its session. A task starts when the facilitator gives it (or the participant starts it) and ends when the participant reaches its goal, gives up, or the next task starts. Tasks can be done out of order; follow the session, not the list. ${RULES}`,
        [
          {
            type: 'text',
            text: `Scenario: ${input.scenario}\nTasks:\n${input.tasks.map((t) => `- ${t.id}: ${t.instruction} (success: ${t.criterion})`).join('\n')}\nSession length: ${mmss(input.durationMs)}\n\nTranscript:\n${lines(input.transcript)}\n\nScreen log:\n${logLines(input.log)}`,
          },
        ],
        TaskMap,
      )
      return read.tasks.map((t) => ({
        taskId: t.taskId,
        found: t.found && t.start !== null && t.end !== null,
        startMs: t.start === null ? null : Math.round(t.start * 1000),
        endMs: t.end === null ? null : Math.round(t.end * 1000),
        note: t.note.slice(0, 500),
      }))
    },

    task: async (accountId, ref, input) => {
      const read = await call(
        accountId,
        ref,
        'task',
        'strong',
        `You analyse one task of a usability test session, watching its part of the video. Give its outcome against its success criterion (success, partial, failure, not-attempted), the path taken, and observations: difficulties, errors, positive moments, telling verbatims, help from the facilitator${input.ease ? ', the answer to the ease question (1 to 7)' : ''}${input.sus ? ', and each System Usability Scale answer said aloud (kind sus-answer, item 1-10, value 1-5)' : ''}. Each observation has its time. Write descriptions in ${LANGUAGE[input.language]}. ${RULES}`,
        [
          {
            type: 'text',
            text: `Task ${input.task.id}: ${input.task.instruction}\nSuccess criterion: ${input.task.criterion}\nThis part of the video: ${mmss(input.span.startMs)} to ${mmss(input.span.endMs)}.\n\nTranscript:\n${lines(input.transcript)}\n\nScreen log:\n${logLines(input.log)}`,
          },
          {
            type: 'file',
            uri: input.video.uri,
            mimeType: input.video.mimeType,
            startMs: input.span.startMs,
            endMs: input.span.endMs,
          },
        ],
        TaskAnswer,
      )
      return {
        outcome: read.outcome,
        path: read.path,
        ease: read.ease === null ? null : Math.round(read.ease),
        assisted: read.assisted,
        observations: read.observations.map((o) => ({
          kind: o.kind,
          momentMs: Math.round(o.at * 1000),
          text: o.text,
          quote: o.quote,
          seen: o.seen,
          susItem: o.susItem === null ? null : Math.round(o.susItem),
          susValue: o.susValue === null ? null : Math.round(o.susValue),
        })),
      }
    },

    judge: (accountId, ref, input) =>
      call(
        accountId,
        ref,
        'judge',
        'standard',
        `You check one observation of a usability test against frames around its time (one per second near it) and the transcript. A fleeting element (message, tooltip, counter) may show on a single frame. Not seeing something is NOT proof it is wrong: reject only when evidence CONTRADICTS the observation, and say it in "contrary". If nothing confirms or contradicts it: not-confirmed.`,
        [
          {
            type: 'text',
            text: `Task: ${input.task.instruction}\nObservation at ${mmss(input.observation.momentMs)} (${input.observation.kind}): ${input.observation.text}\nQuote: ${input.observation.quote ?? '—'}\nSeen: ${input.observation.seen ?? '—'}\n\nTranscript around:\n${lines(input.transcript)}`,
          },
          ...images(input.frames),
        ],
        Judge,
      ),

    arbiter: (accountId, ref, input) =>
      call(
        accountId,
        ref,
        'arbiter',
        'strong',
        `An analyst noted an observation in a usability test; a judge doubted it. You are the arbiter: look at the evidence and decide. Not seeing something is not proof it is wrong; rejecting needs contrary evidence. Give your reason in one or two sentences.`,
        [
          {
            type: 'text',
            text: `Task: ${input.task.instruction}\nObservation at ${mmss(input.observation.momentMs)} (${input.observation.kind}): ${input.observation.text}\nQuote: ${input.observation.quote ?? '—'}\nJudge: ${input.judge.verdict} — ${input.judge.reason}\n\nTranscript around:\n${lines(input.transcript)}`,
          },
          ...images(input.frames),
        ],
        Arbiter,
      ),

    providerOf: (accountId) => ai.gateway().providerOf(accountId),
    estimate: (accountId, inputChars, outputTokens, tier) =>
      ai.estimateCost(accountId, inputChars, outputTokens, tier),
    costs: (refs) => ai.studyCosts(refs),
  }
}
