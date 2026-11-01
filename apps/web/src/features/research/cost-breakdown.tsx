import { Breakdown } from '@goodresearch/ui/components/breakdown'
import { useLingui } from '@lingui/react/macro'
import { useMoney } from '../assistant/cost.tsx'

/** Spec 017 FR-008: a cost and its uses. Zero amounts are left out; an unknown one is said. */
export function CostBreakdown({
  label,
  total,
  uses,
}: {
  /** Reads the amount: "AI cost: $3.18". */
  label: (amount: string) => string
  total: number | null
  uses: readonly { label: string; cost: number | null }[]
}) {
  const { t } = useLingui()
  const money = useMoney()
  const amount = (value: number | null) =>
    value === null ? t`unknown` : money(value, { narrow: true })
  return (
    <Breakdown
      text={label(amount(total))}
      lines={uses.filter((use) => use.cost !== 0).map((use) => `${use.label} ${amount(use.cost)}`)}
    />
  )
}
