import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'

/** Dates in the interface language. */
export const useFormatDate = () => {
  const { i18n } = useLingui()
  return (iso: string | null | undefined): string =>
    iso
      ? new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        )
      : '—'
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "2 days ago", "yesterday", "now", in the interface language (cards, lists). */
export const useFormatRelative = () => {
  const { i18n } = useLingui()
  const format = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' }),
    [i18n.locale],
  )
  return (iso: string, now: Date = new Date()): string => {
    const seconds = (new Date(iso).getTime() - now.getTime()) / 1000
    // From 90 % of a unit on, count in that unit: 23.6 hours is "yesterday", not "24 hours ago".
    for (const [unit, size] of UNITS)
      if (Math.abs(seconds) >= size * 0.9) return format.format(Math.round(seconds / size), unit)
    return format.format(0, 'second')
  }
}
