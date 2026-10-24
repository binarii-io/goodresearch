import { useSetLanguage } from '@goodresearch/api-client'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { useLingui } from '@lingui/react/macro'
import { useId } from 'react'
import { activate, type Locale, normalise, rememberPendingLanguage } from '../../app/i18n.ts'

/** Available on every screen (FR-024). Names are written in their own language. */
const LANGUAGES: Record<Locale, string> = { en: 'English', fr: 'Français' }

export function LanguageSwitch({ signedIn }: { signedIn: boolean }) {
  const { t, i18n } = useLingui()
  const setLanguage = useSetLanguage()
  const id = useId()

  const change = async (value: string | null) => {
    const locale = normalise(value)
    await activate(locale)
    if (signedIn) setLanguage.mutate({ data: { language: locale } })
    else rememberPendingLanguage(locale)
  }

  return (
    <div className="flex items-center gap-2">
      <Label id={id} className="sr-only">
        {t`Language`}
      </Label>
      <Select value={normalise(i18n.locale)} onValueChange={(value) => void change(value)}>
        <SelectTrigger aria-labelledby={id} size="sm">
          <SelectValue>{(value: string) => LANGUAGES[normalise(value)]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <SelectItem key={code} value={code} lang={code}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
