import {
  type QualityInterviewRow,
  type QualityOverview,
  useGetQualityOverview,
  useStopQualityRun,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { LoaderCircleIcon, SparklesIcon } from '@goodresearch/ui/components/icons'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { Figures } from './figures.tsx'
import { InterviewView } from './interview-view.tsx'
import {
  EVALUATION_REASONS,
  EVALUATION_STATES,
  QUALITY_FAILURES,
  REVIEW_ACTIONS,
} from './labels.ts'
import { RemarksList } from './remarks-list.tsx'
import { ReviewDialog } from './review-dialog.tsx'
import { usePersonLabel } from './use-person-label.ts'
import { useRefreshQuality } from './use-refresh.ts'

/** No figure before a review: a dash, never "0 of 0" nor a cost of 0. */
const DASH = '—'

/** A review is going on: the tab follows its progress. */
const running = (data: QualityOverview | undefined) => !!data?.run && !data.run.finished

/** The Quality tab (spec 016): how the interviews were conducted, and what the reviews cost. */
export function QualityTab({
  studyId,
  interview,
  turn,
}: {
  studyId: string
  interview?: string | undefined
  turn?: string | undefined
}) {
  if (interview) return <InterviewView studyId={studyId} sessionId={interview} turn={turn} />
  return <Overview studyId={studyId} />
}

function Overview({ studyId }: { studyId: string }) {
  const { t } = useLingui()
  const money = useMoney()
  const personLabel = usePersonLabel()
  const navigate = useNavigate()
  const { view = 'overall', person } = useSearch({ strict: false }) as {
    view?: 'overall' | 'person' | 'interview'
    person?: string
  }
  const overview = useGetQualityOverview(studyId, {
    query: {
      refetchOnMount: 'always',
      refetchInterval: (query) => (running(query.state.data) ? 2000 : false),
    },
  })
  const data = overview.data
  if (!data) return <Skeleton className="h-40 w-full" />
  if (data.interviews.length === 0)
    return (
      <div className="grid max-w-prose gap-2">
        <p className="text-base">{t`No validated interview yet.`}</p>
        <p className="text-muted-foreground text-sm">
          {t`Interviews are validated in Fieldwork; how they were conducted shows here.`}{' '}
          <Link
            to="."
            search={(previous) => ({ ...previous, phase: 'fieldwork' })}
            className="underline"
          >
            {t`Go to Fieldwork`}
          </Link>
        </p>
      </div>
    )
  const choose = (next: 'overall' | 'person' | 'interview', who?: string) =>
    void navigate({
      to: '.',
      search: (previous: object) => ({ ...previous, view: next, person: who }),
    })
  const row = view === 'person' ? data.people.find((p) => p.key === person) : undefined
  const shown = row ? row.figures : data.overall
  const { reviewed, total } = data
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" aria-live="polite">
          {reviewed === 0
            ? t`No interview reviewed yet: the figures come after a review.`
            : t`${reviewed} of ${total} interviews reviewed.`}
        </p>
        <Review studyId={studyId} data={data} />
      </div>
      {reviewed > 0 ? (
        <Segmented aria-label={t`View`} className="w-fit">
          <SegmentedItem pressed={view === 'overall'} onClick={() => choose('overall')}>
            {t`Overall`}
          </SegmentedItem>
          <SegmentedItem pressed={view === 'person'} onClick={() => choose('person')}>
            {t`By person`}
          </SegmentedItem>
          <SegmentedItem pressed={view === 'interview'} onClick={() => choose('interview')}>
            {t`By interview`}
          </SegmentedItem>
        </Segmented>
      ) : null}
      {row ? <p className="font-medium text-sm">{personLabel(row.name)}</p> : null}
      {shown ? <Figures figures={shown} /> : null}
      <p className="text-muted-foreground text-sm">
        {t`Cost of the reviews: ${data.cost === null ? DASH : money(data.cost)}`}
        {data.lastRunCost !== null && data.lastRunCost !== data.cost
          ? ` · ${t`Last: ${money(data.lastRunCost)}`}`
          : null}
      </p>
      {data.run?.finished && data.run.leftOut > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t`The app's checks left out ${data.run.leftOut} remarks (not in the text, or a reformulation that adds nothing the interviewee had not said).`}
        </p>
      ) : null}
      {reviewed > 0 && view === 'person' ? (
        <People data={data} person={person} onChoose={(key) => choose('person', key)} />
      ) : null}
      {reviewed === 0 || view !== 'person' ? <Interviews studyId={studyId} data={data} /> : null}
      {reviewed > 0 ? (
        <RemarksList studyId={studyId} person={view === 'person' ? person : undefined} />
      ) : null}
    </div>
  )
}

