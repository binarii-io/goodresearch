import {
  type Enrichment,
  type EnrichmentInterview,
  getGetEnrichmentQueryKey,
  getListLexiconQueryKey,
  useEstimateLexiconRun,
  useGetCleaning,
  useGetEnrichment,
  useStartLexiconRun,
  useStopLexiconReading,
  useStopLexiconRun,
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
  FileTextIcon,
  HourglassIcon,
  LoaderCircleIcon,
  SpellCheckIcon,
  SquareIcon,
  TriangleAlertIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
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
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { type ReadingItem, ReadingList } from '../workspace/reading-list.tsx'
import { CleaningTable, cleaning } from './cleaning-table.tsx'
import { InterviewCleaningView } from './interview-cleaning.tsx'
import { ENRICHMENT_STATES, LEXICON_FAILURES, READING_STATES } from './labels.ts'
import { LexiconTable } from './lexicon-table.tsx'

/** A reading is going on: the tab follows its progress. */
const reading = (data: Enrichment | undefined) => !!data?.run && !data.run.finished

/**
 * Two phases of a study over its validated interviews: Lexicon, the team terms found in them (spec
 * 010), then Enrichment, the cleaning of their transcripts (spec 011), each with what it costs.
 */
export function EnrichmentTab({
  studyId,
  part,
  reviewing = null,
  onReview,
}: {
  studyId: string
  part: 'lexicon' | 'cleaning'
  /** The interview whose cleaning is open (in the address), a page below the study's. */
  reviewing?: string | null
  onReview?: (sessionId: string | null) => void
}) {
  const { t, i18n } = useLingui()
  const enrichment = useGetEnrichment(studyId, {
    query: {
      // Interviews are validated in Fieldwork: coming back here shows them at once.
      refetchOnMount: 'always',
      refetchInterval: (query) => (reading(query.state.data) ? 2000 : false),
    },
  })
  const cleaningView = useGetCleaning(studyId, {
    query: {
      refetchOnMount: 'always',
      refetchInterval: (query) => (cleaning(query.state.data) ? 2000 : false),
    },
  })
  const queryClient = useQueryClient()
  // A reading that ends brings new terms: the lexicon is read again.
  const finishedRun = enrichment.data?.run?.finished ? enrichment.data.run.id : null
  useEffect(() => {
    if (finishedRun)
      void queryClient.invalidateQueries({ queryKey: getListLexiconQueryKey(studyId) })
  }, [finishedRun, queryClient, studyId])
  const [tab, setTab] = useState<string>('lexicon')
  const [session, setSession] = useState<string | null>(null)
  const data = enrichment.data
  if (!data) return <Skeleton className="h-40 w-full" />
  if (data.interviews.length === 0)
    return (
      <div className="grid max-w-prose gap-2">
        <p className="text-base">{t`No validated interview yet.`}</p>
        <p className="text-muted-foreground text-sm">
          {data.toValidate
            ? t`${data.toValidate} interviews wait for your decision in Fieldwork: validate them to find their terms here.`
            : part === 'lexicon'
              ? t`Interviews are validated in Fieldwork; their terms are found here.`
              : t`Interviews are validated in Fieldwork; their transcripts are cleaned here.`}{' '}
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
  if (reviewing && part === 'cleaning')
    return (
      <InterviewCleaningView
        studyId={studyId}
        sessionId={reviewing}
        onBack={() => onReview?.(null)}
      />
    )
  const clean = cleaningView.data
  if (part === 'cleaning')
    return (
      <section aria-label={t`Cleaning`}>
        {clean ? (
          <CleaningTable studyId={studyId} data={clean} onOpen={(id) => onReview?.(id)} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </section>
    )
  return (
    <div className="grid gap-6">
      <Overview data={data} />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList aria-label={t`Lexicon`}>
            <TabsTrigger value="lexicon">{t`Lexicon (${data.counts.toDecide} to decide)`}</TabsTrigger>
            <TabsTrigger value="interviews">{t`Interviews (${data.interviews.length})`}</TabsTrigger>
          </TabsList>
          <FindTerms studyId={studyId} data={data} />
        </div>
        {reading(data) ? <ReadingProgress studyId={studyId} data={data} /> : null}
        {data.run?.finished && data.run.failure ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <TriangleAlertIcon aria-hidden className="size-4 text-highlight-soft-foreground" />
            {i18n._(LEXICON_FAILURES[data.run.failure])}
          </p>
        ) : null}
        {data.run?.finished && data.run.leftOut > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t`${data.run.leftOut} rarer words were left out of the last reading (at most 300 per reading).`}
          </p>
        ) : null}
        <TabsContent value="lexicon">
          <LexiconTable
            studyId={studyId}
            interviews={data.interviews}
            session={session}
            onSession={setSession}
          />
        </TabsContent>
        <TabsContent value="interviews">
          <Interviews
            studyId={studyId}
            data={data}
            onTerms={(id) => {
              setSession(id)
              setTab('lexicon')
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Overview({ data }: { data: Enrichment }) {
  const { t } = useLingui()
  const money = useMoney()
  const withTranscript = data.interviews.filter((i) => i.state !== 'no-transcript').length
  return (
    <StatTiles aria-label={t`Lexicon in numbers`}>
      <StatTile
        icon={<FileTextIcon aria-hidden />}
        label={t`Interviews read`}
        value={data.counts.read}
        detail={[
          t`of ${withTranscript} with a transcript`,
          ...(data.toValidate ? [t`${data.toValidate} still to validate in Fieldwork`] : []),
        ].join(' · ')}
      />
      <StatTile
        icon={<SpellCheckIcon aria-hidden />}
        label={t`Terms to decide`}
        value={data.counts.toDecide}
        detail={t`Proposed, or with new spellings`}
      />
      <StatTile
        icon={<CheckIcon aria-hidden />}
        label={t`Accepted terms`}
        value={data.counts.accepted}
        detail={t`Found in this study, shared with the team`}
      />
      <StatTile
        icon={<SpellCheckIcon aria-hidden />}
        label={t`Cost of the readings`}
        value={data.cost === null ? t`unknown` : money(data.cost)}
        detail={
          data.lastRunCost === null
            ? t`Last reading: unknown`
            : t`Last reading: ${money(data.lastRunCost)}`
        }
      />
    </StatTiles>
  )
}

/** FR-016: what goes to the AI provider, said before the first reading of a study. */
function ConsentText() {
  const { t } = useLingui()
  return (
    <AlertDialogDescription className="grid gap-2">
      <span>{t`To find the terms, the app first reads the transcripts itself. Only the unusual words it finds are sent to your AI provider, with your own connection, each with up to three short excerpts (200 characters).`}</span>
      <span>{t`The names the app knows (the people of the interviews, the schedule and your team) are replaced before sending. No transcript is sent in full.`}</span>
      <span>{t`What the AI proposes stays a proposal until a person accepts it.`}</span>
    </AlertDialogDescription>
  )
}

/** "Find terms" (US1): the count and the most it can cost, then the reading in the background. */
function FindTerms({ studyId, data }: { studyId: string; data: Enrichment }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const stop = useStopLexiconRun()

  const run = data.run
  if (run && !run.finished)
    return (
      <div className="ml-auto flex items-center gap-2" role="status">
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        <span className="text-sm">
          {run.phase === 'import'
            ? t`Reading the interviews: ${run.done + run.failed} of ${run.total}`
            : run.phase === 'candidates'
              ? t`Preparing the terms…`
              : run.phase === 'ai'
                ? run.batchesTotal > 0
                  ? t`Finding the terms: batch ${Math.min(run.batchesDone + 1, run.batchesTotal)} of ${run.batchesTotal}`
                  : t`Finding the terms…`
                : t`Counting the terms…`}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={stop.isPending}
          onClick={() =>
            void stop
              .mutateAsync({ studyId, runId: run.id })
              .then(() => refreshLexicon(queryClient, studyId))
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
        <SpellCheckIcon aria-hidden />
        {t`Find terms`}
      </Button>
      <FindTermsDialog studyId={studyId} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * Where a reading stands, interview by interview. While the transcripts are imported, one can be
 * taken out; after that their words go to the AI together, and only the whole reading stops.
 */
function ReadingProgress({ studyId, data }: { studyId: string; data: Enrichment }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const stopOne = useStopLexiconReading()
  const run = data.run
  if (!run) return null
  const importing = run.phase === 'import'
  // An imported interview stays in the reading: its words are still on their way to the lexicon.
  const stepAfterImport =
    run.phase === 'candidates'
      ? t`Preparing the terms`
      : run.phase === 'ai'
        ? t`Finding the terms`
        : run.phase === 'counting'
          ? t`Counting the terms`
          : null
  const items: ReadingItem[] = data.interviews.flatMap((i) =>
    i.reading === null
      ? []
      : [
          {
            sessionId: i.sessionId,
            title: i.title,
            step:
              i.reading === 'reading' || (i.reading === 'done' && stepAfterImport)
                ? 'working'
                : i.reading,
            label:
              i.reading === 'failed' && i.failure === 'STOPPED'
                ? t`Taken out`
                : i.reading === 'done' && stepAfterImport
                  ? stepAfterImport
                  : i18n._(READING_STATES[i.reading]),
            stoppable: importing && (i.reading === 'waiting' || i.reading === 'reading'),
          },
        ],
  )
  return (
    <ReadingList
      name={t`Reading in progress`}
      summary={
        run.phase === 'import'
          ? plural(run.total, {
              one: `${run.done + run.failed} of # interview imported`,
              other: `${run.done + run.failed} of # interviews imported`,
            })
          : [
              // Taken out or failed ones no longer count.
              plural(run.done, { one: '# interview', other: '# interviews' }),
              ...(run.phase === 'ai' && run.batchesTotal > 0
                ? [
                    t`batch ${Math.min(run.batchesDone + 1, run.batchesTotal)} of ${run.batchesTotal}`,
                  ]
                : []),
            ].join(' · ')
      }
      items={items}
      takeOutLabel={(title) => t`Take out of the reading: ${title}`}
      busy={stopOne.isPending}
      onTakeOut={(sessionId) =>
        void stopOne
          .mutateAsync({ studyId, runId: run.id, sessionId })
          .then(() => refreshLexicon(queryClient, studyId))
          .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
      }
      footer={
        importing ? null : (
          <p className="text-muted-foreground text-xs">{t`The interviews read now go to the AI together: one can no longer be taken out, only the whole reading stopped.`}</p>
        )
      }
    />
  )
}

const refreshLexicon = (queryClient: ReturnType<typeof useQueryClient>, studyId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetEnrichmentQueryKey(studyId) }),
    queryClient.invalidateQueries({ queryKey: getListLexiconQueryKey(studyId) }),
  ])

/** What a reading sends and costs, asked before it starts: the study's, or one interview's. */
function FindTermsDialog({
  studyId,
  open,
  onOpenChange,
  interview,
}: {
  studyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  interview?: { sessionId: string; title: string } | undefined
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [again, setAgain] = useState(false)
  const againId = useId()
  const estimate = useEstimateLexiconRun(
    studyId,
    interview ? { sessionId: interview.sessionId } : again ? { all: 'true' } : undefined,
    { query: { enabled: open, staleTime: 0, gcTime: 0 } },
  )
  const start = useStartLexiconRun()

  const e = estimate.data
  const cost = e?.estimatedCost === null ? t`unknown` : money(e?.estimatedCost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {interview
              ? t`Find the terms of “${interview.title}”?`
              : t`Find the terms of the interviews?`}
          </AlertDialogTitle>
          {!e ? (
            <AlertDialogDescription>{t`Counting the interviews to read…`}</AlertDialogDescription>
          ) : e.interviews === 0 ? (
            <AlertDialogDescription>
              {interview
                ? t`This interview has no transcript to read.`
                : t`Every interview is already read. Tick the box below to read them again.`}
            </AlertDialogDescription>
          ) : !e.aiConnected ? (
            <AlertDialogDescription>{t`Set up your AI provider first: it groups the spellings and explains the terms.`}</AlertDialogDescription>
          ) : (
            <>
              <AlertDialogDescription className="grid gap-2">
                <span>
                  {interview
                    ? t`This interview is read again. Decided terms stay as they are; new spellings are proposed on them.`
                    : t`${e.interviews} interviews will be read: never read, or whose transcript changed in Drive.`}
                </span>
                <span>{t`About ${cost} with your AI provider. Terms already decided by your team are not sent again.`}</span>
              </AlertDialogDescription>
              {e.consentNeeded ? <ConsentText /> : null}
            </>
          )}
        </AlertDialogHeader>
        {interview ? null : (
          <div className="flex items-start gap-2">
            <Checkbox
              id={againId}
              checked={again}
              onCheckedChange={(checked) => setAgain(checked === true)}
            />
            <Label htmlFor={againId} className="grid gap-0.5 font-normal">
              <span>{t`Also read again the interviews already read`}</span>
              <span className="text-muted-foreground text-xs">{t`Decided terms stay as they are; new spellings are proposed on them.`}</span>
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || e.interviews === 0 || !e.aiConnected || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({
                  studyId,
                  data: {
                    ...(e?.consentNeeded ? { consent: true } : {}),
                    ...(interview
                      ? { sessionIds: [interview.sessionId] }
                      : again
                        ? { all: true }
                        : {}),
                  },
                })
                .then(() => refreshLexicon(queryClient, studyId))
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            {e?.consentNeeded ? t`Agree and find terms` : t`Find terms`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Find terms" / "Find terms again" for one interview (its row). */
function FindTermsOneButton({
  studyId,
  interview,
  read,
  disabled,
  onOpen,
}: {
  studyId: string
  interview: { sessionId: string; title: string }
  read: boolean
  disabled: boolean
  /** In a table: the table's one dialog opens instead of a dialog of this button. */
  onOpen?: () => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        disabled={disabled}
        aria-label={
          read ? t`Find terms again: ${interview.title}` : t`Find terms: ${interview.title}`
        }
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
      >
        <SpellCheckIcon aria-hidden />
        {read ? t`Find terms again` : t`Find terms`}
      </Button>
      {onOpen ? null : (
        <FindTermsDialog
          studyId={studyId}
          open={open}
          onOpenChange={setOpen}
          interview={interview}
        />
      )}
    </>
  )
}

const STATE_BADGE: Record<EnrichmentInterview['state'], 'outline' | 'secondary' | 'ghost'> = {
  'no-transcript': 'ghost',
  'not-read': 'outline',
  changed: 'outline',
  'to-decide': 'outline',
  read: 'secondary',
}

/** US4: each validated interview with where it stands. */
function Interviews({
  studyId,
  data,
  onTerms,
}: {
  studyId: string
  data: Enrichment
  onTerms: (sessionId: string) => void
}) {
  const { t, i18n } = useLingui()
  const day = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' })
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
            <TableHead>{t`Read on`}</TableHead>
            <TableHead>
              <span className="sr-only">{t`Actions`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.interviews.map((i) => (
            // A row with terms to decide opens them, the whole row (its button is the keyboard way).
            <TableRow
              key={i.sessionId}
              className={i.state === 'to-decide' ? 'cursor-pointer' : undefined}
              onClick={i.state === 'to-decide' ? () => onTerms(i.sessionId) : undefined}
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
                {i.reading === 'waiting' || i.reading === 'reading' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    {i.reading === 'waiting' ? (
                      <HourglassIcon aria-hidden className="size-4" />
                    ) : (
                      <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                    )}
                    {i18n._(READING_STATES[i.reading])}
                  </span>
                ) : i.state === 'to-decide' ? (
                  <Button variant="outline" size="xs" onClick={() => onTerms(i.sessionId)}>
                    {t`Terms to decide (${i.toDecide})`}
                  </Button>
                ) : (
                  <span className="grid gap-0.5">
                    <Badge variant={STATE_BADGE[i.state]} className="w-fit">
                      {i18n._(ENRICHMENT_STATES[i.state])}
                    </Badge>
                    {i.failure ? (
                      <span className="text-muted-foreground text-xs">
                        {i18n._(LEXICON_FAILURES[i.failure])}
                      </span>
                    ) : null}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {i.readAt ? day.format(new Date(i.readAt)) : '—'}
              </TableCell>
              {/* Its button and dialog are not part of the row's click (portals bubble in React). */}
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                {i.state === 'no-transcript' ? null : (
                  <FindTermsOneButton
                    studyId={studyId}
                    interview={{ sessionId: i.sessionId, title: i.title }}
                    read={i.state !== 'not-read'}
                    disabled={reading(data)}
                    onOpen={() => openOne({ sessionId: i.sessionId, title: i.title })}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {one ? (
        <FindTermsDialog
          studyId={studyId}
          open={oneOpen}
          onOpenChange={setOneOpen}
          interview={one}
        />
      ) : null}
    </>
  )
}
