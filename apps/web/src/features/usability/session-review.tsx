import {
  getGetUsabilityAnalysisQueryKey,
  getGetUsabilityResultsQueryKey,
  getGetUsabilitySessionQueryKey,
  type UsabilityObservation,
  type UsabilitySessionReview,
  useAddUsabilityObservation,
  useCorrectUsabilityTaskResult,
  useDecideUsabilityObservation,
  useGetUsabilitySession,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  PanelRightIcon,
  PictureInPicture2Icon,
  PlayIcon,
  VideoIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { clock, duration, KINDS, OUTCOME_BADGES, OUTCOMES } from './labels.ts'

type Task = UsabilitySessionReview['tasks'][number]
type Outcome = keyof typeof OUTCOMES

type Pane = 'side' | 'float' | 'hidden'

const PANE_KEY = 'goodresearch.usability.videoPane'

/** Where the person last put the video; a per-browser convenience, never needed to work. */
const savedPane = (): Pane => {
  try {
    const v = localStorage.getItem(PANE_KEY)
    return v === 'float' || v === 'hidden' ? v : 'side'
  } catch {
    return 'side'
  }
}

/**
 * Spec 038 US2: one analysed session to explore. Shortcuts to its tasks on the left, with their
 * outcome in colour and words; observations with their moment, screenshot and checks in the
 * middle; the video from Drive always in sight: docked on the right on wide screens, floating
 * otherwise or when the person wants, with the line being said and the task on screen under it.
 */
export function SessionReview({ studyId, sessionId }: { studyId: string; sessionId: string }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const review = useGetUsabilitySession(sessionId)
  const video = useRef<HTMLVideoElement>(null)
  const [pane, setPaneState] = useState<Pane>(savedPane)
  const [shown, setShown] = useState<Exclude<Pane, 'hidden'>>(() =>
    savedPane() === 'float' ? 'float' : 'side',
  )
  const [nowMs, setNowMs] = useState(0)
  const setPane = (next: Pane) => {
    setPaneState(next)
    if (next !== 'hidden') setShown(next)
    try {
      localStorage.setItem(PANE_KEY, next)
    } catch {
      // Private window or blocked storage: the choice lasts for this page only.
    }
  }
  const play = (ms: number) => {
    const v = video.current
    if (!v) return
    if (pane === 'hidden') setPane(shown)
    v.currentTime = Math.max(0, ms / 1000 - 3)
    void v.play().catch(() => undefined)
  }
  // On this page, a shortcut to a task glides instead of jumping (not when less motion is asked).
  useEffect(() => {
    const root = document.documentElement
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const before = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = before
    }
  }, [])
  // While the video plays, the transcript follows the line being said, gliding, when it is shown.
  const sayingAt =
    [...(review.data?.transcript?.segments ?? [])].reverse().find((s) => s.startMs <= nowMs)
      ?.startMs ?? null
  useEffect(() => {
    if (sayingAt === null || video.current?.paused !== false) return
    const line = document.getElementById(`line-${sayingAt}`)
    // Not shown (another tab): nothing to follow.
    if (!line || line.offsetParent === null) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    line.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }, [sayingAt])
  if (review.isPending) return <Skeleton className="h-60 w-full" />
  if (!review.data) return null
  const data = review.data
  const segments = data.transcript?.segments ?? []
  const saying = [...segments].reverse().find((s) => s.startMs <= nowMs) ?? null
  const onScreen = data.tasks.findIndex(
    (task) =>
      task.result?.startMs != null &&
      task.result.startMs <= nowMs &&
      (task.result.endMs == null || nowMs <= task.result.endMs),
  )
  const docked = pane === 'side'
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">
          {[
            data.session.participant ?? t`Participant to confirm`,
            data.session.facilitators.length
              ? t`Facilitator: ${data.session.facilitators.join(', ')}`
              : null,
            t`Protocol v${data.protocolVersion}`,
            data.cost === null ? null : t`Cost: ${money(data.cost)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {data.outOfDate ? (
          <Badge variant="highlight">{t`Out of date: analyse it again`}</Badge>
        ) : null}
      </div>
      <div
        className={
          docked
            ? 'grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_minmax(20rem,28rem)]'
            : 'grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]'
        }
      >
        <nav aria-label={t`Tasks of the session`} className="lg:sticky lg:top-20 lg:self-start">
          <ol className="grid gap-1">
            {data.tasks.map((task, i) => (
              <li key={task.taskId}>
                <a
                  href={`#task-${task.taskId}`}
                  aria-current={i === onScreen ? 'true' : undefined}
                  className="grid gap-1 rounded-md p-2 text-sm hover:bg-muted aria-[current]:bg-muted"
                >
                  <span>{t`Task ${i + 1}`}</span>
                  {task.result ? (
                    <Badge variant={OUTCOME_BADGES[task.result.outcome]}>
                      {i18n._(OUTCOMES[task.result.outcome])}
                    </Badge>
                  ) : null}
                </a>
              </li>
            ))}
            {data.rejected.length ? (
              <li>
                <a
                  href="#rejected"
                  className="block rounded-md p-2 text-sm hover:bg-muted"
                >{t`Rejected by the checks (${data.rejected.length})`}</a>
              </li>
            ) : null}
          </ol>
        </nav>
        <div className="grid min-w-0 gap-4">
          <Tabs defaultValue="tasks" className="gap-3">
            <TabsList variant="line" className="w-full justify-start border-b">
              <TabsTrigger value="tasks">{t`Tasks`}</TabsTrigger>
              <TabsTrigger value="transcript">{t`Transcript`}</TabsTrigger>
            </TabsList>
            <TabsContent value="tasks" className="grid gap-6">
              {data.tasks.map((task, i) => (
                <TaskSection
                  key={task.taskId}
                  index={i}
                  task={task}
                  studyId={studyId}
                  sessionId={sessionId}
                  onPlay={play}
                />
              ))}
              {data.rejected.length ? (
                <section
                  id="rejected"
                  aria-labelledby="rejected-heading"
                  className="grid scroll-mt-24 gap-2"
                >
                  <h3 id="rejected-heading" className="font-medium">{t`Rejected by the checks`}</h3>
                  <p className="text-muted-foreground text-sm">{t`The arbiter or the judge found contrary evidence. You can still accept one.`}</p>
                  {data.rejected.map((o) => (
                    <ObservationCard
                      key={o.id}
                      o={o}
                      studyId={studyId}
                      sessionId={sessionId}
                      onPlay={play}
                    />
                  ))}
                </section>
              ) : null}
            </TabsContent>
            <TabsContent value="transcript">
              {segments.length ? (
                <ol className="grid gap-1 text-sm">
                  {segments.map((s) => (
                    <li
                      key={`${s.startMs}-${s.speaker}`}
                      id={`line-${s.startMs}`}
                      aria-current={s === saying ? 'true' : undefined}
                      className="grid grid-cols-[4rem_1fr] gap-2 rounded-md px-2 py-1 aria-[current]:bg-muted"
                    >
                      <button
                        type="button"
                        className="text-left text-muted-foreground underline"
                        aria-label={t`Play from ${clock(s.startMs)}`}
                        onClick={() => play(s.startMs)}
                      >
                        {clock(s.startMs)}
                      </button>
                      <span>
                        <span className="font-medium">{s.speaker}: </span>
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">{t`No transcript.`}</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
        {/*
          One player, never mounted again (it keeps its place in the video): docked as a third
          column on wide screens, floating at the bottom right otherwise or when asked, or hidden.
        */}
        <section
          aria-label={t`Video of the session`}
          hidden={pane === 'hidden'}
          className={
            docked
              ? 'fixed right-4 bottom-4 z-40 grid w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-lg border bg-card p-2 shadow-lg xl:sticky xl:top-20 xl:right-auto xl:bottom-auto xl:z-auto xl:w-auto xl:self-start xl:shadow-none'
              : 'fixed right-4 bottom-4 z-40 grid w-[min(24rem,calc(100vw-2rem))] gap-2 rounded-lg border bg-card p-2 shadow-lg'
          }
        >
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm">{t`Video`}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{clock(nowMs)}</span>
            {onScreen >= 0 ? (
              <Badge
                variant={OUTCOME_BADGES[data.tasks[onScreen]?.result?.outcome ?? 'not-attempted']}
              >
                {t`Task ${onScreen + 1}`}
              </Badge>
            ) : null}
            <span className="ml-auto flex">
              <Button
                size="icon-sm"
                variant="ghost"
                className="hidden xl:inline-flex"
                aria-label={docked ? t`Float the video` : t`Dock the video on the side`}
                title={docked ? t`Float the video` : t`Dock the video on the side`}
                onClick={() => setPane(docked ? 'float' : 'side')}
              >
                {docked ? <PictureInPicture2Icon aria-hidden /> : <PanelRightIcon aria-hidden />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t`Hide the video`}
                title={t`Hide the video`}
                onClick={() => {
                  video.current?.pause()
                  setPane('hidden')
                }}
              >
                <XIcon aria-hidden />
              </Button>
            </span>
          </div>
          {/* biome-ignore lint/a11y/useMediaCaption: the line being said shows under it, the transcript tab is the session's text. */}
          <video
            ref={video}
            controls
            preload="metadata"
            className="aspect-video w-full rounded-md bg-black"
            src={`/api/usability/sessions/${sessionId}/video`}
            aria-label={t`Video of the session, from Drive`}
            onTimeUpdate={(e) => {
              // Half a second is enough to follow the words: fewer renders.
              const ms = Math.floor(e.currentTarget.currentTime * 2) * 500
              if (ms !== nowMs) setNowMs(ms)
            }}
          />
          {saying ? (
            <p className="line-clamp-3 text-sm" aria-live="off">
              <span className="font-medium">{saying.speaker}: </span>
              {saying.text}
            </p>
          ) : null}
        </section>
      </div>
      {pane === 'hidden' ? (
        <Button
          variant="outline"
          className="fixed right-4 bottom-4 z-40 shadow-lg"
          onClick={() => setPane(shown)}
        >
          <VideoIcon aria-hidden />
          {t`Show the video`}
        </Button>
      ) : null}
    </div>
  )
}

const useRefresh = (studyId: string, sessionId: string) => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetUsabilitySessionQueryKey(sessionId) }),
      queryClient.invalidateQueries({ queryKey: getGetUsabilityAnalysisQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getGetUsabilityResultsQueryKey(studyId) }),
    ])
}

