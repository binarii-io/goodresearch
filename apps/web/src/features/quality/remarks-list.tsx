import {
  type ListQualityRemarksParams,
  type SimpleReformulation,
  useListQualityRemarks,
  useListSimpleReformulations,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { Choice } from '../analysis/choice.tsx'
import { REMARK_KINDS } from './labels.ts'
import { RemarkCard } from './remark-card.tsx'
import { RequalifyDialog } from './requalify-dialog.tsx'
import { usePersonLabel } from './use-person-label.ts'

const ALL = 'all'
type Kind = NonNullable<ListQualityRemarksParams['kind']>
type StanceFilter = NonNullable<ListQualityRemarksParams['stance']>

/** FR-009, FR-010: the remarks of the view, then the simple reformulations to check them. */
export function RemarksList({ studyId, person }: { studyId: string; person?: string | undefined }) {
  const { t, i18n } = useLingui()
  const [showing, setShowing] = useState<'remarks' | 'reformulations'>('remarks')
  const [kind, setKind] = useState(ALL)
  const [stance, setStance] = useState(ALL)
  const scope = person ? { person } : {}
  const remarks = useListQualityRemarks(studyId, {
    ...scope,
    ...(kind === ALL ? {} : { kind: kind as Kind }),
    ...(stance === ALL ? {} : { stance: stance as StanceFilter }),
  })
  const simple = useListSimpleReformulations(studyId, scope, {
    query: { enabled: showing === 'reformulations' },
  })
  return (
    <section aria-label={t`Remarks`} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented aria-label={t`What to read`}>
          <SegmentedItem pressed={showing === 'remarks'} onClick={() => setShowing('remarks')}>
            {t`Remarks`}
          </SegmentedItem>
          <SegmentedItem
            pressed={showing === 'reformulations'}
            onClick={() => setShowing('reformulations')}
          >
            {t`Simple reformulations`}
          </SegmentedItem>
        </Segmented>
        {showing === 'remarks' ? (
          <>
            <Choice
              label={t`Kind`}
              value={kind}
              className="w-56"
              onChange={setKind}
              options={[
                { value: ALL, label: t`All` },
                ...Object.entries(REMARK_KINDS).map(([value, label]) => ({
                  value,
                  label: i18n._(label),
                })),
              ]}
            />
            <Choice
              label={t`Opinion`}
              value={stance}
              className="w-40"
              onChange={setStance}
              options={[
                { value: ALL, label: t`All` },
                { value: 'none', label: t`No opinion` },
                { value: 'agree', label: t`Agree` },
                { value: 'disagree', label: t`Disagree` },
              ]}
            />
            {remarks.data ? (
              <p className="ml-auto text-muted-foreground text-sm" aria-live="polite">
                {t`${remarks.data.total} remarks`}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {showing === 'remarks' ? (
        !remarks.data ? (
          <Skeleton className="h-40 w-full" />
        ) : remarks.data.total === 0 ? (
          <p className="text-muted-foreground text-sm">{t`No remark here.`}</p>
        ) : (
          <div className="grid gap-3">
            {remarks.data.remarks.map((remark) => (
              <RemarkCard key={remark.id} studyId={studyId} remark={remark} showInterview />
            ))}
          </div>
        )
      ) : (
        <ReformulationList
          studyId={studyId}
          reformulations={simple.data?.reformulations}
          showInterview
        />
      )}
    </section>
  )
}

/** The simple reformulations with their context; a person can read one otherwise (FR-008a). */
export function ReformulationList({
  studyId,
  reformulations,
  selected,
  onSelect,
  showInterview,
}: {
  studyId: string
  reformulations: readonly SimpleReformulation[] | undefined
  selected?: string | null
  onSelect?: (reformulation: SimpleReformulation) => void
  showInterview?: boolean
}) {
  const { t } = useLingui()
  const personLabel = usePersonLabel()
  const [requalifying, setRequalifying] = useState<SimpleReformulation | null>(null)
  if (!reformulations) return <Skeleton className="h-24 w-full" />
  if (reformulations.length === 0)
    return <p className="text-muted-foreground text-sm">{t`No simple reformulation here.`}</p>
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">
        {t`They rest only on what the interviewee said: good practice, never counted as leading. If one adds something, say so.`}
      </p>
      {reformulations.map((r) => (
        <article
          key={r.id}
          id={`reformulation-${r.id}`}
          className={`grid gap-1.5 rounded-md border p-3 ${selected === r.id ? 'border-primary ring-1 ring-primary' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="ghost">{personLabel(r.person)}</Badge>
            {showInterview ? (
              <span className="truncate text-muted-foreground text-xs" title={r.interviewTitle}>
                {r.interviewTitle}
              </span>
            ) : null}
          </div>
          {r.before ? (
            <p className="text-muted-foreground text-sm">{r.before.slice(0, 220)}</p>
          ) : null}
          {onSelect ? (
            <button
              type="button"
              aria-pressed={selected === r.id}
              className="cursor-pointer text-left text-sm font-medium hover:underline"
              onClick={() => onSelect(r)}
            >
              « {r.text} »
            </button>
          ) : (
            <p className="text-sm font-medium">« {r.text} »</p>
          )}
          <Button size="xs" variant="outline" className="w-fit" onClick={() => setRequalifying(r)}>
            {t`It adds something`}
          </Button>
        </article>
      ))}
      <RequalifyDialog
        studyId={studyId}
        reformulation={requalifying}
        onClose={() => setRequalifying(null)}
      />
    </div>
  )
}
