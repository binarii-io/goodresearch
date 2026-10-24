import type { ConversationCost } from '@goodresearch/api-client'
import { Tooltip, TooltipContent, TooltipTrigger } from '@goodresearch/ui/components/tooltip'
import { useLingui } from '@lingui/react/macro'

/** Small amounts keep their first significant digits ($0.0031), larger ones two decimals. */
const useMoney = () => {
  const { i18n } = useLingui()
  return (value: number) =>
    new Intl.NumberFormat(i18n.locale, {
      style: 'currency',
      currency: 'USD',
      ...(value > 0 && value < 0.01
        ? { maximumSignificantDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }).format(value)
}

/**
 * Cost of the conversation (spec 005 US6): a small circle; hover or focus shows the total and the
 * cost of the last message, from the dated price catalog. Updated after each answer.
 */
export function ConversationCostIndicator({ cost }: { cost: ConversationCost | undefined }) {
  const { t } = useLingui()
  const money = useMoney()
  const total = cost?.total === null ? t`unknown` : money(cost?.total ?? 0)
  const last = cost?.last === null ? t`unknown` : money(cost?.last ?? 0)
  const label = t`Cost of this conversation: ${total}. Last message: ${last}.`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="grid size-6 cursor-help place-items-center rounded-full text-muted-foreground hover:bg-muted"
          />
        }
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="8" cy="8" r="2.5" fill="var(--highlight)" />
        </svg>
      </TooltipTrigger>
      <TooltipContent side="top" className="grid gap-0.5 text-left">
        <span>{t`This conversation: ${total}`}</span>
        <span>{t`Last message: ${last}`}</span>
      </TooltipContent>
    </Tooltip>
  )
}
