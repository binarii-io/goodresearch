import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

/** Limits of a test protocol (spec 036 FR-002, FR-003); the research domain enforces the same ones. */
export const TEST_PROTOCOL_LIMITS = {
  tasks: 15,
  hypotheses: 15,
  warmUp: 10,
  debrief: 10,
  text: 600,
  long: 4000,
  sessionMinutes: { min: 10, max: 240 },
  taskMinutes: { min: 1, max: 60 },
} as const

const Text = z.string().trim().min(1).max(TEST_PROTOCOL_LIMITS.text)
const LongText = z.string().trim().max(TEST_PROTOCOL_LIMITS.long)

/** Only `http(s)`: a participant opens it; the app never fetches it (FR-022). */
export const WebAddress = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => {
      try {
        const url = new URL(v)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
      } catch {
        return false
      }
    },
    { message: 'A web address starting with http:// or https://' },
  )

export const InterfaceKind = z.enum(['prototype', 'live-application', 'other'])
export type InterfaceKind = z.infer<typeof InterfaceKind>
export const SessionFormat = z.enum(['moderated-remote', 'moderated-in-person'])
export type SessionFormat = z.infer<typeof SessionFormat>
export const ProtocolQuestionnaire = z.enum(['none', 'sus-v1'])
export const EaseQuestion = z.enum(['none', 'seq-v1'])

const Framing = z.object({
  objective: LongText,
  hypotheses: z.array(Text).max(TEST_PROTOCOL_LIMITS.hypotheses),
  participants: LongText,
  format: SessionFormat,
  sessionMinutes: z
    .number()
    .int()
    .min(TEST_PROTOCOL_LIMITS.sessionMinutes.min)
    .max(TEST_PROTOCOL_LIMITS.sessionMinutes.max),
  language: z.enum(['en', 'fr']),
  consent: LongText.min(1),
  interface: z.object({ url: WebAddress, kind: InterfaceKind, description: LongText.nullable() }),
})

const Script = z.object({
  introduction: LongText,
  thinkAloud: LongText,
  warmUp: z.array(Text).max(TEST_PROTOCOL_LIMITS.warmUp),
  debrief: z.array(Text).max(TEST_PROTOCOL_LIMITS.debrief),
  closing: LongText,
})

const Task = z.object({
  instruction: Text,
  criterion: Text,
  startUrl: WebAddress.nullable(),
  minutes: z
    .number()
    .int()
    .min(TEST_PROTOCOL_LIMITS.taskMinutes.min)
    .max(TEST_PROTOCOL_LIMITS.taskMinutes.max)
    .nullable(),
})

const shape = <T extends z.ZodType>(task: T) =>
  z.object({
    framing: Framing,
    script: Script,
    scenario: LongText,
    tasks: z.array(task).min(1).max(TEST_PROTOCOL_LIMITS.tasks),
    questionnaire: ProtocolQuestionnaire,
    easeQuestion: EaseQuestion,
  })

/** Written by the assistant (tool input, model output: never trusted). */
export const TestProtocolDraft = shape(Task)
export type TestProtocolDraft = z.infer<typeof TestProtocolDraft>

/** Sent by the editor: known task ids are kept, new tasks get one. */
export const TestProtocolContentInput = shape(Task.extend({ id: Id.optional() }))
export type TestProtocolContentInput = z.infer<typeof TestProtocolContentInput>

export const TestProtocolContent = shape(Task.extend({ id: Id }))
  .extend({ retiredTaskIds: z.array(Id) })
  .meta({ id: 'TestProtocolContent' })
export type TestProtocolContent = z.infer<typeof TestProtocolContent>

/** What the app's fixed rules flag on a task (FR-007); the web app translates the codes. */
export const TaskFlag = z.enum(['gives-the-way', 'several-tasks', 'no-goal', 'too-long'])
export type TaskFlag = z.infer<typeof TaskFlag>

export const ProtocolFlag = z.enum([
  'too-long-for-session',
  'too-many-tasks',
  'no-think-aloud',
  'consent-without-ai',
])
export type ProtocolFlag = z.infer<typeof ProtocolFlag>

export const ProtocolReadinessKind = z.enum(['pilot', 'interface', 'review'])
export type ProtocolReadinessKind = z.infer<typeof ProtocolReadinessKind>

export const ProtocolReadinessMark = z.object({
  kind: ProtocolReadinessKind,
  by: z.object({ name: z.string() }).nullable(),
  at: Timestamp,
  /** The protocol changed since this check was marked. */
  changedSince: z.boolean(),
})
export type ProtocolReadinessMark = z.infer<typeof ProtocolReadinessMark>

const Scale = z.object({ points: z.number().int(), low: z.string(), high: z.string() })

/** The fixed texts of the protocol's language, when switched on (FR-006, FR-006a). */
export const StandardTexts = z.object({
  sus: z
    .object({
      title: z.string(),
      scale: Scale,
      items: z.array(z.string()),
      /** Given to the participant word for word. */
      instructions: z.string(),
      /** How it is administered: for the facilitator only. */
      facilitatorNote: z.string(),
    })
    .nullable(),
  seq: z.object({ title: z.string(), question: z.string(), scale: Scale }).nullable(),
})
export type StandardTexts = z.infer<typeof StandardTexts>

export const TestProtocol = z
  .object({
    studyId: Id,
    content: TestProtocolContent,
    /** `drive`: changes of the published document a person accepted. */
    origin: z.enum(['assistant', 'person', 'drive']),
    updatedBy: z.object({ name: z.string() }).nullable(),
    updatedAt: Timestamp,
    version: Version,
    checks: z.object({
      tasks: z.record(z.string(), z.array(TaskFlag)),
      whole: z.array(ProtocolFlag),
    }),
    /** Computed by the app, shown as an estimate (FR-008). */
    plannedMinutes: z.number().int(),
    standard: StandardTexts,
    readiness: z.array(ProtocolReadinessMark),
  })
  .meta({ id: 'TestProtocol' })
export type TestProtocol = z.infer<typeof TestProtocol>

/** `version: null` creates the protocol; it fails if one was saved meanwhile. */
export const SaveTestProtocol = z
  .object({ content: TestProtocolContentInput, version: Version.nullable() })
  .meta({ id: 'SaveTestProtocol' })

export const ProtocolReadinessParams = z.object({ studyId: Id, kind: ProtocolReadinessKind })

export const ProtocolDesignCost = z
  .object({ currency: z.literal('USD'), total: z.number().nullable() })
  .meta({ id: 'ProtocolDesignCost' })