function TaskSection({
  task,
  index,
  studyId,
  sessionId,
  onPlay,
}: {
  task: Task
  index: number
  studyId: string
  sessionId: string
  onPlay: (ms: number) => void
}) {
  const { t, i18n } = useLingui()
  const refresh = useRefresh(studyId, sessionId)
  const correct = useCorrectUsabilityTaskResult()
  const outcomeId = useId()
  const r = task.result
  return (
    <section
      id={`task-${task.taskId}`}
      aria-labelledby={`task-heading-${task.taskId}`}
      className="grid scroll-mt-24 gap-3 rounded-md border p-4"
    >
      <div className="grid gap-1">
        <h3 id={`task-heading-${task.taskId}`} className="font-medium">
          {t`Task ${index + 1}: ${task.instruction}`}
        </h3>
        <p className="text-muted-foreground text-xs">{t`Success: ${task.criterion}`}</p>
      </div>
      {r ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span id={outcomeId} className="sr-only">{t`Outcome of task ${index + 1}`}</span>
          <Select
            value={r.outcome}
            onValueChange={(value) =>
              value &&
              void correct
                .mutateAsync({
                  taskResultId: r.id,
                  data: { outcome: value as Outcome, version: r.version },
                })
                .then(refresh)
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            <SelectTrigger aria-labelledby={outcomeId} className="w-44">
              <SelectValue>{(v: Outcome) => i18n._(OUTCOMES[v])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(['success', 'partial', 'failure', 'not-attempted'] as const).map((o) => (
                <SelectItem key={o} value={o}>
                  {i18n._(OUTCOMES[o])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={OUTCOME_BADGES[r.outcome]}>{i18n._(OUTCOMES[r.outcome])}</Badge>
          {r.status === 'proposed' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void correct
                  .mutateAsync({
                    taskResultId: r.id,
                    data: { outcome: r.outcome, version: r.version },
                  })
                  .then(refresh)
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }
            >
              <CheckIcon aria-hidden />
              {t`Confirm the outcome`}
            </Button>
          ) : (
            <span className="text-muted-foreground">{t`Decided`}</span>
          )}
          {r.timeOnTaskMs !== null ? (
            <span>{t`Time on task: ${duration(i18n, r.timeOnTaskMs) ?? ''}`}</span>
          ) : null}
          {r.ease !== null ? <span>{t`Ease: ${r.ease}/7`}</span> : null}
          {r.startMs !== null ? (
            <Button size="sm" variant="ghost" onClick={() => onPlay(r.startMs ?? 0)}>
              <PlayIcon aria-hidden />
              {t`Play from ${clock(r.startMs)}`}
            </Button>
          ) : null}
        </div>
      ) : null}
      {r?.path ? <p className="text-sm">{t`Path: ${r.path}`}</p> : null}
      {task.observations.length ? (
        <ul className="grid gap-2">
          {task.observations.map((o) => (
            <li key={o.id}>
              <ObservationCard o={o} studyId={studyId} sessionId={sessionId} onPlay={onPlay} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t`No observation for this task.`}</p>
      )}
      <AddObservation studyId={studyId} sessionId={sessionId} taskId={task.taskId} />
    </section>
  )
}

function ObservationCard({
  o,
  studyId,
  sessionId,
  onPlay,
}: {
  o: UsabilityObservation
  studyId: string
  sessionId: string
  onPlay: (ms: number) => void
}) {
  const { t, i18n } = useLingui()
  const refresh = useRefresh(studyId, sessionId)
  const decide = useDecideUsabilityObservation()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(o.text)
  const textId = useId()
  const act = (data: Parameters<typeof decide.mutateAsync>[0]['data']) =>
    void decide
      .mutateAsync({ observationId: o.id, data })
      .then(() => {
        setEditing(false)
        return refresh()
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const checks =
    o.arbiter !== null
      ? o.arbiter === 'kept'
        ? t`Doubted by the judge, kept by the arbiter: ${o.arbiterReason ?? ''}`
        : t`Rejected by the arbiter: ${o.arbiterReason ?? ''}`
      : o.judge === 'kept'
        ? t`Confirmed by the judge: ${o.judgeReason ?? ''}`
        : o.judge === 'rejected'
          ? t`Rejected by the judge: ${o.judgeReason ?? ''}`
          : o.judge === 'not-confirmed'
            ? t`Not confirmed: ${o.judgeReason ?? ''}`
            : t`Added by a person`
  return (
    <article className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[10rem_1fr]">
      {o.screenshot ? (
        <img
          src={`/api/usability/observations/${o.id}/screenshot`}
          alt={t`Screen at ${clock(o.momentMs)}`}
          className="w-full rounded border"
          loading="lazy"
        />
      ) : (
        <span aria-hidden />
      )}
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{i18n._(KINDS[o.kind])}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPlay(o.momentMs)}
            aria-label={t`Play at ${clock(o.momentMs)}`}
          >
            <PlayIcon aria-hidden />
            {clock(o.momentMs)}
          </Button>
          <span className="text-muted-foreground text-xs">
            {o.status === 'proposed'
              ? t`To decide`
              : o.status === 'rejected'
                ? t`Rejected`
                : o.status === 'edited'
                  ? t`Edited`
                  : t`Accepted`}
          </span>
        </div>
        {editing ? (
          <div className="grid gap-1">
            <Label htmlFor={textId}>{t`Observation`}</Label>
            <Textarea
              id={textId}
              value={text}
              maxLength={400}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : (
          <p>{o.text}</p>
        )}
        {o.quote ? (
          <blockquote className="border-l-2 pl-2 text-sm italic">« {o.quote} »</blockquote>
        ) : null}
        {o.seen ? <p className="text-muted-foreground text-sm">{t`Seen: ${o.seen}`}</p> : null}
        <p className="text-muted-foreground text-xs">{checks}</p>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={!text.trim() || decide.isPending}
                onClick={() => act({ action: 'edit', value: { text }, version: o.version })}
              >
                {t`Save`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t`Cancel`}
              </Button>
            </>
          ) : o.status === 'proposed' ? (
            <>
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => act({ action: 'accept', version: o.version })}
              >
                <CheckIcon aria-hidden />
                {t`Accept`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t`Edit`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={decide.isPending}
                onClick={() => act({ action: 'reject', version: o.version })}
              >
                <XIcon aria-hidden />
                {t`Reject`}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={decide.isPending}
              onClick={() => act({ action: 'reopen', version: o.version })}
            >
              {t`Back to review`}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function AddObservation({
  studyId,
  sessionId,
  taskId,
}: {
  studyId: string
  sessionId: string
  taskId: string
}) {
  const { t, i18n } = useLingui()
  const refresh = useRefresh(studyId, sessionId)
  const add = useAddUsabilityObservation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [moment, setMoment] = useState('00:00')
  const ids = { text: useId(), moment: useId() }
  if (!open)
    return (
      <Button
        size="sm"
        variant="ghost"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        {t`Add an observation`}
      </Button>
    )
  const [m, s] = moment.split(':').map((x) => Number.parseInt(x, 10))
  const momentMs =
    Number.isFinite(m) && Number.isFinite(s) ? ((m ?? 0) * 60 + (s ?? 0)) * 1000 : Number.NaN
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3">
      <Label htmlFor={ids.text}>{t`What you saw`}</Label>
      <Textarea
        id={ids.text}
        value={text}
        maxLength={400}
        onChange={(e) => setText(e.target.value)}
      />
      <Label htmlFor={ids.moment}>{t`At (mm:ss)`}</Label>
      <Input
        id={ids.moment}
        value={moment}
        className="w-28"
        onChange={(e) => setMoment(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!text.trim() || !Number.isFinite(momentMs) || add.isPending}
          onClick={() =>
            void add
              .mutateAsync({
                sessionId,
                data: { kind: 'difficulty', taskId, momentMs, text: text.trim() },
              })
              .then(() => {
                setOpen(false)
                setText('')
                return refresh()
              })
              .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
          }
        >
          {t`Add`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t`Cancel`}
        </Button>
      </div>
    </div>
  )
}
