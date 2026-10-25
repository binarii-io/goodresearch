import { err, ok, type Result } from '@goodresearch/shared'

export const PLANNED_INTERVIEW_STATUSES = [
  'to-contact',
  'invited',
  'scheduled',
  'done',
  'postponed',
  'cancelled',
] as const
export type PlannedInterviewStatus = (typeof PLANNED_INTERVIEW_STATUSES)[number]

/** At most this many planned interviews per study (FR-011). */
export const SCHEDULE_LIMIT = 300

export type PlannedInterviewFields = {
  readonly interviewee: string
  readonly role: string
  readonly interviewers: string
  readonly scheduledAt: Date | null
  readonly status: PlannedInterviewStatus
  readonly notes: string
}

export type PlannedInterviewProps = PlannedInterviewFields & {
  readonly id: string
  readonly studyId: string
  readonly createdBy: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

const text = (value: string, max: number, min = 0): string | null => {
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

const check = (f: PlannedInterviewFields): Result<PlannedInterviewFields, 'VALIDATION'> => {
  const interviewee = text(f.interviewee, 120, 1)
  const role = text(f.role, 120)
  const interviewers = text(f.interviewers, 200)
  const notes = text(f.notes, 2000)
  if (
    interviewee === null ||
    role === null ||
    interviewers === null ||
    notes === null ||
    !PLANNED_INTERVIEW_STATUSES.includes(f.status) ||
    (f.scheduledAt !== null && Number.isNaN(f.scheduledAt.getTime()))
  )
    return err('VALIDATION')
  return ok({
    interviewee,
    role,
    interviewers,
    notes,
    status: f.status,
    scheduledAt: f.scheduledAt,
  })
}

/** One row of a study's interview schedule (spec 006 US5). */
export class PlannedInterview {
  #props: PlannedInterviewProps

  private constructor(props: PlannedInterviewProps) {
    this.#props = props
  }

  static create(
    c: PlannedInterviewFields & { id: string; studyId: string; by: string; now: Date },
  ): Result<PlannedInterview, 'VALIDATION'> {
    const fields = check(c)
    if (!fields.ok) return fields
    return ok(
      new PlannedInterview({
        ...fields.value,
        id: c.id,
        studyId: c.studyId,
        createdBy: c.by,
        createdAt: c.now,
        updatedAt: c.now,
        version: 0,
      }),
    )
  }

  static fromPersistence(props: PlannedInterviewProps): PlannedInterview {
    return new PlannedInterview(props)
  }

  get id(): string {
    return this.#props.id
  }
  get studyId(): string {
    return this.#props.studyId
  }
  get version(): number {
    return this.#props.version
  }

  edit(fields: PlannedInterviewFields, now: Date): Result<void, 'VALIDATION'> {
    const checked = check(fields)
    if (!checked.ok) return checked
    this.#props = { ...this.#props, ...checked.value, updatedAt: now }
    return ok(undefined)
  }

  snapshot(): PlannedInterviewProps {
    return { ...this.#props }
  }
}
