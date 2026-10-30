import {
  type Fieldwork,
  getGetFieldworkQueryKey,
  getGetStudySourceQueryKey,
  getListPlannedInterviewsQueryKey,
  type Session,
  useDecideSession,
  useGetFieldwork,
  useGetStudySource,
  useLinkSession,
  useRefreshInventory,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  CalendarIcon,
  FileSearchIcon,
  FileTextIcon,
  HourglassIcon,
  LoaderCircleIcon,
  MicIcon,
  PencilIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UsersIcon,
  VideoIcon,
} from '@goodresearch/ui/components/icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { Switch } from '@goodresearch/ui/components/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { SourcePanel } from '../ingestion/source-panel.tsx'
import { PLANNED_STATUSES } from '../preparation/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'
import {
  AnalysisLine,
  AnalyzeAll,
  analysisRunning,
  reviewable,
  scheduleEntryOf,
  useAddToSchedule,
  useAnalyzeOne,
} from './analysis.tsx'
import { SESSION_STATES, SUGGESTION_RULES } from './labels.ts'
import { takeRenameAfterConsent, useQuietRename } from './proposals.tsx'
import { SessionDialog } from './session-dialog.tsx'

const ALL = '__all__'

const isVideo = (f: { mimeType: string }) => f.mimeType.startsWith('video/')

/** Analyzed (done or incomplete): the interview now waits for the person's decision. */
const wasAnalyzed = (s: Session) => s.analysis?.state === 'done' || s.analysis?.state === 'failed'

/** What waits for the person: open proposals, and the planned interview to link or add. */
const toDecide = (s: Session) =>
  (s.analysis?.proposals.filter((p) => p.status === 'proposed').length ?? 0) +
  (!s.link && (s.suggestion || scheduleEntryOf(s)) ? 1 : 0)

/** The group of an interview: its transcript's, else its first recording's. */
const group0 = (s: Session) => s.transcript?.group ?? s.media[0]?.group

/** Who took part, from the people entered, else from the linked planned interview. */
const peopleOf = (s: Session) => {
  const named = (role: 'interviewer' | 'interviewee') =>
    s.roster.filter((r) => r.role === role).map((r) => r.name)
  if (s.roster.length)
    return {
      interviewees: named('interviewee'),
      interviewers: named('interviewer'),
      planned: false,
    }
  if (s.link)
    return {
      interviewees: [s.link.interviewee],
      interviewers: s.link.interviewers ? [s.link.interviewers] : [],
      planned: true,
    }
  return { interviewees: [], interviewers: [], planned: false }
}

/**
 * The Fieldwork phase (spec 008): what was run, with which files and by whom, then the folder
 * the files come from. Without a folder, attaching it comes first.
 */
export function FieldworkTab({ studyId, isAdmin }: { studyId: string; isAdmin: boolean }) {
  const { t } = useLingui()
  const source = useGetStudySource(studyId, {
    query: {
      // Live state while an inventory runs (its panel may be closed, in the page bar's dialog).
      refetchInterval: (query) =>
        query.state.data?.source?.inventory.status === 'running' ? 2000 : false,
    },
  })
  const lastInventory =
    source.data?.access === 'full' ? (source.data.source?.inventory.lastSuccessAt ?? null) : null
  const fieldwork = useGetFieldwork(studyId, { query: { enabled: lastInventory !== null } })
  return (
    <div className="grid gap-10">
      {lastInventory ? (
        <Interviews
          studyId={studyId}
          lastInventory={lastInventory}
          running={source.data?.source?.inventory.status === 'running'}
        />
      ) : null}
      {/* Once an inventory is there, the folder lives behind the icon of the page bar. */}
      {lastInventory ? null : (
        <section aria-labelledby="folder-heading" className="grid gap-3">
          <SectionTitle id="folder-heading">{t`Study folder`}</SectionTitle>
          <SourcePanel
            studyId={studyId}
            isAdmin={isAdmin}
            interviews={fieldwork.data?.sessions.length ?? 0}
          />
        </section>
      )}
    </div>
  )
}

