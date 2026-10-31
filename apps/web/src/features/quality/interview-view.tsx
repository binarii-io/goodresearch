import {
  type QualityInterview,
  useAttributeSpeaker,
  useGetQualityInterview,
  useGetQualityOverview,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { LoaderCircleIcon } from '@goodresearch/ui/components/icons'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { Figures } from './figures.tsx'
import { followRun } from './follow-run.ts'
import { EVALUATION_REASONS, EVALUATION_STATES, REMARK_KINDS } from './labels.ts'
import { RemarkCard } from './remark-card.tsx'
import { ReformulationList } from './remarks-list.tsx'
import { ReviewOneButton } from './review-dialog.tsx'
import { useRefreshQuality } from './use-refresh.ts'

type Turn = NonNullable<QualityInterview['turns']>[number]
type Mark = {
  readonly id: string
  readonly offset: number
  readonly length: number
  readonly label: string
  readonly simple: boolean
}

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

/** The interview to read, in the Quality tab: the transcript, its flagged sentences marked. */
export function InterviewView({
  studyId,
  sessionId,
  turn,
}: {
  studyId: string
  sessionId: string
  turn?: string | undefined
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const overview = useGetQualityOverview(studyId, {
    query: {
      refetchInterval: (query) => followRun(query.state.data),
    },
  })
  const live = !!overview.data?.run && !overview.data.run.finished
  const view = useGetQualityInterview(studyId, sessionId, {
    query: { refetchOnMount: 'always', refetchInterval: live ? 2000 : false },
  })
  const { refetch } = view
  // What the run found shows as soon as it ends.
  useEffect(() => {
    if (!live) void refetch()
  }, [live, refetch])
  const [selected, setSelected] = useState<string | null>(null)
  const [showing, setShowing] = useState<'remarks' | 'reformulations'>('remarks')
  const data = view.data
  const shown = Boolean(data)
  useEffect(() => {
    if (shown && turn) scrollTo(`quality-turn-${turn}`)
  }, [shown, turn])
  if (view.isError) return <p className="text-base">{errorMessage(i18n, view.error)}</p>
  if (!data) return <Skeleton className="h-80 w-full" />
  const reason = EVALUATION_REASONS[data.state]
  const pickFromCard = (id: string, segmentId: string, hasPlace: boolean) => {
    setSelected(id)
    scrollTo(hasPlace ? `mark-${id}` : `quality-turn-${segmentId}`)
  }
  const marksOf = (t0: Turn): Mark[] =>
    [
      ...data.remarks
        .filter((r) => r.segmentId === t0.id && r.offset !== null && !r.lost)
        .map((r) => ({
          id: r.id,
          offset: r.offset ?? 0,
          length: r.length ?? 0,
          label: i18n._(REMARK_KINDS[r.kind]),
          simple: false,
        })),
      ...data.reformulations
        .filter((r) => r.segmentId === t0.id && r.offset !== null)
        .map((r) => ({
          id: r.id,
          offset: r.offset ?? 0,
          length: r.length ?? 0,
          label: t`Simple reformulation`,
          simple: true,
        })),
    ].sort((a, b) => a.offset - b.offset)
  const toUnknown = data.speakers.filter((s) => s.role === 'unknown')
  const asks = data.state === 'speakers-not-identified' || toUnknown.length > 0
  const hasReview = data.figures !== null
  return (
    <div className="grid gap-5">
      {reason ? (
        <p className="max-w-prose text-muted-foreground text-sm">{i18n._(reason)}</p>
      ) : null}
      {asks ? <WhoSpeaks studyId={studyId} data={data} /> : null}
      {data.figures ? <Figures figures={data.figures} /> : null}
      {!data.turns ? (
        data.state === 'no-transcript' ? (
          <p className="text-muted-foreground text-base">{t`This interview has no transcript.`}</p>
        ) : null
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-label={t`Transcript`}>
            <ol className="grid max-w-prose gap-3">
              {data.turns.map((item) => (
                <li
                  key={item.id}
                  id={`quality-turn-${item.id}`}
                  className={turn === item.id ? 'rounded-md ring-1 ring-primary' : ''}
                >
                  <p className="font-semibold text-xs">
                    {item.speaker ?? t`Speaker not identified`}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    <MarkedText
                      text={item.text}
                      marks={marksOf(item)}
                      selected={selected}
                      onPick={(mark) => {
                        setSelected(mark.id)
                        setShowing(mark.simple ? 'reformulations' : 'remarks')
                        // The card is there once the list above shows it.
                        requestAnimationFrame(() =>
                          scrollTo(`${mark.simple ? 'reformulation' : 'remark'}-${mark.id}`),
                        )
                      }}
                    />
                  </p>
                </li>
              ))}
            </ol>
          </section>
          {/* A panel of its own, as the facts': it stays in view while the transcript scrolls. */}
          <section
            aria-label={t`Remarks`}
            className="flex flex-col overflow-hidden rounded-lg border bg-card lg:sticky lg:self-start lg:top-20 lg:max-h-[calc(100svh-6rem)]"
          >
            <header className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5">
              <h2 className="font-semibold text-base">{t`Remarks`}</h2>
              <span className="text-muted-foreground text-sm">
                {data.remarks.length}
                {data.cost !== null ? (
                  <>
                    {' '}
                    -{' '}
                    <span title={t`Cost of the reviews`}>
                      <span className="sr-only">{t`Cost:`} </span>
                      {money(data.cost, { narrow: true })}
                    </span>
                  </>
                ) : null}
              </span>
              {data.state === 'to-review-again' ? (
                <Badge variant="highlight">{i18n._(EVALUATION_STATES[data.state])}</Badge>
              ) : null}
              <span className="ml-auto flex items-center gap-2">
                {data.state === 'reviewing' ? (
                  <span className="flex items-center gap-1.5 text-sm" role="status">
                    <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                    {i18n._(EVALUATION_STATES.reviewing)}
                  </span>
                ) : null}
                <ReviewOneButton
                  studyId={studyId}
                  interview={{ sessionId, title: data.title }}
                  action={
                    data.state === 'not-measurable'
                      ? 'review-anyway'
                      : hasReview
                        ? 'review-again'
                        : 'review'
                  }
                  disabled={live}
                  primary
                />
              </span>
            </header>
            {hasReview ? (
              <div className="border-b px-4 py-3">
                <Segmented aria-label={t`What to read`}>
                  <SegmentedItem
                    pressed={showing === 'remarks'}
                    onClick={() => setShowing('remarks')}
                  >
                    {t`Remarks`}
                  </SegmentedItem>
                  <SegmentedItem
                    pressed={showing === 'reformulations'}
                    onClick={() => setShowing('reformulations')}
                  >
                    {t`Simple reformulations`}
                  </SegmentedItem>
                </Segmented>
              </div>
            ) : null}
            <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
              {!hasReview ? (
                <p className="text-muted-foreground text-sm">{t`No review yet: the remarks come after one.`}</p>
              ) : showing === 'remarks' ? (
                data.remarks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t`No remark here.`}</p>
                ) : (
                  data.remarks.map((remark) => (
                    <RemarkCard
                      key={remark.id}
                      studyId={studyId}
                      remark={remark}
                      selected={selected === remark.id}
                      onSelect={() =>
                        pickFromCard(
                          remark.id,
                          remark.segmentId,
                          !remark.lost && remark.offset !== null,
                        )
                      }
                    />
                  ))
                )
              ) : (
                <ReformulationList
                  studyId={studyId}
                  reformulations={data.reformulations}
                  selected={selected}
                  onSelect={(r) => pickFromCard(r.id, r.segmentId, r.offset !== null)}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

/** A turn, its flagged sentences marked in place, with a text label: never colour alone. */
function MarkedText({
  text,
  marks,
  selected,
  onPick,
}: {
  text: string
  marks: readonly Mark[]
  selected: string | null
  onPick: (mark: Mark) => void
}) {
  const parts: ReactNode[] = []
  let at = 0
  for (const mark of marks) {
    if (mark.offset < at) continue
    parts.push(text.slice(at, mark.offset))
    parts.push(
      <button
        key={mark.id}
        id={`mark-${mark.id}`}
        type="button"
        aria-pressed={selected === mark.id}
        className={`cursor-pointer rounded-sm text-left ${mark.simple ? 'underline decoration-dotted' : 'bg-highlight-soft text-highlight-soft-foreground underline'} ${selected === mark.id ? 'ring-1 ring-primary' : ''}`}
        onClick={() => onPick(mark)}
      >
        {text.slice(mark.offset, mark.offset + mark.length)}
        <span className="ml-1 font-semibold text-xs">[{mark.label}]</span>
      </button>,
    )
    at = mark.offset + mark.length
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

/** Who a label is: a person's attribution, kept by Evidence and read by every phase (R5). */
function WhoSpeaks({ studyId, data }: { studyId: string; data: QualityInterview }) {
  const { t, i18n } = useLingui()
  const attribute = useAttributeSpeaker()
  const refresh = useRefreshQuality(studyId)
  return (
    <section aria-label={t`Who speaks`} className="grid gap-2 rounded-md border border-dashed p-3">
      <p className="text-sm">{t`Say who speaks: the shares count once the speakers are known.`}</p>
      {data.speakers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t`No speaker found in this transcript.`}</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {data.speakers.map((s) => (
            <Choice
              key={s.label}
              label={s.label}
              value={s.role === 'interviewer' ? 'interviewer' : s.role === 'unknown' ? '' : 'as-is'}
              className="w-48"
              onChange={(participant) => {
                if (participant === 'as-is' || participant === '') return
                void attribute
                  .mutateAsync({
                    studyId,
                    sessionId: data.sessionId,
                    data: { label: s.label, participant },
                  })
                  .then(refresh)
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }}
              options={[
                ...(s.role === 'unknown' ? [{ value: '', label: t`To attribute` }] : []),
                ...(s.role === 'interviewee' ? [{ value: 'as-is', label: t`An interviewee` }] : []),
                ...data.participants.map((p) => ({ value: p.code, label: p.label })),
                { value: 'interviewer', label: t`An interviewer` },
              ]}
            />
          ))}
        </div>
      )}
    </section>
  )
}
