import { nameKey } from './pseudonyms.ts'
import { personDecided, type RosterEntry, type Session, splitNames } from './session.ts'

/** What an interview and its planned interview share (spec 009 FR-022). */
export type PlannedShared = {
  readonly id: string
  readonly interviewee: string
  readonly interviewers: string
  readonly scheduledAt: string | null
}

export type ScheduleChange = {
  readonly interviewee?: string
  readonly interviewers?: string
  readonly scheduledAt?: string
}

const names = (s: Session, role: RosterEntry['role']) =>
  s.roster.filter((r) => r.role === role).map((r) => r.name)

const sameNames = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((n, i) => nameKey(n) === nameKey(b[i] ?? ''))

/** The planned time kept on another day; midday when the planned interview has no time. */
const onDay = (day: string, scheduledAt: string | null) =>
  scheduledAt ? `${day}${new Date(scheduledAt).toISOString().slice(10)}` : `${day}T12:00:00.000Z`

/**
 * What the schedule must take from the interview: the people and the date it holds that differ;
 * null when nothing does. An interview that says nothing on a field leaves it as planned.
 */
export const scheduleChange = (s: Session, planned: PlannedShared): ScheduleChange | null => {
  const change: { interviewee?: string; interviewers?: string; scheduledAt?: string } = {}
  const interviewees = names(s, 'interviewee')
  if (interviewees.length && !sameNames(interviewees, splitNames(planned.interviewee)))
    change.interviewee = interviewees.join(', ').slice(0, 120)
  const interviewers = names(s, 'interviewer')
  if (interviewers.length && !sameNames(interviewers, splitNames(planned.interviewers)))
    change.interviewers = interviewers.join(', ').slice(0, 200)
  if (s.interviewDate && planned.scheduledAt?.slice(0, 10) !== s.interviewDate)
    change.scheduledAt = onDay(s.interviewDate, planned.scheduledAt)
  return Object.keys(change).length ? change : null
}

/**
 * The interview after a change of its planned interview: the same people and date. Entries keep
 * their id and member link when the name stays. A person's decision freezes it: null then, and
 * null when nothing differs.
 */
export const sessionFromPlanned = (
  s: Session,
  planned: PlannedShared,
  newId: () => string,
  now: Date,
): Session | null => {
  if (personDecided(s)) return null
  const entries = (role: RosterEntry['role'], wanted: readonly string[]): RosterEntry[] => {
    const current = s.roster.filter((r) => r.role === role)
    return wanted.map((name) => {
      const known = current.find((r) => nameKey(r.name) === nameKey(name))
      return known ?? { id: newId(), name, role, memberId: null }
    })
  }
  const interviewees = splitNames(planned.interviewee)
  const interviewers = splitNames(planned.interviewers)
  const peopleChanged =
    !sameNames(names(s, 'interviewee'), interviewees) ||
    !sameNames(names(s, 'interviewer'), interviewers)
  const day = planned.scheduledAt?.slice(0, 10) ?? null
  const dateChanged = day !== null && day !== s.interviewDate
  if (!peopleChanged && !dateChanged) return null
  return {
    ...s,
    roster: peopleChanged
      ? [...entries('interviewee', interviewees), ...entries('interviewer', interviewers)]
      : s.roster,
    interviewDate: dateChanged ? day : s.interviewDate,
    updatedAt: now,
  }
}
