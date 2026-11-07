/** A saved version of a study's test protocol, as Ingestion sees it (spec 037). */
export type ProtocolVersionRef = { readonly version: number; readonly savedAt: Date }

const DAY_END = 'T23:59:59.999Z'

/**
 * The protocol version a test session was run against (spec 037 research R8): the last one saved
 * on or before the session's date, else the first one; without a date, the last one. Null when the
 * protocol was never saved. A day alone (`YYYY-MM-DD`) counts until its end: callers pass a time
 * when they know one (see `sessionMoment`).
 */
export const versionAt = (
  versions: readonly ProtocolVersionRef[],
  date: string | null,
): number | null => {
  if (versions.length === 0) return null
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  if (!date) return sorted[sorted.length - 1]?.version ?? null
  const at = Date.parse(date.length === 10 ? `${date}${DAY_END}` : date)
  if (Number.isNaN(at)) return sorted[sorted.length - 1]?.version ?? null
  const before = sorted.filter((v) => v.savedAt.getTime() <= at)
  return (before[before.length - 1] ?? sorted[0])?.version ?? null
}

/**
 * When a test session ran, as precisely as known: the video's time when it is on the session's
 * accepted day (or no day was accepted), else the accepted day. A revision saved later that day is
 * then not taken for the session's.
 */
export const sessionMoment = (day: string | null, videoAt: string | null): string | null =>
  videoAt && (!day || videoAt.startsWith(day)) ? videoAt : day
