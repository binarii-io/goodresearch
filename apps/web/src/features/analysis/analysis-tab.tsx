import {
  type FactsOverview,
  getGetFactsOverviewQueryKey,
  getListFactsQueryKey,
  useGetFactsOverview,
  useStopFactsReading,
  useStopFactsRun,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  FileTextIcon,
  HourglassIcon,
  LoaderCircleIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { type ReadingItem, ReadingList } from '../workspace/reading-list.tsx'
import { FactsList } from './facts-list.tsx'
import { FindFactsDialog, FindFactsOneButton } from './find-facts.tsx'
import { InterviewFactsView } from './interview-facts.tsx'
import { FACTS_FAILURES, FACTS_READING_STATES, FACTS_STATES } from './labels.ts'

/** A reading is going on: the tab follows its progress. */
const running = (data: FactsOverview | undefined) => !!data?.run && !data.run.finished

/**
 * The Analysis phase (spec 012): each validated interview cut into verbatims, then facts a person
 * decides, per interview or over the whole study, and what the readings cost.
 */
export function AnalysisTab({
  studyId,
  open,
  onOpen,
}: {
  studyId: string
  /** The interview open, from the page's address: its parents are in the page bar. */
  open: { sessionId: string; segmentId: string | null } | null
  onOpen: (sessionId: string, segmentId?: string) => void
}) {
  const { t, i18n } = useLingui()
  const overview = useGetFactsOverview(studyId, {
    query: {
      refetchOnMount: 'always',
      refetchInterval: (query) => (running(query.state.data) ? 2000 : false),
    },
  })
  const queryClient = useQueryClient()
  // A reading that ends brings new facts: the Facts view is read again.
  const finishedRun = overview.data?.run?.finished ? overview.data.run.id : null
  useEffect(() => {
    if (finishedRun) void queryClient.invalidateQueries({ queryKey: getListFactsQueryKey(studyId) })
  }, [finishedRun, queryClient, studyId])
  const [tab, setTab] = useState<string>('interviews')
  const data = overview.data
  if (!data) return <Skeleton className="h-40 w-full" />
  if (data.interviews.length === 0)
    return (
      <div className="grid max-w-prose gap-2">
        <p className="text-base">{t`No validated interview yet.`}</p>
        <p className="text-muted-foreground text-sm">
          {t`Interviews are validated in Fieldwork; their verbatims and facts are found here.`}{' '}
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
  if (open)
    return (
      <InterviewFactsView
        studyId={studyId}
        sessionId={open.sessionId}
        focus={open.segmentId}
        running={running(data)}
      />
    )
  return (
    <div className="grid gap-6">
      <Numbers data={data} />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList aria-label={t`Analysis`}>
            <TabsTrigger value="interviews">{t`Interviews (${data.interviews.length})`}</TabsTrigger>
            <TabsTrigger value="facts">{t`Facts (${data.counts.toDecide} to decide)`}</TabsTrigger>
          </TabsList>
          <FindFacts studyId={studyId} data={data} />
        </div>
        {running(data) ? <ReadingProgress studyId={studyId} data={data} /> : null}
        {data.run?.finished && data.run.failure ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <TriangleAlertIcon aria-hidden className="size-4 text-highlight-soft-foreground" />
            {i18n._(FACTS_FAILURES[data.run.failure])}
          </p>
        ) : null}
        {data.run?.finished && data.run.leftOut.verbatims + data.run.leftOut.facts > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t`The app's checks left out ${data.run.leftOut.verbatims} verbatims (not found in the text, or not an interviewee's) and ${data.run.leftOut.facts} facts (without verbatim, with a name, or already decided).`}
          </p>
        ) : null}
        <TabsContent value="interviews">
          <Interviews studyId={studyId} data={data} onOpen={(sessionId) => onOpen(sessionId)} />
        </TabsContent>
        <TabsContent value="facts">
          <FactsList studyId={studyId} onOpen={onOpen} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Numbers({ data }: { data: FactsOverview }) {
  const { t } = useLingui()
  const money = useMoney()
  const accepted = data.interviews.reduce((n, i) => n + i.facts.accepted, 0)
  const verbatims = data.interviews.reduce((n, i) => n + i.verbatims, 0)
  return (
    <StatTiles aria-label={t`Analysis in numbers`}>
      <StatTile
        icon={<FileTextIcon aria-hidden />}
        label={t`Interviews done`}
        value={data.counts.done}
        detail={t`of ${data.interviews.length} validated`}
      />
      <StatTile
        icon={<HourglassIcon aria-hidden />}
        label={t`Facts to decide`}
        value={data.counts.toDecide}
        detail={t`Proposed by the AI`}
      />
      <StatTile
        icon={<CheckIcon aria-hidden />}
        label={t`Accepted facts`}
        value={accepted}
        detail={t`From ${verbatims} verbatims`}
      />
      <StatTile
        icon={<SparklesIcon aria-hidden />}
        label={t`Cost of the analysis`}
        value={data.cost === null ? t`unknown` : money(data.cost)}
        detail={data.lastRunCost === null ? t`No reading yet` : t`Last: ${money(data.lastRunCost)}`}
      />
    </StatTiles>
  )
}

/** FR-001: each validated interview with where its analysis stands. */
function Interviews({
  studyId,
  data,
  onOpen,
}: {
  studyId: string
  data: FactsOverview
  onOpen: (sessionId: string) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const day = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' })
  const run = running(data) ? data.run : null
  // One dialog for the table, for the interview whose row asked for it.
  const [one, setOne] = useState<{ sessionId: string; title: string } | null>(null)
  const [oneOpen, setOneOpen] = useState(false)
  const openOne = (interview: { sessionId: string; title: string }) => {
    setOne(interview)
    setOneOpen(true)
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t`Interview`}</TableHead>
            <TableHead>{t`State`}</TableHead>
            <TableHead>{t`Verbatims`}</TableHead>
            <TableHead>{t`Accepted facts`}</TableHead>
            <TableHead>{t`Analysed on`}</TableHead>
            <TableHead>{t`Cost`}</TableHead>
            <TableHead>
              <span className="sr-only">{t`Actions`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.interviews.map((i) => {
            // The whole row opens the interview when it has a text (the state button is the keyboard way).
            const openable = i.state !== 'no-transcript' && i.state !== 'not-clean'
            return (
              <TableRow
                key={i.sessionId}
                className={openable ? 'cursor-pointer' : undefined}
                onClick={openable ? () => onOpen(i.sessionId) : undefined}
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
                <TableCell>
                  <span className="grid gap-0.5">
                    {i.reading &&
                    (i.reading.state === 'verbatims' || i.reading.state === 'facts') ? (
                      <span className="flex items-center gap-1.5 text-sm" role="status">
                        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                        {i18n._(FACTS_READING_STATES[i.reading.state])}
                      </span>
                    ) : openable ? (
                      <Button
                        variant={i.state === 'done' ? 'ghost' : 'outline'}
                        size="xs"
                        className="w-fit"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(i.sessionId)
                        }}
                      >
                        {i.state === 'to-decide'
                          ? t`Facts to decide (${i.facts.toDecide})`
                          : i18n._(FACTS_STATES[i.state])}
                      </Button>
                    ) : (
                      <Badge variant="ghost" className="w-fit">
                        {i18n._(FACTS_STATES[i.state])}
                      </Badge>
                    )}
                    {i.reading?.state === 'waiting' ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <HourglassIcon aria-hidden className="size-3" />
                        {t`Waiting for the analysis`}
                      </span>
                    ) : null}
                    {i.lost > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {t`${i.lost} verbatims no longer in the text`}
                      </span>
                    ) : null}
                    {i.failure ? (
                      <span className="text-muted-foreground text-xs">
                        {i18n._(FACTS_FAILURES[i.failure])}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{i.verbatims}</TableCell>
                <TableCell className="text-sm">{i.facts.accepted}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {i.readAt ? day.format(new Date(i.readAt)) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {i.cost === null ? t`unknown` : i.readAt ? money(i.cost) : '—'}
                </TableCell>
                {/* Its button and dialog are not part of the row's click (portals bubble in React). */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {i.state === 'not-clean' ? null : (
                    <FindFactsOneButton
                      studyId={studyId}
                      interview={{ sessionId: i.sessionId, title: i.title }}
                      analysed={i.readAt !== null}
                      disabled={!!run}
                      onOpen={() => openOne({ sessionId: i.sessionId, title: i.title })}
                    />
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {one ? (
        <FindFactsDialog
          studyId={studyId}
          open={oneOpen}
          onOpenChange={setOneOpen}
          interview={one}
        />
      ) : null}
    </>
  )
}

/** Where a reading stands, interview by interview; each can be taken out until its reading ends. */
function ReadingProgress({ studyId, data }: { studyId: string; data: FactsOverview }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const stopOne = useStopFactsReading()
  const run = data.run
  if (!run) return null
  const items: ReadingItem[] = data.interviews.flatMap((i) => {
    const reading = i.reading
    if (!reading) return []
    return [
      {
        sessionId: i.sessionId,
        title: i.title,
        step:
          reading.state === 'verbatims' || reading.state === 'facts' ? 'working' : reading.state,
        label:
          reading.state === 'failed' && i.failure === 'STOPPED'
            ? t`Taken out`
            : reading.state === 'verbatims' && reading.chunks > 0
              ? t`Finding verbatims: part ${reading.chunksDone} of ${reading.chunks}`
              : i18n._(FACTS_READING_STATES[reading.state]),
        stoppable: reading.stoppable,
      },
    ]
  })
  return (
    <ReadingList
      name={t`Analysis in progress`}
      items={items}
      takeOutLabel={(title) => t`Take out of the analysis: ${title}`}
      busy={stopOne.isPending}
      onTakeOut={(sessionId) =>
        void stopOne
          .mutateAsync({ studyId, runId: run.id, sessionId })
          .then(() =>
            queryClient.invalidateQueries({ queryKey: getGetFactsOverviewQueryKey(studyId) }),
          )
          .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
      }
    />
  )
}

/** "Find facts" (US1): the run's progress, or the button that opens the dialog. */
function FindFacts({ studyId, data }: { studyId: string; data: FactsOverview }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const stop = useStopFactsRun()
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
            ? t`Finding facts: part ${run.chunksDone} of ${run.chunks}, ${run.done + run.failed} of ${run.total} interviews`
            : t`Finding facts: ${run.done + run.failed} of ${run.total} interviews`}
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
              .then(() =>
                queryClient.invalidateQueries({ queryKey: getGetFactsOverviewQueryKey(studyId) }),
              )
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
        {t`Find facts`}
      </Button>
      <FindFactsDialog studyId={studyId} open={open} onOpenChange={setOpen} />
    </>
  )
}
