import { useLingui } from '@lingui/react/macro'

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