/** The headline numbers: interviews, transcripts, recordings, and the schedule. */
function Overview({ data }: { data: Fieldwork }) {
  const { t } = useLingui()
  const money = useMoney()
  const analyzed = data.sessions.filter((s) => s.analysis).length
  const active = data.sessions.filter((s) => s.state !== 'excluded')
  const withTranscript = active.filter((s) => !s.noTranscript && !s.fileMissing).length
  const missing = active.filter((s) => !s.noTranscript && s.fileMissing).length
  const without = active.filter((s) => s.noTranscript).length
  const withRecording = active.filter((s) => s.media.length > 0).length
  const recordings = active.flatMap((s) => s.media)
  const videos = recordings.filter(isVideo).length
  const audios = recordings.length - videos
  const linked = new Set(active.flatMap((s) => (s.link ? [s.link.plannedInterviewId] : []))).size
  const planned = linked + data.plannedWithoutSession.length
  const { validated, excluded } = data.totals
  // Proposed: not analyzed yet; to decide: analyzed, waiting for the person (spec 009).
  const toDecideCount = data.sessions.filter((s) => s.state === 'proposed' && wasAnalyzed(s)).length
  const proposed = data.totals.proposed - toDecideCount
  const unmatched = data.unmatchedMedia.length
  return (
    <StatTiles aria-label={t`Fieldwork in numbers`}>
      <StatTile
        icon={<UsersIcon aria-hidden />}
        label={t`Interviews found`}
        value={active.length}
        detail={[
          t`${validated} validated`,
          ...(toDecideCount ? [t`${toDecideCount} to decide`] : []),
          ...(proposed || !toDecideCount ? [t`${proposed} proposed`] : []),
          ...(excluded ? [t`${excluded} excluded`] : []),
        ].join(' · ')}
      />
      <StatTile
        icon={<FileTextIcon aria-hidden />}
        label={t`With a transcript`}
        value={withTranscript}
        detail={[
          plural(active.length, { one: 'of # interview', other: 'of # interviews' }),
          ...(without ? [t`${without} without transcript`] : []),
          ...(missing ? [t`${missing} missing in Drive`] : []),
        ].join(' · ')}
      />
      <StatTile
        icon={<VideoIcon aria-hidden />}
        label={t`With a recording`}
        value={withRecording}
        detail={[
          plural(videos, { one: '# video', other: '# videos' }),
          plural(audios, { one: '# audio', other: '# audio' }),
          ...(unmatched ? [t`${unmatched} not matched`] : []),
        ].join(' · ')}
      />
      <StatTile
        icon={<CalendarIcon aria-hidden />}
        label={t`Planned interviews`}
        value={planned}
        detail={t`${linked} with a transcript · ${data.plannedWithoutSession.length} without`}
      />
      <StatTile
        icon={<FileSearchIcon aria-hidden />}
        label={t`Analyzed`}
        value={analyzed}
        detail={t`Cost of the analyses: ${data.analysisCost === null ? t`unknown` : money(data.analysisCost)}`}
      />
    </StatTiles>
  )
}

