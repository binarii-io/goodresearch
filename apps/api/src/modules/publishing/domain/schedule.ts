import { contentKeys } from './keys.ts'
import { LABELS } from './labels.ts'
import type { Items, Language, TableModel, TableRead } from './model.ts'

export const STATUSES = [
  'to-contact',
  'invited',
  'scheduled',
  'done',
  'postponed',
  'cancelled',
] as const
export type Status = (typeof STATUSES)[number]

/** A planned interview as the research module stores it (spec 006). */
export type PlannedRow = {
  readonly id: string
  readonly interviewee: string
  readonly role: string
  readonly interviewers: string
  readonly scheduledAt: string | null
  readonly status: Status
  readonly notes: string
}

const KEYS = ['interviewee', 'role', 'interviewers', 'scheduledAt', 'status', 'notes'] as const

export const scheduleColumns = (language: Language) => {
  const l = LABELS[language]
  return KEYS.map((key) => ({
    key,
    title: l.columns[key],
    type:
      key === 'scheduledAt'
        ? ('datetime' as const)
        : key === 'status'
          ? ('status' as const)
          : ('text' as const),
    ...(key === 'status' ? { options: STATUSES.map((s) => l.statuses[s]) } : {}),
  }))
}

/** The schedule as a table: one row per planned interview, its id in the hidden column. */
export const renderSchedule = (
  rows: readonly PlannedRow[],
  language: Language,
  timeZone: string,
): TableModel => ({
  sheetTitle: LABELS[language].schedule,
  timeZone,
  columns: scheduleColumns(language),
  rows: rows.map((r) => ({
    id: r.id,
    cells: {
      interviewee: r.interviewee,
      role: r.role,
      interviewers: r.interviewers,
      scheduledAt: r.scheduledAt,
      status: LABELS[language].statuses[r.status],
      notes: r.notes,
    },
  })),
})

export type RowValue = {
  readonly type: 'row'
  readonly interviewee: string
  readonly role: string
  readonly interviewers: string
  readonly scheduledAt: string | null
  /** `null`: a status the app does not know (invalid). */
  readonly status: Status | null
  readonly notes: string
  /** What could not be read (a date typed as text…). */
  readonly unreadable?: readonly string[]
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** Minute precision, as spreadsheets keep dates. */
const minute = (iso: string | null): string | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : new Date(Math.round(t / 60_000) * 60_000).toISOString()
}

const statusOf = (label: string | null): Status | null => {
  const text = (label ?? '').trim().toLowerCase()
  for (const language of ['en', 'fr'] as const)
    for (const s of STATUSES) if (LABELS[language].statuses[s].toLowerCase() === text) return s
  return (STATUSES as readonly string[]).includes(text) ? (text as Status) : null
}

export const rowValue = (r: Omit<PlannedRow, 'id'>): RowValue => ({
  type: 'row',
  interviewee: r.interviewee.trim(),
  role: r.role.trim(),
  interviewers: r.interviewers.trim(),
  scheduledAt: minute(r.scheduledAt),
  status: r.status,
  notes: r.notes.trim(),
})

/** Items of the app's schedule, by row id. */
export const appScheduleItems = (rows: readonly PlannedRow[]): Items =>
  new Map(rows.map((r) => [`row:${r.id}`, rowValue(r)]))

/**
 * Items of a table read back (research R5): rows by their hidden id (a repeated id is a new row),
 * rows without id are added ones; missing expected columns make one `unread:structure` item.
 */
export const readScheduleItems = (read: TableRead, language: Language): Items => {
  const items = new Map<string, unknown>()
  const columns = scheduleColumns(language)
  const missingColumns = columns.filter((c) => !read.headers.includes(c.title))
  if (missingColumns.length || !read.idColumn)
    items.set('unread:structure', {
      type: 'unread',
      text: [...missingColumns.map((c) => c.title), ...(read.idColumn ? [] : ['id'])].join(', '),
    })
  // A column renamed or deleted in the sheet is unknown, not empty: rows cannot be accepted until
  // the next update restores it (PR #7 review).
  const lost = missingColumns.map((c) => c.key)
  const newKey = contentKeys('new-row')
  for (const row of read.rows) {
    const c = row.cells
    // Cells cleared but the row kept (its hidden id still there): the row was removed.
    if (Object.values(c).every((v) => v === null || v.trim() === '')) continue
    const text = (key: string) => (c[key] ?? '').trim()
    const when = c.scheduledAt ?? null
    const unreadable: string[] = [...lost]
    // Dates come back as instants; a date typed as text cannot be placed in a time zone.
    if (when && !ISO_INSTANT.test(when)) unreadable.push('scheduledAt')
    const status = statusOf(c.status ?? null)
    const value: RowValue = {
      type: 'row',
      interviewee: text('interviewee'),
      role: text('role'),
      interviewers: text('interviewers'),
      scheduledAt: unreadable.length ? null : minute(when),
      status,
      notes: text('notes'),
      ...(unreadable.length ? { unreadable } : {}),
    }
    const key = row.id && !items.has(`row:${row.id}`) ? `row:${row.id}` : newKey(value)
    items.set(key, value)
  }
  return items
}

/** Limits of spec 006 FR-011. */
export const validRow = (value: unknown): boolean => {
  const v = value as RowValue | undefined
  if (!v) return true
  if ((v as { type: string }).type !== 'row') return false
  return (
    !v.unreadable?.length &&
    v.status !== null &&
    v.interviewee.length >= 1 &&
    v.interviewee.length <= 120 &&
    v.role.length <= 120 &&
    v.interviewers.length <= 200 &&
    v.notes.length <= 2000
  )
}
