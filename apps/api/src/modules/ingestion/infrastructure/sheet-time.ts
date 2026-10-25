/**
 * Spreadsheet dates are "serial numbers" (days since 1899-12-30) in the wall time of the file's
 * time zone; the app keeps instants. Conversions both ways, daylight saving included.
 */
const EPOCH = Date.UTC(1899, 11, 30)
const DAY = 86_400_000

/** The wall time of `instant` in `timeZone`, as if it were UTC. */
const wallMs = (instant: number, timeZone: string): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  return Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )
}

export const instantToSerial = (iso: string, timeZone: string): number =>
  Math.round(((wallMs(Date.parse(iso), timeZone) - EPOCH) / DAY) * 1440) / 1440

export const serialToInstant = (serial: number, timeZone: string): string => {
  const wall = EPOCH + Math.round(serial * 1440) * 60_000
  // The offset depends on the instant: one correction covers daylight saving changes.
  let instant = wall - (wallMs(wall, timeZone) - wall)
  instant = wall - (wallMs(instant, timeZone) - instant)
  return new Date(instant).toISOString()
}
