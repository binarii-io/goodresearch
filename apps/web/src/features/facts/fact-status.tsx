import { Badge } from '@goodresearch/ui/components/badge'
import { useLingui } from '@lingui/react/macro'
import { COMMON_STATUSES, commonStatusOf } from './labels.ts'

/** A fact's status in words (never by colour alone), the same for every study type (spec 039). */
export function FactStatusBadge({ status }: { status: string }) {
  const { i18n } = useLingui()
  const common = commonStatusOf(status)
  return (
    <Badge variant={common === 'to-decide' ? 'outline' : 'secondary'}>
      {i18n._(COMMON_STATUSES[common])}
    </Badge>
  )
}
