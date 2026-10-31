import { useLingui } from '@lingui/react/macro'

/** A person of the tab: their name, their label under anonymisation, or no one identified. */
export const usePersonLabel = () => {
  const { t } = useLingui()
  return (person: string | null | undefined) => {
    if (!person) return t`Interviewer not identified`
    const code = /^I(\d+)$/.exec(person)
    if (!code) return person
    const n = Number(code[1])
    return t`Interviewer ${n}`
  }
}
