import type { RecommendationCard as Card } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { TriangleAlertIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { useBilingual } from './insight-card.tsx'
import { INSIGHT_STATUSES, RATINGS, REC_KINDS } from './labels.ts'

/** One recommendation in the left pane: selecting it shows it in the right pane. */
export function RecommendationCardView({
  recommendation: r,
  selected,
  onSelect,
  onPreview,
}: {
  recommendation: Card
  selected: boolean
  onSelect: () => void
  /** The pointer or the focus is on it: its details may load before the click. */
  onPreview?: () => void
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const { text, note } = bilingual(r.action, r.translation)
  return (
    <article
      aria-label={text}
      className={`relative grid cursor-pointer gap-2 rounded-md border bg-card p-3 hover:border-primary/60 ${selected ? 'border-primary ring-1 ring-primary' : ''} ${r.status === 'rejected' ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={r.status === 'proposed' ? 'outline' : 'secondary'}>
          {i18n._(INSIGHT_STATUSES[r.status])}
        </Badge>
        <Badge variant="secondary">{i18n._(REC_KINDS[r.kindShown])}</Badge>
        <Badge variant="outline">{t`Priority ${r.priority}`}</Badge>
        {r.insightsChanged > 0 ? (
          <Badge variant="outline">
            <TriangleAlertIcon aria-hidden />
            {t`Insights changed (${r.insightsChanged})`}
          </Badge>
        ) : null}
        {r.insightsToValidate > 0 ? (
          <Badge variant="outline">{t`Insights to validate (${r.insightsToValidate})`}</Badge>
        ) : null}
        {r.suggested > 0 ? (
          <Badge variant="outline">{t`Suggested insights (${r.suggested})`}</Badge>
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
        {t`Impact ${i18n._(RATINGS[r.impact])} · effort ${i18n._(RATINGS[r.effort])} · ${r.insights} insights`}
        {r.owner ? ` · ${r.owner}` : ''}
      </span>
    </article>
  )
}
