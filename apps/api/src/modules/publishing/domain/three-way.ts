import type { Items } from './model.ts'

export type ChangeKind =
  | 'changed'
  | 'added'
  | 'removed'
  | 'reordered'
  | 'conflict'
  | 'not-understood'
  | 'invalid'

export type Change = {
  readonly key: string
  readonly kind: ChangeKind
  readonly base: unknown
  readonly app: unknown
  readonly drive: unknown
}

export type FileState = 'in-sync' | 'out-of-date' | 'changed-in-drive' | 'conflict'

/** JSON with sorted keys: stored values (Postgres jsonb reorders keys) compare equal. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const isUnread = (v: unknown) => (v as { type?: string } | undefined)?.type === 'unread'

/**
 * Three-way comparison of a published file (spec 007 research R6), item by item: what was
 * published (`base`), what the app has now, what the file has now. Only changed on the app side:
 * the file is out of date; only on the Drive side: a change to review; on both, differently: a
 * conflict. `valid` tells which Drive values may be accepted.
 */
export const threeWay = (
  base: Items,
  app: Items,
  drive: Items,
  valid: (value: unknown) => boolean,
): { changes: Change[]; outOfDate: number; state: FileState } => {
  const keys = [...new Set([...base.keys(), ...app.keys(), ...drive.keys()])]
  const changes: Change[] = []
  let outOfDate = 0
  for (const key of keys) {
    const b = base.get(key)
    const a = app.get(key)
    const d = drive.get(key)
    if (same(a, d)) continue
    if (same(b, d)) {
      outOfDate += 1
      continue
    }
    const kind: ChangeKind = isUnread(d)
      ? 'not-understood'
      : !valid(d)
        ? 'invalid'
        : !same(b, a)
          ? 'conflict'
          : b === undefined
            ? 'added'
            : d === undefined
              ? 'removed'
              : key.startsWith('order:')
                ? 'reordered'
                : 'changed'
    changes.push({ key, kind, base: b, app: a, drive: d })
  }
  const state: FileState = changes.some((c) => c.kind === 'conflict')
    ? 'conflict'
    : changes.length
      ? 'changed-in-drive'
      : outOfDate
        ? 'out-of-date'
        : 'in-sync'
  return { changes, outOfDate, state }
}

/** Kinds a person can accept (the Drive value replaces the app's). */
export const acceptable = (kind: ChangeKind): boolean =>
  kind !== 'not-understood' && kind !== 'invalid'

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

/** Share of words in common, from 0 to 1. */
const overlap = (a: string, b: string) => {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common += 1
  return common / Math.max(x.size, y.size)
}

/**
 * Whether an item added in a file looks like an addition already accepted (the same person to
 * interview; the same section and mostly the same words): until the next update writes its
 * identity in the file, it cannot be told apart from that one, so it is not offered again
 * (PR #7 review: accepting it twice would duplicate it).
 */
export const looksAccepted = (value: unknown, accepted: readonly unknown[]): boolean => {
  const v = value as { type?: string; interviewee?: string; section?: string | null; text?: string }
  return accepted.some((a) => {
    const x = a as typeof v
    if (v.type === 'row' && x.type === 'row')
      return (
        (x.interviewee ?? '').trim().toLowerCase() === (v.interviewee ?? '').trim().toLowerCase()
      )
    if (v.type === 'question' && x.type === 'question')
      return (
        (v.section === null || x.section === v.section) &&
        overlap(x.text ?? '', v.text ?? '') >= 0.6
      )
    return false
  })
}
