import { useSetLanguage } from '@goodresearch/api-client'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { useLingui } from '@lingui/react/macro'
import { activate, type Locale, normalise, rememberPendingLanguage } from '../../app/i18n.ts'

/** Available on every screen (FR-024). Names are written in their own language. */
const LANGUAGES: Record<Locale, string> = { en: 'English', fr: 'Français' }

export function LanguageSwitch({ signedIn }: { signedIn: boolean }) {
  const { t, i18n } = useLingui()
  const setLanguage = useSetLanguage()

  const change = async (value: string) => {
    const locale = normalise(value)
    await activate(locale)
    if (signedIn) setLanguage.mutate({ data: { language: locale } })
    else rememberPendingLanguage(locale)
  }

  const current = normalise(i18n.locale)
  return (
    <Segmented aria-label={t`Language`}>
      {Object.entries(LANGUAGES).map(([code, name]) => (
        <SegmentedItem
          key={code}
          lang={code}
          title={name}
          pressed={current === code}
          onClick={() => void change(code)}
        >
          {/* The visible code starts the accessible name (WCAG 2.5.3), the full name follows. */}
          {code.toUpperCase()}
          <span className="sr-only"> {name}</span>
        </SegmentedItem>
      ))}
    </Segmented>
  )
}