function Review({ studyId, data }: { studyId: string; data: QualityOverview }) {
  const { t, i18n } = useLingui()
  const refresh = useRefreshQuality(studyId)
  const [open, setOpen] = useState(false)
  const stop = useStopQualityRun()
  const run = data.run
  if (run && !run.finished)
    return (
      <div className="ml-auto flex items-center gap-2" role="status">
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        <span className="text-sm">
          {t`Reviewing: part ${run.chunksDone} of ${run.chunks}, ${run.done + run.failed} of ${run.total} interviews`}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={stop.isPending}
          onClick={() =>
            void stop
              .mutateAsync({ studyId, runId: run.id })
              .then(refresh)
              .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
          }
        >
          {t`Stop`}
        </Button>
      </div>
    )
  return (
    <>
      <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        <SparklesIcon aria-hidden />
        {t`Review the interviews`}
      </Button>
      <ReviewDialog studyId={studyId} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** US4: a row per person, in name order; selecting one limits the figures and remarks to them. */
function People({
  data,
  person,
  onChoose,
}: {
  data: QualityOverview
  person?: string | undefined
  onChoose: (key: string | undefined) => void
}) {
  const { t, i18n } = useLingui()
  const personLabel = usePersonLabel()
  const percent = new Intl.NumberFormat(i18n.locale, { style: 'percent' })
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t`Person`}</TableHead>
          <TableHead>{t`Interviews`}</TableHead>
          <TableHead>{t`Interviewer talk share`}</TableHead>
          <TableHead>{t`Leading questions`}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.people.map((p) => {
          const { words, leading, questions } = p.figures
          const total = words.interviewers + words.interviewees + words.unknown
          const on = person === p.key
          return (
            <TableRow key={p.key}>
              <TableCell className="font-medium">
                <button
                  type="button"
                  aria-pressed={on}
                  className={`cursor-pointer text-left underline ${on ? 'font-bold' : ''}`}
                  onClick={() => onChoose(on ? undefined : p.key)}
                >
                  {personLabel(p.name)}
                </button>
              </TableCell>
              <TableCell>{p.interviews}</TableCell>
              <TableCell>{total > 0 ? percent.format(words.interviewers / total) : DASH}</TableCell>
              <TableCell>
                {t`${leading.questions.agreed + leading.questions.noOpinion} of ${questions}`}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** FR-015: each validated interview: open it, see its state, its figures once reviewed, review it. */
function Interviews({ studyId, data }: { studyId: string; data: QualityOverview }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const percent = new Intl.NumberFormat(i18n.locale, { style: 'percent' })
  const [reviewing, setReviewing] = useState<string | null>(null)
  const live = running(data)
  const share = (i: QualityInterviewRow) => {
    if (!i.figures) return DASH
    const { words } = i.figures
    const total = words.interviewers + words.interviewees + words.unknown
    return total > 0 ? percent.format(words.interviewers / total) : DASH
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t`Interview`}</TableHead>
            <TableHead>{t`State`}</TableHead>
            <TableHead>{t`Interviewer talk share`}</TableHead>
            <TableHead>{t`Leading questions`}</TableHead>
            <TableHead>{t`Cost`}</TableHead>
            <TableHead>
              <span className="sr-only">{t`Action`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.interviews.map((i) => {
            const reason = EVALUATION_REASONS[i.state]
            const { leading, questions } = i.figures ?? {}
            return (
              <TableRow key={i.sessionId}>
                <TableCell className="font-medium">
                  <Link
                    to="."
                    search={(previous) => ({
                      ...previous,
                      interview: i.sessionId,
                      turn: undefined,
                    })}
                    className="underline"
                  >
                    {i.title}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <span className="grid gap-0.5">
                    <Badge variant="ghost" className="w-fit">
                      {i18n._(EVALUATION_STATES[i.state])}
                    </Badge>
                    {i.failure ? (
                      <span className="text-muted-foreground text-xs">
                        {i18n._(QUALITY_FAILURES[i.failure])}
                      </span>
                    ) : reason ? (
                      <span className="text-muted-foreground text-xs">{i18n._(reason)}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>{share(i)}</TableCell>
                <TableCell>
                  {leading
                    ? t`${leading.questions.agreed + leading.questions.noOpinion} of ${questions}`
                    : DASH}
                </TableCell>
                <TableCell>{i.cost === null ? DASH : money(i.cost)}</TableCell>
                <TableCell>
                  {i.state === 'speakers-not-identified' ? (
                    <Link
                      to="."
                      search={(previous) => ({
                        ...previous,
                        interview: i.sessionId,
                        turn: undefined,
                      })}
                      className="text-sm underline"
                      aria-label={t`Say who speaks: ${i.title}`}
                    >
                      {t`Say who speaks`}
                    </Link>
                  ) : i.action && !live ? (
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label={`${i18n._(REVIEW_ACTIONS[i.action])}: ${i.title}`}
                      onClick={() => setReviewing(i.sessionId)}
                    >
                      {i18n._(REVIEW_ACTIONS[i.action])}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <ReviewDialog
        studyId={studyId}
        sessionId={reviewing ?? undefined}
        open={reviewing !== null}
        onOpenChange={(open) => (open ? null : setReviewing(null))}
      />
    </>
  )
}
