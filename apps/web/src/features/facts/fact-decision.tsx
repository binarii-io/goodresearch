import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PencilIcon, Undo2Icon, XIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { commonStatusOf } from './labels.ts'

export type FactDecisionKind = 'accept' | 'reject' | 'reopen'

/**
 * Spec 039 FR-002: the decisions of a fact, the same in every study and in the project: accept,
 * reject, edit, and reopen once decided; the choice made stays highlighted.
 */
export function FactDecision({
  status,
  pending,
  onDecide,
  onEdit,
}: {
  status: string
  pending: boolean
  onDecide: (decision: FactDecisionKind) => void
  onEdit?: (() => void) | undefined
}) {
  const { t } = useLingui()
  const common = commonStatusOf(status)
  const accepted = common === 'accepted' || common === 'edited'
  const rejected = common === 'rejected'
  return (
    <fieldset className="flex flex-wrap items-center gap-1">
      <legend className="sr-only">{t`Decision`}</legend>
      <Button
        size="xs"
        variant={accepted ? 'default' : 'outline'}
        aria-pressed={accepted}
        disabled={pending}
        onClick={() => (accepted ? undefined : onDecide('accept'))}
      >
        <CheckIcon aria-hidden />
        {accepted ? t`Accepted` : t`Accept`}
      </Button>
      <Button
        size="xs"
        variant={rejected ? 'default' : 'outline'}
        aria-pressed={rejected}
        disabled={pending}
        onClick={() => (rejected ? undefined : onDecide('reject'))}
      >
        <XIcon aria-hidden />
        {rejected ? t`Rejected` : t`Reject`}
      </Button>
      {onEdit ? (
        <Button size="xs" variant="ghost" disabled={pending} onClick={onEdit}>
          <PencilIcon aria-hidden />
          {t`Edit`}
        </Button>
      ) : null}
      {common !== 'to-decide' ? (
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => onDecide('reopen')}>
          <Undo2Icon aria-hidden />
          {t`Reopen`}
        </Button>
      ) : null}
    </fieldset>
  )
}
