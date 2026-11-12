import {
  getGetFactBoardQueryKey,
  getGetFactCountsQueryKey,
  getGetUsabilityAnalysisQueryKey,
  type UsabilityStudyAnalysis,
  useGetFactCounts,
  useGetUsabilityAnalysis,
  useGetUsabilityResults,
  useStartUsabilityRun,
  useStopUsabilityRun,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@goodresearch/ui/components/alert-dialog'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import {
  CheckIcon,
  HourglassIcon,
  LoaderCircleIcon,
  SparklesIcon,
  VideoIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
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
import { Tabs, TabsBar, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { FactBoard } from '../facts/fact-board.tsx'
import { READINESS } from '../fieldwork/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { type ReadingItem, ReadingList } from '../workspace/reading-list.tsx'
import { duration, FAILURES, OUTCOME_BADGES, OUTCOMES, STAGES, STATES } from './labels.ts'
import { SessionReview } from './session-review.tsx'

const running = (data: UsabilityStudyAnalysis | undefined) =>
  !!data?.run ||
  !!data?.sessions.some((s) => s.analysis?.state === 'analysing' || s.analysis?.state === 'waiting')

/**
 * Spec 038: the Analysis tab of a usability test study. The ready sessions, the estimate before a
 * run, each session's state and what is left to review, then the study's results by task.
 */
export function UsabilityAnalysisTab({
  studyId,
  sessionId: open,
  onOpen: setOpen,
}: {
  studyId: string
  /** The session being explored, from the page's address (a fact's link opens it too). */
  sessionId: string | null
  onOpen: (sessionId: string | null) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const analysis = useGetUsabilityAnalysis(studyId, {
    query: { refetchInterval: (q) => (running(q.state.data) ? 3000 : false) },
  })
  const [tab, setTab] = useState('sessions')
  // Only the counts (tiles and tab); the Facts tab reads its own page.
  const facts = useGetFactCounts(studyId)
  const queryClient = useQueryClient()
  // A session done brings facts (spec 039): counts and list are read again, during a run too.
  const done = analysis.data?.sessions.filter((s) => s.analysis?.state === 'done').length
  useEffect(() => {
    if (done === undefined) return
    void queryClient.invalidateQueries({ queryKey: getGetFactCountsQueryKey(studyId) })
    void queryClient.invalidateQueries({ queryKey: getGetFactBoardQueryKey(studyId) })
  }, [done, queryClient, studyId])
  if (analysis.isPending) return <Skeleton className="h-40 w-full" />
  if (!analysis.data) return null
  const data = analysis.data
  if (open) return <SessionReview studyId={studyId} sessionId={open} />
  const analysed = data.sessions.filter((s) => s.analysis?.state === 'done').length
  const readinessOf = (r: string | null) =>
    r && r in READINESS ? i18n._(READINESS[r as keyof typeof READINESS]).toLowerCase() : '—'
  const toReview = data.sessions.reduce((n, s) => n + (s.analysis?.toReview ?? 0), 0)
  return (
    <div className="grid gap-6">
      <StatTiles aria-label={t`Analysis in numbers`}>
        <StatTile
          icon={<VideoIcon aria-hidden />}
          label={t`Sessions analysed`}
          value={analysed}
          detail={t`of ${data.sessions.length}`}
        />
        <StatTile
          icon={<HourglassIcon aria-hidden />}
          label={t`To review`}
          value={toReview}
          detail={t`observations and outcomes`}
        />
        <StatTile
          icon={<CheckIcon aria-hidden />}
          label={t`Facts to decide`}
          value={facts.data ? facts.data.toDecide : '—'}
          detail={facts.data ? t`${facts.data.accepted + facts.data.edited} accepted` : undefined}
        />
        <StatTile
          icon={<SparklesIcon aria-hidden />}
          label={t`Cost of the analyses`}
          value={data.cost === null ? t`unknown` : money(data.cost)}
          detail={t`by anyone, all runs`}
        />
      </StatTiles>
      {!data.provider.video ? (
        <p
          role="status"
          className="text-sm"
        >{t`This study's sessions can be analysed only with Vertex AI as AI provider.`}</p>
      ) : null}
      {/* As the interview Analysis: one bar of tabs, the run as the action of every tab. */}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
        <TabsBar action={<RunControls studyId={studyId} data={data} />}>
          <TabsList aria-label={t`Analysis`}>
            <TabsTrigger value="sessions">{t`Sessions (${data.sessions.length})`}</TabsTrigger>
            <TabsTrigger value="results">{t`Results by task`}</TabsTrigger>
            <TabsTrigger value="facts">
              {facts.data ? t`Facts (${facts.data.toDecide} to decide)` : t`Facts`}
            </TabsTrigger>
          </TabsList>
        </TabsBar>
        {running(data) ? <AnalysisProgress data={data} /> : null}
        <TabsContent value="sessions">
          <Sessions studyId={studyId} data={data} onOpen={setOpen} readinessOf={readinessOf} />
        </TabsContent>
        <TabsContent value="results">
          <Results studyId={studyId} />
        </TabsContent>
        <TabsContent value="facts">
          {/* Spec 039: the study's facts, decided as in every study; insights read them. */}
          <p className="mb-4 text-muted-foreground text-sm">{t`What the sessions establish: each observation and each task's outcomes give a fact. Decide them here or in the session; the project's insights read them.`}</p>
          <FactBoard studyId={studyId} onOpenObservation={(sessionId) => setOpen(sessionId)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Each validated session with where its analysis stands (an analysed one opens on a click). */
function Sessions({
  studyId,
  data,
  onOpen: setOpen,
  readinessOf,
}: {
  studyId: string
  data: UsabilityStudyAnalysis
  onOpen: (sessionId: string) => void
  readinessOf: (r: string | null) => string
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const intro = (
    <p className="text-muted-foreground text-sm">{t`Each ready session is read task by task from its video: outcome, time, path and observations, checked twice. You decide what counts.`}</p>
  )
  if (data.sessions.length === 0)
    return (
      <div className="grid gap-4">
        {intro}
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">{t`No session yet. Validate the sessions found on the Fieldwork tab: ready ones are analysed here.`}</p>
      </div>
    )
  return (
    <div className="grid gap-4">
      {intro}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t`Session`}</TableHead>
              <TableHead>{t`Video`}</TableHead>
              <TableHead>{t`State`}</TableHead>
              <TableHead>{t`To review`}</TableHead>
              <TableHead>{t`Cost`}</TableHead>
              <TableHead>
                <span className="sr-only">{t`Actions`}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((s) => {
              // An analysed session opens on a click of its row (the button is the keyboard way).
              const explorable = s.analysis?.state === 'done'
              return (
                <TableRow
                  key={s.sessionId}
                  className={explorable ? 'cursor-pointer' : undefined}
                  onClick={explorable ? () => setOpen(s.sessionId) : undefined}
                >
                  <TableCell>
                    <span className="grid min-w-0 max-w-96">
                      <span className="truncate font-medium" title={s.title}>
                        {s.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {s.participant ?? t`Participant to confirm`}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{s.videoMinutes === null ? '—' : t`${s.videoMinutes} min`}</TableCell>
                  <TableCell>
                    {s.analysis ? (
                      <span className="grid gap-0.5">
                        <span className="flex items-center gap-1.5">
                          {s.analysis.state === 'analysing' ? (
                            <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                          ) : null}
                          {i18n._(STATES[s.analysis.state])}
                          {s.analysis.outOfDate ? (
                            <Badge variant="highlight">{t`Out of date`}</Badge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {s.analysis.state === 'analysing' && s.analysis.stage
                            ? i18n._(STAGES[s.analysis.stage])
                            : s.analysis.failure
                              ? i18n._(FAILURES[s.analysis.failure])
                              : null}
                        </span>
                      </span>
                    ) : s.readiness === 'ready' ? (
                      t`Ready`
                    ) : (
                      <span className="text-muted-foreground">
                        {t`Not ready: ${readinessOf(s.readiness)} (see Fieldwork)`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{s.analysis?.toReview ?? '—'}</TableCell>
                  <TableCell>
                    {s.analysis?.cost === undefined || s.analysis?.cost === null
                      ? '—'
                      : money(s.analysis.cost)}
                  </TableCell>
                  {/* Its buttons and dialog are not part of the row's click (portals bubble in React). */}
                  <TableCell
                    className="whitespace-nowrap text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {explorable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t`Explore ${s.title}`}
                          onClick={() => setOpen(s.sessionId)}
                        >
                          {t`Explore`}
                        </Button>
                      ) : null}
                      {/* On every row, as for interviews; a session not ready says why in its state. */}
                      <AnalyseOneButton
                        studyId={studyId}
                        session={s}
                        consentNeeded={data.consentNeeded}
                        disabled={s.readiness !== 'ready' || !data.provider.video || running(data)}
                      />
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RunControls({ studyId, data }: { studyId: string; data: UsabilityStudyAnalysis }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const start = useStartUsabilityRun()
  const stop = useStopUsabilityRun()
  const [asking, setAsking] = useState(false)
  const [again, setAgain] = useState(false)
  const againId = useId()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetUsabilityAnalysisQueryKey(studyId) })
  // Sessions of the run still to finish: waiting or being analysed.
  const left = data.sessions.filter(
    (s) => s.analysis?.state === 'waiting' || s.analysis?.state === 'analysing',
  ).length
  if (data.run)
    return (
      <div className="flex items-center gap-2" role="status">
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        <span className="text-sm">
          {data.run.stopRequested
            ? t`Stopping…`
            : t`Analysing: ${data.run.total - left} of ${data.run.total} sessions`}
        </span>
        <Progress aria-label={t`Progress`} value={data.run.total - left} max={data.run.total} />
        <Button
          size="sm"
          variant="outline"
          disabled={data.run.stopRequested || stop.isPending}
          onClick={() =>
            void stop
              .mutateAsync({ studyId, runId: data.run?.id ?? '' })
              .then(refresh)
              .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
          }
        >
          {t`Stop`}
        </Button>
      </div>
    )
  const cost = data.estimate.cost === null ? t`unknown` : money(data.estimate.cost)
  return (
    <>
      <Button disabled={!data.provider.video} onClick={() => setAsking(true)}>
        <SparklesIcon aria-hidden />
        {t`Analyse sessions`}
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Analyse the sessions?`}</AlertDialogTitle>
            <AlertDialogDescription className="grid gap-2">
              {data.estimate.count === 0 ? (
                <span>{t`Every ready session is analysed. Tick the box to analyse them again.`}</span>
              ) : (
                <>
                  <span>{t`${data.estimate.count} sessions (${data.estimate.minutes} min of video) will be analysed: never analysed, failed or out of date.`}</span>
                  <span>{t`At most ${cost} with your AI provider. The video is copied for this analysis only, then deleted.`}</span>
                </>
              )}
              {data.consentNeeded ? (
                <span>{t`The sessions' videos and transcripts will be sent to your AI provider for this study.`}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox id={againId} checked={again} onCheckedChange={(c) => setAgain(c === true)} />
            <Label
              htmlFor={againId}
              className="font-normal"
            >{t`Also analyse again the sessions already analysed (decided observations stay)`}</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={(data.estimate.count === 0 && !again) || start.isPending}
              onClick={() => {
                setAsking(false)
                void start
                  .mutateAsync({
                    studyId,
                    data: {
                      ...(data.consentNeeded ? { consent: true } : {}),
                      ...(again ? { again: true } : {}),
                    },
                  })
                  .then(refresh)
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }}
            >
              {data.consentNeeded ? t`Agree and analyse` : t`Analyse`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const STAGE_ORDER = [
  'preparing',
  'transcript',
  'screen-log',
  'task-map',
  'tasks',
  'checks',
] as const

/** Where the run stands, session by session, with a bar per analysis: a panel that folds. */
function AnalysisProgress({ data }: { data: UsabilityStudyAnalysis }) {
  const { t, i18n } = useLingui()
  const items: ReadingItem[] = data.sessions.flatMap((s) => {
    const a = s.analysis
    if (!a || (a.state !== 'waiting' && a.state !== 'analysing')) return []
    const step = a.stage ? STAGE_ORDER.indexOf(a.stage) : -1
    return [
      {
        sessionId: s.sessionId,
        title: s.title,
        step: a.state === 'waiting' ? 'waiting' : 'working',
        label:
          a.state === 'analysing' && a.stage
            ? t`${i18n._(STAGES[a.stage])} (step ${step + 1} of ${STAGE_ORDER.length})`
            : i18n._(STATES[a.state]),
        stoppable: false,
        progress: { value: Math.max(0, step), max: STAGE_ORDER.length },
      },
    ]
  })
  if (!items.length) return null
  const total = data.run?.total ?? items.length
  const left = items.length
  return (
    <ReadingList
      name={t`Analysis in progress`}
      summary={t`${total - left} of ${total} sessions analysed`}
      items={items}
    />
  )
}

/** "Analyse" / "Analyse again" for one session, with its own estimate first (as for interviews). */
function AnalyseOneButton({
  studyId,
  session,
  consentNeeded,
  disabled,
}: {
  studyId: string
  session: UsabilityStudyAnalysis['sessions'][number]
  consentNeeded: boolean
  disabled: boolean
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const start = useStartUsabilityRun()
  const [asking, setAsking] = useState(false)
  const analysed = session.analysis !== null
  const again = session.analysis?.state === 'done' && !session.analysis.outOfDate
  const cost = session.estimate === null ? t`unknown` : money(session.estimate)
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={disabled}
        aria-label={analysed ? t`Analyse again: ${session.title}` : t`Analyse: ${session.title}`}
        title={analysed ? t`Analyse again` : t`Analyse`}
        onClick={() => setAsking(true)}
      >
        <SparklesIcon aria-hidden />
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {analysed ? t`Analyse ${session.title} again?` : t`Analyse ${session.title}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="grid gap-2">
              <span>{t`At most ${cost} with your AI provider. The video is copied for this analysis only, then deleted.`}</span>
              {analysed ? (
                <span>{t`Decided observations and outcomes stay; only what is still to review is replaced.`}</span>
              ) : null}
              {consentNeeded ? (
                <span>{t`The sessions' videos and transcripts will be sent to your AI provider for this study.`}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={start.isPending}
              onClick={() => {
                setAsking(false)
                void start
                  .mutateAsync({
                    studyId,
                    data: {
                      sessionIds: [session.sessionId],
                      ...(consentNeeded ? { consent: true } : {}),
                      ...(again ? { again: true } : {}),
                    },
                  })
                  .then(() =>
                    queryClient.invalidateQueries({
                      queryKey: getGetUsabilityAnalysisQueryKey(studyId),
                    }),
                  )
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }}
            >
              {consentNeeded ? t`Agree and analyse` : t`Analyse`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Spec 038 US3: by task across sessions, and the SUS; decided items only. */
function Results({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const results = useGetUsabilityResults(studyId)
  const data = results.data
  if (results.isPending) return <Skeleton className="h-32 w-full" />
  if (results.isError)
    return (
      <p role="alert" className="text-sm">
        {errorMessage(i18n, results.error)}
      </p>
    )
  if (!data || data.tasks.every((task) => task.sessions === 0))
    return (
      <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">{t`No result yet: results count the outcomes you decided in the analysed sessions.`}</p>
    )
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        {data.toReview
          ? t`Counts what you decided; ${data.toReview} items are still to review.`
          : t`Counts what you decided.`}
      </p>
      <ul className="grid gap-3">
        {data.tasks.map((task) => (
          <li key={task.taskId} className="grid gap-2 rounded-md border p-3">
            <p className="font-medium">{task.instruction}</p>
            <div className="flex flex-wrap gap-2">
              {(['success', 'partial', 'failure', 'not-attempted'] as const).map((o) => (
                <Badge key={o} variant={OUTCOME_BADGES[o]}>
                  {i18n._(OUTCOMES[o])}: {task.outcomes[o]}
                </Badge>
              ))}
              {task.medianMs !== null ? (
                <span className="text-muted-foreground text-sm">{t`Median time: ${duration(i18n, task.medianMs) ?? ''}`}</span>
              ) : null}
            </div>
            {task.difficulties.length ? (
              <ul className="list-disc pl-5 text-sm">
                {task.difficulties.slice(0, 5).map((d) => (
                  <li key={d.text}>
                    {d.text}{' '}
                    <span className="text-muted-foreground">({t`${d.sessions} sessions`})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {data.sus.sessions ? (
        <p className="text-sm">{t`System Usability Scale: ${data.sus.mean ?? '—'} out of 100, over ${data.sus.sessions} sessions.`}</p>
      ) : null}
    </div>
  )
}
