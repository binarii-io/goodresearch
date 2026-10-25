import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

/** Limits of an interview guide (spec 006 FR-002); the research domain enforces the same ones. */
export const GUIDE_LIMITS = {
  sections: 12,
  questions: 60,
  followUps: 8,
  hypotheses: 15,
  text: 600,
  framing: 4000,
  title: 120,
  minutes: 180,
} as const

export const SectionKind = z.enum(['introduction', 'warm-up', 'theme', 'wrap-up'])

const Text = z.string().trim().min(1).max(GUIDE_LIMITS.text)
const FramingText = z.string().trim().max(GUIDE_LIMITS.framing)

const Question = z.object({ text: Text, followUps: z.array(Text).max(GUIDE_LIMITS.followUps) })
const Section = z.object({
  kind: SectionKind,
  title: z.string().trim().min(1).max(GUIDE_LIMITS.title),
  minutes: z.number().int().min(1).max(GUIDE_LIMITS.minutes),
})
const Framing = z.object({
  objectives: FramingText,
  hypotheses: z.array(Text).max(GUIDE_LIMITS.hypotheses),
  audience: FramingText,
  format: FramingText,
})

const totalQuestions = (sections: readonly { questions: readonly unknown[] }[]) =>
  sections.reduce((n, s) => n + s.questions.length, 0) <= GUIDE_LIMITS.questions
const sections = <S extends z.ZodType<{ questions: readonly unknown[] }>>(section: S) =>
  z
    .array(section)
    .min(1)
    .max(GUIDE_LIMITS.sections)
    .refine(totalQuestions, { message: `At most ${GUIDE_LIMITS.questions} main questions` })

/** Written by the assistant (tool input, model output: never trusted). */
export const GuideDraft = z.object({
  framing: Framing,
  sections: sections(Section.extend({ questions: z.array(Question) })),
})
export type GuideDraft = z.infer<typeof GuideDraft>

/** Sent by the editor: known ids are kept, new questions and sections get one (research R4). */
export const GuideContentInput = z.object({
  framing: Framing,
  sections: sections(
    Section.extend({
      id: Id.optional(),
      questions: z.array(Question.extend({ id: Id.optional() })),
    }),
  ),
})
export type GuideContentInput = z.infer<typeof GuideContentInput>

export const GuideContent = z
  .object({
    framing: Framing,
    sections: sections(Section.extend({ id: Id, questions: z.array(Question.extend({ id: Id })) })),
  })
  .meta({ id: 'GuideContent' })
export type GuideContent = z.infer<typeof GuideContent>

export const InterviewGuide = z
  .object({
    studyId: Id,
    content: GuideContent,
    origin: z.enum(['assistant', 'person']),
    updatedBy: z.object({ name: z.string() }).nullable(),
    updatedAt: Timestamp,
    version: Version,
  })
  .meta({ id: 'InterviewGuide' })
export type InterviewGuide = z.infer<typeof InterviewGuide>

/** `version: null` creates the guide; it fails if one was saved meanwhile. */
export const SaveInterviewGuide = z
  .object({ content: GuideContentInput, version: Version.nullable() })
  .meta({ id: 'SaveInterviewGuide' })

export const PlannedInterviewStatus = z.enum([
  'to-contact',
  'invited',
  'scheduled',
  'done',
  'postponed',
  'cancelled',
])
export type PlannedInterviewStatus = z.infer<typeof PlannedInterviewStatus>

const PlannedInterviewFields = z.object({
  interviewee: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).default(''),
  interviewers: z.string().trim().max(200).default(''),
  scheduledAt: Timestamp.nullable().default(null),
  status: PlannedInterviewStatus.default('to-contact'),
  notes: z.string().trim().max(2000).default(''),
})

// Not "PlannedInterviewInput": OpenAPI names inputs `<id>Input`, which would collide.
export const PlannedInterviewInput = PlannedInterviewFields.meta({ id: 'NewPlannedInterview' })

export const UpdatePlannedInterview = PlannedInterviewFields.extend({ version: Version }).meta({
  id: 'UpdatePlannedInterview',
})

export const PlannedInterview = z
  .object({
    id: Id,
    interviewee: z.string(),
    role: z.string(),
    interviewers: z.string(),
    scheduledAt: Timestamp.nullable(),
    status: PlannedInterviewStatus,
    notes: z.string(),
    updatedAt: Timestamp,
    version: Version,
  })
  .meta({ id: 'PlannedInterview' })
export type PlannedInterview = z.infer<typeof PlannedInterview>

export const PlannedInterviewParams = z.object({ plannedInterviewId: Id })
