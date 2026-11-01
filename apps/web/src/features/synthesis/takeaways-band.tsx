import { useGetTakeawaysFreshness } from '@goodresearch/api-client'
import { OutcomeBand } from '@goodresearch/ui/components/outcome-band'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useProjectOverview } from '../research/project-journey.tsx'
import { useBilingual } from './insight-card.tsx'

/** Spec 017 US3: the outcome first, read-only; the takeaways are edited on Recommendations. */
export function TakeawaysBand({ projectId }: { projectId: string }) {
  const { t } = useLingui()
  const bilingual = useBilingual()
  const takeaways = useProjectOverview(projectId).data?.takeaways
  // The only read of every insight and fact: not asked without takeaways, and never waited for.
  const freshness = useGetTakeawaysFreshness(projectId, {
    query: { enabled: Boolean(takeaways), refetchOnMount: 'always' },
  })
  if (!takeaways) return null
  const { text, note } = bilingual(takeaways.text, takeaways.translation)
  return (
    <OutcomeBand
      id="takeaways-heading"
      title={t`Key takeaways`}
      action={
        <Link to="." search={(previous) => ({ ...previous, tab: 'debrief' as const })}>
          {t`See the debrief`}
        </Link>
      }
      note={[
        note,
        freshness.isError
          ? t`Could not check whether they are up to date`
          : freshness.data?.outOfDate
            ? t`May be out of date`
            : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {text}
    </OutcomeBand>
  )
}
