import {
  type QualityInterviewRow,
  type QualityOverview,
  useGetQualityOverview,
  useStopQualityRun,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import {
  HourglassIcon,
  LoaderCircleIcon,
  SparklesIcon,
  SquareIcon,
} from '@goodresearch/ui/components/icons'
import { Progress } from '@goodresearch/ui/components/progress'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { Tabs, TabsBar, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { type ReadingItem, ReadingList } from '../workspace/reading-list.tsx'
import { Figures } from './figures.tsx'
import { InterviewView } from './interview-view.tsx'
import { EVALUATION_REASONS, EVALUATION_STATES, QUALITY_FAILURES, REVIEW_STATES } from './labels.ts'
import { RemarksList } from './remarks-list.tsx'
import { ReviewDialog, ReviewOneButton } from './review-dialog.tsx'
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
  const { reviewed } = data
  return (
    <div className="grid gap-6">
      <Figures
        figures={shown ?? null}
        after={
          <StatTile
            icon={<SparklesIcon aria-hidden />}
            label={t`Cost of the reviews`}
            value={data.cost !== null ? money(data.cost) : reviewed > 0 ? t`unknown` : DASH}
            detail={
              data.lastRunCost === null ? t`No review yet` : t`Last: ${money(data.lastRunCost)}`
            }
          />
        }
      />
      {reviewed === 0 ? (
        <p className="text-sm">{t`No interview reviewed yet: the figures come after a review.`}</p>
      ) : null}
      <Tabs value={view} onValueChange={(next) => choose(next as typeof view)} className="gap-4">
        <TabsBar action={<Review studyId={studyId} data={data} />}>
          {reviewed > 0 ? (
            <TabsList aria-label={t`View`}>
              <TabsTrigger value="overall">{t`Overall`}</TabsTrigger>
              <TabsTrigger value="person">{t`By person (${data.people.length})`}</TabsTrigger>
              <TabsTrigger value="interview">
                {t`By interview (${data.interviews.length})`}
              </TabsTrigger>
            </TabsList>
          ) : null}
          {row ? <p className="font-medium text-sm">{personLabel(row.name)}</p> : null}
        </TabsBar>
      </Tabs>
      {running(data) ? <ReviewProgress data={data} /> : null}
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

/** Where a review stands, interview by interview. */
function ReviewProgress({ data }: { data: QualityOverview }) {
  const { t, i18n } = useLingui()
  const items: ReadingItem[] = data.interviews.flatMap((i) => {
    const reading = i.reading
    if (!reading) return []
    return [
      {
        sessionId: i.sessionId,
        title: i.title,
        step: reading.state === 'reading' ? 'working' : reading.state,
        label:
          reading.state === 'reading' && reading.chunks > 0
            ? t`Part ${reading.chunksDone} of ${reading.chunks}`
            : i18n._(REVIEW_STATES[reading.state]),
        stoppable: false,
      },
    ]
  })
  return <ReadingList name={t`Review in progress`} items={items} />
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
        {run.done + run.failed === 0 && run.chunksDone === 0 ? (
          <HourglassIcon aria-hidden className="size-4" />
        ) : (
          <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        )}
        <span className="text-sm">
          {run.chunks > 0
            ? t`Reviewing: part ${run.chunksDone} of ${run.chunks}, ${run.done + run.failed} of ${run.total} interviews`
            : t`Reviewing: ${run.done + run.failed} of ${run.total} interviews`}
        </span>
        <Progress
          aria-label={t`Progress`}
          value={run.chunks > 0 ? run.chunksDone : run.done + run.failed}
          max={run.chunks > 0 ? run.chunks : run.total}
        />
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
          <SquareIcon aria-hidden />
          {t`Stop`}
        </Button>
      </div>
    )
  return (
    <>
      <Button className="ml-auto" onClick={() => setOpen(true)}>
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
  const navigate = useNavigate()
  const percent = new Intl.NumberFormat(i18n.locale, { style: 'percent' })
  const day = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' })
  const [reviewing, setReviewing] = useState<{ sessionId: string; title: string } | null>(null)
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
              <span className="sr-only">{t`Actions`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.interviews.map((i) => {
            const reason = EVALUATION_REASONS[i.state]
            const { leading, questions } = i.figures ?? {}
            // The whole row opens the interview when it has a text (the state button is the keyboard way).
            const openable = i.state !== 'no-transcript' && i.state !== 'not-clean'
            const open = () =>
              void navigate({
                to: '.',
                search: (previous: object) => ({
                  ...previous,
                  interview: i.sessionId,
                  turn: undefined,
                }),
              })
            return (
              <TableRow
                key={i.sessionId}
                className={openable ? 'cursor-pointer' : undefined}
                onClick={openable ? open : undefined}
              >
                <TableCell>
                  <span className="grid min-w-0 max-w-80">
                    {/* Long names are cut with an ellipsis; the full name shows on hover. */}
                    <span className="truncate font-medium" title={i.title}>
                      {i.title}
                    </span>
                    {i.interviewDate ? (
                      <span className="text-muted-foreground text-xs">
                        {day.format(new Date(`${i.interviewDate}T12:00:00Z`))}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="w-56 max-w-56 whitespace-normal">
                  <span className="grid gap-0.5">
                    {i.reading?.state === 'reading' ? (
                      <span className="flex items-center gap-1.5 text-sm" role="status">
                        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                        {i.reading.chunks > 0
                          ? t`Part ${i.reading.chunksDone} of ${i.reading.chunks}`
                          : i18n._(EVALUATION_STATES.reviewing)}
                      </span>
                    ) : i.reading?.state === 'waiting' ? (
                      <span
                        className="flex items-center gap-1 text-muted-foreground text-xs"
                        role="status"
                      >
                        <HourglassIcon aria-hidden className="size-3" />
                        {t`Waiting for the review`}
                      </span>
                    ) : openable ? (
                      <Button
                        variant={i.state === 'reviewed' ? 'ghost' : 'outline'}
                        size="xs"
                        className="w-fit"
                        onClick={(e) => {
                          e.stopPropagation()
                          open()
                        }}
                      >
                        {i18n._(EVALUATION_STATES[i.state])}
                      </Button>
                    ) : (
                      <Badge variant="ghost" className="w-fit">
                        {i18n._(EVALUATION_STATES[i.state])}
                      </Badge>
                    )}
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
                <TableCell className="text-muted-foreground text-sm">
                  {i.cost === null ? DASH : money(i.cost)}
                </TableCell>
                {/* Its button and dialog are not part of the row's click (portals bubble in React). */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {i.state === 'speakers-not-identified' ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={t`Say who speaks: ${i.title}`}
                      onClick={open}
                    >
                      {t`Say who speaks`}
                    </Button>
                  ) : openable ? (
                    <ReviewOneButton
                      studyId={studyId}
                      interview={{ sessionId: i.sessionId, title: i.title }}
                      action={i.action ?? (i.figures ? 'review-again' : 'review')}
                      disabled={live}
                      onOpen={() => setReviewing({ sessionId: i.sessionId, title: i.title })}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <ReviewDialog
        studyId={studyId}
        interview={reviewing ?? undefined}
        open={reviewing !== null}
        onOpenChange={(open) => (open ? null : setReviewing(null))}
      />
    </>
  )
}