/** The files of an interview as icons that open them: the transcript, then each recording. */
function FileIcons({ s }: { s: Session }) {
  const { t } = useLingui()
  const icon = 'inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted'
  return (
    <ul className="flex items-center gap-1">
      <li>
        {s.noTranscript ? (
          <span
            className="inline-flex size-8 items-center justify-center rounded-md bg-highlight-soft text-highlight-soft-foreground"
            role="img"
            aria-label={t`No transcript found`}
            title={t`No transcript found`}
          >
            <TriangleAlertIcon aria-hidden className="size-4" />
          </span>
        ) : s.transcript ? (
          <a
            href={s.transcript.webLink}
            target="_blank"
            rel="noreferrer"
            className={icon}
            aria-label={t`Open the transcript: ${s.transcript.name}`}
            title={s.transcript.name}
          >
            <FileTextIcon aria-hidden className="size-4" />
          </a>
        ) : (
          <Badge variant="destructive">{t`Transcript missing`}</Badge>
        )}
      </li>
      {s.media.map((m) => {
        const video = isVideo(m)
        return (
          <li key={m.fileId}>
            <a
              href={m.webLink}
              target="_blank"
              rel="noreferrer"
              className={icon}
              aria-label={video ? t`Open the video: ${m.name}` : t`Open the audio: ${m.name}`}
              title={m.name}
            >
              {video ? (
                <VideoIcon aria-hidden className="size-4" />
              ) : (
                <MicIcon aria-hidden className="size-4" />
              )}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

const STATE_BADGE: Record<Session['state'], 'outline' | 'secondary' | 'ghost'> = {
  proposed: 'outline',
  validated: 'secondary',
  excluded: 'ghost',
}

/** Looks in the folder again: new transcripts and recordings become interviews (FR-002). */
function RefreshButton({ studyId, running }: { studyId: string; running: boolean }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const refresh = useRefreshInventory()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={running || refresh.isPending}
      onClick={() =>
        void refresh
          .mutateAsync({ studyId })
          .then(() =>
            queryClient.invalidateQueries({ queryKey: getGetStudySourceQueryKey(studyId) }),
          )
          .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
      }
    >
      <RefreshCwIcon aria-hidden className={running ? 'animate-spin' : undefined} />
      {running ? t`Refreshing…` : t`Refresh`}
    </Button>
  )
}

function Interviews({
  studyId,
  lastInventory,
  running,
}: {
  studyId: string
  lastInventory: string
  running: boolean
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const formatDate = useFormatDate()
  // While analyses run, the rows follow their progress (spec 009 US2).
  const fieldwork = useGetFieldwork(studyId, {
    query: { refetchInterval: (query) => (analysisRunning(query.state.data) ? 2000 : false) },
  })
  const analyzer = useAnalyzeOne(studyId)
  const schedule = useAddToSchedule(studyId)
  const quietRename = useQuietRename(studyId)
  // Back from the editing consent: the renaming that needed it goes on.
  useEffect(() => {
    const sessionId = takeRenameAfterConsent(studyId)
    if (sessionId) void quietRename(sessionId)
  }, [])
  const link = useLinkSession()
  const decide = useDecideSession()
  const [state, setState] = useState<string>(ALL)
  const [group, setGroup] = useState<string>(ALL)
  const [open, setOpen] = useState<Session | null>(null)
  const [tab, setTab] = useState<string>('interviews')
  const ids = { state: useId(), group: useId() }
  const day = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' })

  // A finished inventory changes the proposals (FR-002).
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) })
  }, [lastInventory, queryClient, studyId])

  if (fieldwork.isPending) return <Skeleton className="h-40 w-full" />
  if (!fieldwork.data) return null
  const data = fieldwork.data
  const groups = [
    ...new Set(
      data.sessions.flatMap((s) => {
        const g = group0(s)
        return g ? [g] : []
      }),
    ),
  ]
  // Both lists share filters and columns, so switching tabs never moves the layout.
  const rows = data.sessions.filter(
    (s) =>
      (tab !== 'no-transcript' || s.noTranscript) &&
      (state === ALL || s.state === state) &&
      (group === ALL || group0(s) === group),
  )
  const withoutTranscript = data.sessions.filter((s) => s.noTranscript)

  const confirm = (s: Session) =>
    void link
      .mutateAsync({
        sessionId: s.id,
        data: {
          plannedInterviewId: s.suggestion?.plannedInterviewId ?? null,
          version: s.version,
          confirmSuggestion: true,
        },
      })
      .then(() => queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }))
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))

  /** On: validated by the person; off: back to review (a person's decision either way). */
  const toggle = (s: Session, on: boolean) =>
    void decide
      .mutateAsync({
        sessionId: s.id,
        data: { decision: on ? 'validate' : 'reopen', version: s.version },
      })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }),
          queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) }),
        ]),
      )
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))

  /** One row per interview: name, people, files, planned interview, state and action. */
  const table = (list: readonly Session[]) => (
    <div className="overflow-x-auto rounded-md border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[26%]">{t`Interview`}</TableHead>
            <TableHead className="w-[16%]">{t`People`}</TableHead>
            <TableHead className="w-[11%]">{t`Files`}</TableHead>
            <TableHead className="w-[18%]">{t`Planned interview`}</TableHead>
            <TableHead className="w-[11%]">{t`State`}</TableHead>
            <TableHead className="w-[10%]">{t`Validated`}</TableHead>
            <TableHead>
              <span className="sr-only">{t`Actions`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((s) => {
            const name = s.title ?? s.defaultTitle
            const who = peopleOf(s)
            const at = s.transcript?.modifiedAt ?? s.media[0]?.modifiedAt
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="grid min-w-0">
                    {/* Long names are cut with an ellipsis; the full name shows on hover. */}
                    <span className="truncate font-medium" title={name}>
                      {name}
                    </span>
                    {s.noTranscript ? (
                      <Badge variant="highlight">
                        <TriangleAlertIcon aria-hidden />
                        {t`No transcript`}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground text-xs">
                      {[group0(s), at ? day.format(new Date(at)) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <AnalysisLine s={s} />
                  </span>
                </TableCell>
                <TableCell>
                  {/* Long lists of people end in "…", whole on hover: the next column stays clear. */}
                  <span className="grid max-w-64">
                    <span className="truncate" title={who.interviewees.join(', ')}>
                      {who.interviewees.length ? who.interviewees.join(', ') : '—'}
                    </span>
                    {who.interviewers.length ? (
                      <span
                        className="truncate text-muted-foreground text-xs"
                        title={who.interviewers.join(', ')}
                      >
                        {t`Interviewer: ${who.interviewers.join(', ')}`}
                      </span>
                    ) : null}
                    {who.planned ? (
                      <span className="text-muted-foreground text-xs">{t`from the schedule`}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <FileIcons s={s} />
                </TableCell>
                <TableCell>
                  {s.link ? (
                    <span className="grid">
                      <span>{s.link.interviewee}</span>
                      <span className="text-muted-foreground text-xs">
                        {i18n._(PLANNED_STATUSES[s.link.status])}
                      </span>
                    </span>
                  ) : s.suggestion && reviewable(s) ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm" title={i18n._(SUGGESTION_RULES[s.suggestion.rule])}>
                        {t`Suggested: ${s.suggestion.interviewee}`}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={link.isPending}
                        aria-label={t`Confirm ${s.suggestion.interviewee} for ${name}`}
                        onClick={() => confirm(s)}
                      >
                        {t`Confirm`}
                      </Button>
                    </span>
                  ) : reviewable(s) && scheduleEntryOf(s) ? (
                    // No planned interview matches: the interview can become one (FR-017).
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={schedule.pending}
                      aria-label={t`Add ${scheduleEntryOf(s)?.interviewee ?? ''} to the schedule`}
                      onClick={() => void schedule.add(s)}
                    >
                      {t`Add to the schedule`}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {s.state === 'proposed' && wasAnalyzed(s) ? (
                    // FR-020: the interview waits for a person; the count is what its analysis left.
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t`To decide (${toDecide(s)}): open ${name}`}
                      onClick={() => setOpen(s)}
                    >
                      {t`To decide (${toDecide(s)})`}
                    </Button>
                  ) : (
                    <Badge variant={STATE_BADGE[s.state]}>{i18n._(SESSION_STATES[s.state])}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.state === 'validated'}
                    disabled={s.state === 'excluded' || decide.isPending}
                    aria-label={t`Validated: ${name}`}
                    onCheckedChange={(on) => toggle(s, on)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {/* A validated interview too: anything new sends it back to decide. */}
                  {reviewable(s) || s.state === 'validated' ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={
                        analyzer.stage(s) === 'analyzing'
                          ? t`Analyzing ${name}…`
                          : analyzer.stage(s) === 'waiting'
                            ? t`${name} waits for its analysis`
                            : t`Analyze ${name}`
                      }
                      aria-busy={analyzer.stage(s) !== null || undefined}
                      title={
                        analyzer.stage(s) === 'analyzing'
                          ? t`Analyzing…`
                          : analyzer.stage(s) === 'waiting'
                            ? t`Waiting for analysis`
                            : t`Analyze`
                      }
                      disabled={analyzer.stage(s) !== null}
                      onClick={() => void analyzer.analyze(s)}
                    >
                      {/* Analyzing now: a spinner; waiting in the run's queue: an hourglass. */}
                      {analyzer.stage(s) === 'analyzing' ? (
                        <LoaderCircleIcon aria-hidden className="animate-spin" />
                      ) : analyzer.stage(s) === 'waiting' ? (
                        <HourglassIcon aria-hidden className="text-muted-foreground" />
                      ) : (
                        <FileSearchIcon aria-hidden />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={reviewable(s) ? t`Review ${name}` : t`Open ${name}`}
                    title={reviewable(s) ? t`Review` : t`Open`}
                    onClick={() => setOpen(s)}
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )

  const list = (
    <>
      {data.sessions.length ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <span id={ids.state} className="text-sm">{t`State`}</span>
              <Select value={state} onValueChange={(v) => v && setState(v)}>
                <SelectTrigger aria-labelledby={ids.state} className="w-44">
                  <SelectValue>
                    {(v: string) =>
                      v === ALL
                        ? t`All (${data.sessions.length})`
                        : `${i18n._(SESSION_STATES[v as Session['state']])} (${data.totals[v as Session['state']]})`
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t`All (${data.sessions.length})`}</SelectItem>
                  {(['proposed', 'validated', 'excluded'] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {i18n._(SESSION_STATES[s])} ({data.totals[s]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {groups.length > 1 ? (
              <div className="grid gap-1">
                <span id={ids.group} className="text-sm">{t`Group`}</span>
                <Select value={group} onValueChange={(v) => v && setGroup(v)}>
                  <SelectTrigger aria-labelledby={ids.group} className="w-44">
                    <SelectValue>{(v: string) => (v === ALL ? t`All` : v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t`All`}</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <AnalyzeAll studyId={studyId} data={data} />
          </div>
          {data.anonymised && data.namedFiles ? (
            <p role="status" className="text-sm">
              {plural(data.namedFiles, {
                one: 'Anonymisation is on: # interview has a name in its file names. Analyze it and rename its files.',
                other:
                  'Anonymisation is on: # interviews have a name in their file names. Analyze them and rename their files.',
              })}
            </p>
          ) : null}
          {rows.length ? (
            table(rows)
          ) : (
            <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
              {tab === 'no-transcript' && state === ALL && group === ALL
                ? t`Every recording is with its transcript.`
                : t`No interview matches these filters.`}
            </p>
          )}
        </>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">{t`No transcript in the folder yet. Transcripts dropped in the folder appear here after a refresh.`}</p>
      )}
    </>
  )

  return (
    <section aria-labelledby="interviews-heading" className="grid gap-4">
      <div className="grid gap-1">
        <SectionTitle id="interviews-heading">{t`Interviews`}</SectionTitle>
        <p className="text-muted-foreground text-sm">{t`Each transcript of the folder is an interview. Link it to the planned interview, check its recordings and people, then validate it.`}</p>
      </div>
      <Overview data={data} />
      {data.skipped ? (
        <p
          role="status"
          className="text-sm"
        >{t`${data.skipped} more transcripts are in the folder: a study holds at most 500 interviews.`}</p>
      ) : null}

      <Tabs defaultValue="interviews" onValueChange={(v) => setTab(String(v))} className="gap-3">
        {/* The refresh sits in the tab bar, outside the tab list (only tabs belong there). */}
        <div className="flex flex-wrap items-center gap-2 border-b">
          <TabsList variant="line" className="flex-1 border-b-0">
            <TabsTrigger value="interviews">{t`Interviews (${data.sessions.length})`}</TabsTrigger>
            <TabsTrigger value="no-transcript">{t`Without transcript (${withoutTranscript.length})`}</TabsTrigger>
            <TabsTrigger value="planned">{t`Planned only (${data.plannedWithoutSession.length})`}</TabsTrigger>
          </TabsList>
          <RefreshButton studyId={studyId} running={running} />
        </div>

        <TabsContent value="interviews" className="grid gap-3">
          {list}
        </TabsContent>

        <TabsContent value="no-transcript" className="grid gap-3">
          {list}
        </TabsContent>

        <TabsContent value="planned" className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t`Planned interviews with no transcript in the folder yet.`}</p>
          {data.plannedWithoutSession.length ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t`Person to interview`}</TableHead>
                    <TableHead>{t`Date and time`}</TableHead>
                    <TableHead>{t`Status`}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plannedWithoutSession.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.interviewee}</TableCell>
                      <TableCell>{formatDate(p.scheduledAt)}</TableCell>
                      <TableCell>{i18n._(PLANNED_STATUSES[p.status])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t`Every planned interview has its transcript.`}</p>
          )}
        </TabsContent>
      </Tabs>

      {analyzer.dialog}
      {open ? (
        <SessionDialog
          key={open.id}
          studyId={studyId}
          session={open}
          unmatchedMedia={data.unmatchedMedia}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  )
}
