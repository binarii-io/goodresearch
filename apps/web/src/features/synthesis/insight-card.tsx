import type { InsightCard as Card, InsightConfidence } from '@goodresearch/api-client'
import { Badge, badgeVariants } from '@goodresearch/ui/components/badge'
import {
  CircleDashedIcon,
  CircleHelpIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from '@goodresearch/ui/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@goodresearch/ui/components/tooltip'
import { useLingui } from '@lingui/react/macro'
import {
  CONFIDENCES,
  INSIGHT_POLARITIES,
  INSIGHT_STATUSES,
  CONFIDENCE_LEVELS as LEVELS,
  POLARITY_FILLS,
} from './labels.ts'

/** A text in the viewer's language, or the other one while it is being translated. */
export const useBilingual = () => {
  const { t, i18n } = useLingui()
  const fr = i18n.locale.startsWith('fr')
  return (
    text: { en: string; fr: string },
    translation: Card['translation'] = 'done',
  ): { text: string; note: string | null } => {
    const mine = fr ? text.fr : text.en
    const other = fr ? text.en : text.fr
    if (mine || !other) return { text: mine, note: null }
    return {
      text: other,
      note: translation === 'translating' ? t`Translating…` : t`Not translated into your language`,
    }
  }
}

/** FR-008: how the confidence is computed, and what "high" still needs. */
export function ConfidenceExplained({ confidence: c }: { confidence: InsightConfidence }) {
  const { t, i18n } = useLingui()
  return (
    <span className="grid gap-1 text-left">
      <span>{t`${c.support} participants support it, ${c.counter} go against it, out of ${c.panel} participants with accepted facts.`}</span>
      {c.panelIfAccepted > c.panel ? (
        <span>{t`${c.panelIfAccepted - c.panel} more participants have facts still to validate.`}</span>
      ) : null}
      <span>{t`High from ${c.highAt} supporting participants (5, or 30% of the panel when more); medium from 3.`}</span>
      {c.lowered ? (
        <span>{t`Counter-evidence from at least half as many participants lowers it one level.`}</span>
      ) : null}
      {c.level !== 'high' && c.missingForHigh > 0 ? (
        <span>{t`For high: ${c.missingForHigh} more supporting participants.`}</span>
      ) : null}
      {c.pendingSupport + c.pendingCounter > 0 ? (
        <span>{t`Facts still to validate add ${c.pendingSupport} participants for and ${c.pendingCounter} against: once accepted, the confidence would be ${i18n._(LEVELS[c.levelIfAccepted])}.`}</span>
      ) : null}
    </span>
  )
}

const CONFIDENCE_ICONS = {
  high: ShieldCheckIcon,
  medium: CircleHelpIcon,
  low: CircleDashedIcon,
} as const

/** The confidence as an icon, a text label and its explanation (FR-019: never colour alone). */
export function ConfidenceBadge({ confidence }: { confidence: InsightConfidence }) {
  const { i18n } = useLingui()
  const Icon = CONFIDENCE_ICONS[confidence.level]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            // Above the card's own button, which covers the whole card.
            className={`relative z-10 ${badgeVariants({
              variant: confidence.level === 'high' ? 'secondary' : 'outline',
            })}`}
          />
        }
      >
        <Icon aria-hidden />
        {i18n._(CONFIDENCES[confidence.level])}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <ConfidenceExplained confidence={confidence} />
      </TooltipContent>
    </Tooltip>
  )
}

export function PolarityBadge({ polarity }: { polarity: Card['polarity'] }) {
  const { i18n } = useLingui()
  return (
    <Badge
      variant="outline"
      className={`border-transparent text-foreground ${POLARITY_FILLS[polarity]}`}
    >
      {i18n._(INSIGHT_POLARITIES[polarity])}
    </Badge>
  )
}

/** One insight in the left pane: selecting it shows its facts in the right pane. */
export function InsightCardView({
  insight,
  selected,
  onSelect,
  onPreview,
}: {
  insight: Card
  selected: boolean
  onSelect: () => void
  /** The pointer or the focus is on it: its details may load before the click. */
  onPreview?: () => void
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const { text, note } = bilingual(insight.statement, insight.translation)
  const c = insight.confidence
  return (
    <article
      aria-label={text}
      className={`relative grid cursor-pointer gap-2 rounded-md border bg-card p-3 hover:border-primary/60 ${selected ? 'border-primary ring-1 ring-primary' : ''} ${insight.status === 'rejected' ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={insight.status === 'proposed' ? 'outline' : 'secondary'}>
          {i18n._(INSIGHT_STATUSES[insight.status])}
        </Badge>
        <ConfidenceBadge confidence={c} />
        <PolarityBadge polarity={insight.polarity} />
        {insight.evidenceChanged > 0 ? (
          <Badge variant="outline">
            <TriangleAlertIcon aria-hidden />
            {t`Evidence changed (${insight.evidenceChanged})`}
          </Badge>
        ) : null}
        {insight.toValidate > 0 ? (
          <Badge variant="outline">{t`Facts to validate (${insight.toValidate})`}</Badge>
        ) : null}
        {insight.suggested > 0 ? (
          <Badge variant="outline">{t`Suggested facts (${insight.suggested})`}</Badge>
        ) : null}
      </div>
      <button
        type="button"
        className="text-left font-medium after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        aria-pressed={selected}
        onClick={onSelect}
        onPointerEnter={onPreview}
        onFocus={onPreview}
      >
        {text}
      </button>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      <span className="text-muted-foreground text-sm">
        {c.pendingSupport + c.pendingCounter > 0
          ? t`For ${c.support} (+${c.pendingSupport} to validate) · against ${c.counter} (+${c.pendingCounter} to validate) participants`
          : t`For ${c.support} · against ${c.counter} participants`}
      </span>
    </article>
  )
}
