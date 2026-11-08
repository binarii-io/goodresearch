import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'

/** Spec 039 FR-003a: accepts the facts to decide shown, the same in every study and the project. */
export function AcceptAllShown({
  count,
  pending,
  onAccept,
}: {
  count: number
  pending: boolean
  onAccept: () => void
}) {
  const { t } = useLingui()
  if (count === 0) return null
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={onAccept}>
      <CheckIcon aria-hidden />
      {t`Accept all shown (${count})`}
    </Button>
  )
}
