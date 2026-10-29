import { type InsightToLink, useListInsightsToLink } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { Choice } from '../analysis/choice.tsx'
import { useBilingual } from './insight-card.tsx'
import { CONFIDENCES, INSIGHT_STATUSES } from './labels.ts'

const ALL = 'all'

/** FR-014: the project's insights not rejected, to link to a recommendation. */
export function InsightsPicker({
  projectId,
  actions,
}: {
  projectId: string
  actions: (insight: InsightToLink) => ReactNode
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const searchId = useId()
  const unusedId = useId()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState(ALL)
  const [unused, setUnused] = useState(false)
  // The search waits for a pause in typing: one request, not one per key.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])
  const list = useListInsightsToLink(projectId, {
    ...(query ? { q: query } : {}),
    ...(level !== ALL ? { level: level as InsightToLink['level'] } : {}),
    ...(unused ? { unused: 'true' } : {}),
  })
  return (
    <section aria-label={t`Insights to link`} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor={searchId} className="text-muted-foreground text-xs">
            {t`Search`}
          </Label>
          <Input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Choice
          label={t`Confidence`}
          value={level}
          className="w-44"
          onChange={setLevel}
          options={[
            { value: ALL, label: t`All` },
            ...Object.entries(CONFIDENCES).map(([value, label]) => ({
              value,
              label: i18n._(label),
            })),
          ]}
        />
        <div className="flex items-center gap-2 pb-2">
          <Checkbox id={unusedId} checked={unused} onCheckedChange={(c) => setUnused(c === true)} />
          <Label htmlFor={unusedId} className="font-normal">
            {t`Not used by any recommendation`}
          </Label>
        </div>
      </div>
      {list.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="grid gap-2">
          {(list.data ?? []).map((i) => (
            <li key={i.id} className="grid gap-1.5 rounded-md border p-2.5">
              <p className="text-sm">{bilingual(i.statement).text}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {i.status === 'proposed' ? (
                    <Badge variant="outline">{t`To validate`}</Badge>
                  ) : (
                    <Badge variant="ghost">{i18n._(INSIGHT_STATUSES[i.status])}</Badge>
                  )}
                  <Badge variant="outline">{i18n._(CONFIDENCES[i.level])}</Badge>
                  <Badge variant="ghost">{i.theme.title ?? t`Other`}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {t`In ${i.recommendations} recommendations`}
                  </span>
                </div>
                <div className="flex gap-1">{actions(i)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
