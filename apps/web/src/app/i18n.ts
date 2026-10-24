import { i18n } from '@lingui/core'
import { detect, fromNavigator, fromStorage } from '@lingui/detect-locale'

const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

const STORAGE_KEY = 'goodresearch.language'
/** Set when someone picks a language before signing in; applied to the account once signed in. */
const PENDING_KEY = 'goodresearch.language.pending'

export const normalise = (value: string | null | undefined): Locale =>
  value?.toLowerCase().startsWith('fr') ? 'fr' : 'en'

/** FR-025: browser preference when English or French, otherwise English. */
export const initialLocale = (): Locale =>
  normalise(detect(fromStorage(STORAGE_KEY), fromNavigator(), 'en'))

const store = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable (private mode); the language still applies to this page.
  }
}

/** Switches the interface language without reloading (FR-024). */
export const activate = async (locale: Locale): Promise<void> => {
  const { messages } = await import(`../locales/${locale}/messages.po`)
  i18n.load(locale, messages)
  i18n.activate(locale)
  document.documentElement.lang = locale
  store(STORAGE_KEY, locale)
}

export const rememberPendingLanguage = (locale: Locale) => store(PENDING_KEY, locale)

export const takePendingLanguage = (): Locale | null => {
  try {
    const value = localStorage.getItem(PENDING_KEY)
    localStorage.removeItem(PENDING_KEY)
    return value ? normalise(value) : null
  } catch {
    return null
  }
}

export { i18n }
