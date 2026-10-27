import {
  type Cleaning,
  type CleaningInterview,
  getGetCleaningQueryKey,
  getGetEnrichmentQueryKey,
  useEstimateCleaningRun,
  useStartCleaningRun,
  useStopCleaningRun,
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
  FolderOpenIcon,
  HourglassIcon,
  LoaderCircleIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { CLEANING_FAILURES, CLEANING_STATES } from './labels.ts'

/** A cleaning is going on: the view follows its progress. */
export const cleaning = (data: Cleaning | undefined) => !!data?.run && !data.run.finished

const STATE_BADGE: Record<CleaningInterview['state'], 'outline' | 'secondary' | 'ghost'> = {
  'no-transcript': 'ghost',
  'not-cleaned': 'outline',
  'to-redo': 'outline',
  'to-decide': 'outline',
  'lexicon-changed': 'outline',
  clean: 'secondary',
  published: 'secondary',
  'out-of-date': 'outline',
}

/** Spec 011 US1, US5: each validated interview with where its cleaning stands. */
export function CleaningTable({
  studyId,
  data,
  onOpen,
}: {
  studyId: string
  data: Cleaning
  onOpen: (sessionId: string) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const day = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' })
  const running = data.run && !data.run.finished ? data.run : null
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {t`${data.counts.clean} clean of ${data.interviews.length}`} ·{' '}
          {data.cost === null
            ? t`Cost of the cleanings: unknown`
            : t`Cost of the cleanings: ${money(data.cost)}`}
          {data.lastRunCost !== null ? ` · ${t`last: ${money(data.lastRunCost)}`}` : ''}
        </p>
        <CleanTranscripts studyId={studyId} data={data} />
      </div>
      {data.run?.finished && data.run.failure ? (
        <p className="flex items-center gap-2 text-sm" role="status">
          <TriangleAlertIcon aria-hidden className="size-4 text-highlight-soft-foreground" />
          {i18n._(CLEANING_FAILURES[data.run.failure])}
        </p>
      ) : null}
      {data.run?.finished && data.run.leftOut > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t`${data.run.leftOut} AI corrections were left out by the app's checks (not found in the turn, too long, or on a name).`}
        </p>
      ) : null}
      {data.folder ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <FolderOpenIcon aria-hidden className="size-4" />
          {t`Published clean transcripts go to the folder “${data.folder.name}” of the study folder.`}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t`Interview`}</TableHead>
            <TableHead>{t`State`}</TableHead>
            <TableHead>{t`Accepted corrections`}</TableHead>
            <TableHead>{t`Cleaned on`}</TableHead>
            <TableHead>{t`Cost`}</TableHead>
            <TableHead>
              <span className="sr-only">{t`Actions`}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.interviews.map((i) => {
            const progress = running ? i : null
            // The whole row opens the review when there is one (the state button is the keyboard way).
            const openable =
              i.state !== 'no-transcript' && (i.state !== 'not-cleaned' || !!progress)
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
                    {i.state === 'no-transcript' ? (
                      <Badge variant="ghost" className="w-fit">
                        {i18n._(CLEANING_STATES[i.state])}
                      </Badge>
                    ) : i.state === 'not-cleaned' && !progress ? (
                      <Badge variant="outline" className="w-fit">
                        {i18n._(CLEANING_STATES[i.state])}
                      </Badge>
                    ) : (
                      <Button
                        variant={STATE_BADGE[i.state] === 'secondary' ? 'ghost' : 'outline'}
                        size="xs"
                        className="w-fit"
                        onClick={() => onOpen(i.sessionId)}
                      >
                        {i.state === 'to-decide'
                          ? i.toDecide > 0
                            ? t`Corrections to decide (${i.toDecide})`
                            : t`Clean version to validate`
                          : i18n._(CLEANING_STATES[i.state])}
                      </Button>
                    )}
                    {i.failure ? (
                      <span className="text-muted-foreground text-xs">
                        {i18n._(CLEANING_FAILURES[i.failure])}
                      </span>
                    ) : null}
                    {i.published ? (
                      <a
                        onClick={(e) => e.stopPropagation()}
                        href={i.published.webLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        {t`Open in Drive (version ${i.published.versionNumber})`}
                      </a>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{i.accepted}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {i.cleanedAt ? day.format(new Date(i.cleanedAt)) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {i.cost === null ? t`unknown` : i.cleanedAt ? money(i.cost) : '—'}
                </TableCell>
                {/* Its button and dialog are not part of the row's click (portals bubble in React). */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {i.state === 'no-transcript' ? null : (
                    <CleanOneButton
                      studyId={studyId}
                      interview={{ sessionId: i.sessionId, title: i.title }}
                      cleaned={i.state !== 'not-cleaned'}
                      disabled={!!running}
                    />
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** FR-017: what goes to the AI provider, said before the first cleaning of a study. */
function ConsentText() {
  const { t } = useLingui()
  return (
    <AlertDialogDescription className="grid gap-2">
      <span>{t`To clean with the AI, the full text of each transcript is sent to your AI provider, with your own connection, in parts of about 60 turns.`}</span>
      <span>{t`The names the app knows (the people of the interviews, the schedule and your team) are replaced before sending.`}</span>
      <span>{t`Every correction the AI proposes waits for a person's decision.`}</span>
    </AlertDialogDescription>
  )
}

/** "Clean transcripts" (US1): the run's progress, or the button that opens the dialog. */
function CleanTranscripts({ studyId, data }: { studyId: string; data: Cleaning }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const stop = useStopCleaningRun()
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetCleaningQueryKey(studyId) })

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
          {run.mode === 'ai' && run.chunks > 0
            ? t`Cleaning: part ${run.chunksDone} of ${run.chunks}, ${run.done + run.failed} of ${run.total} interviews`
            : t`Cleaning: ${run.done + run.failed} of ${run.total} interviews`}
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
          <SquareIcon aria-hidden />
          {t`Stop`}
        </Button>
      </div>
    )

  return (
    <>
      <Button className="ml-auto" onClick={() => setOpen(true)}>
        <SparklesIcon aria-hidden />
        {t`Clean transcripts`}
      </Button>
      <CleanDialog studyId={studyId} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * The cleaning dialog: the mode, the estimate and the consent, then the run. With `interview`,
 * that interview alone is cleaned again in full, like "Analyze again" in Fieldwork.
 */
export function CleanDialog({
  studyId,
  open,
  onOpenChange,
  interview,
  onStarted,
}: {
  studyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  interview?: { sessionId: string; title: string } | undefined
  onStarted?: () => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'ai' | 'lexicon'>('ai')
  const [again, setAgain] = useState(false)
  const ids = { again: useId(), ai: useId(), lexicon: useId() }
  const estimate = useEstimateCleaningRun(
    studyId,
    {
      mode,
      ...(interview ? { sessionId: interview.sessionId } : again ? { all: 'true' as const } : {}),
    },
    { query: { enabled: open, staleTime: 0, gcTime: 0 } },
  )
  const start = useStartCleaningRun()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetCleaningQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getGetEnrichmentQueryKey(studyId) }),
    ])

  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  const needsAi = mode === 'ai'
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {interview ? t`Clean “${interview.title}”?` : t`Clean the transcripts?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {interview
              ? t`This interview is cleaned again in full. Decisions already made stay as they are.`
              : t`The app first applies the lexicon itself, at no cost. The AI then reads each transcript in full and proposes corrections: you decide each one.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as 'ai' | 'lexicon')}
          aria-label={t`How to clean`}
          className="grid gap-2"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem id={ids.ai} value="ai" />
            <Label htmlFor={ids.ai} className="grid gap-0.5 font-normal">
              <span>{t`With the lexicon and the AI`}</span>
              <span className="text-muted-foreground text-xs">{t`Also finds misheard words the lexicon does not know, and wrong speakers.`}</span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem id={ids.lexicon} value="lexicon" />
            <Label htmlFor={ids.lexicon} className="grid gap-0.5 font-normal">
              <span>{t`Lexicon only`}</span>
              <span className="text-muted-foreground text-xs">{t`Nothing is sent, no cost.`}</span>
            </Label>
          </div>
        </RadioGroup>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {!e ? (
            <p>{t`Counting the interviews to clean…`}</p>
          ) : e.interviews === 0 ? (
            <p>
              {interview
                ? t`This interview has no transcript to clean.`
                : t`Every interview is already cleaned. Tick the box below to clean them again.`}
            </p>
          ) : needsAi && !e.aiConnected ? (
            <p>{t`Set up your AI provider first, or choose "Lexicon only".`}</p>
          ) : needsAi ? (
            <p>{t`${e.interviews} interviews, about ${e.chunks} parts for the AI: about ${cost} with your AI provider.`}</p>
          ) : (
            <p>{t`${e.interviews} interviews, no cost.`}</p>
          )}
        </div>
        {needsAi && e?.consentNeeded ? <ConsentText /> : null}
        {interview ? null : (
          <div className="flex items-start gap-2">
            <Checkbox
              id={ids.again}
              checked={again}
              onCheckedChange={(checked) => setAgain(checked === true)}
            />
            <Label htmlFor={ids.again} className="grid gap-0.5 font-normal">
              <span>{t`Also clean again the interviews already cleaned`}</span>
              <span className="text-muted-foreground text-xs">{t`Decisions already made stay as they are.`}</span>
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || e.interviews === 0 || (needsAi && !e.aiConnected) || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({
                  studyId,
                  data: {
                    mode,
                    all: again,
                    consent: needsAi && !!e?.consentNeeded,
                    ...(interview ? { sessionIds: [interview.sessionId] } : {}),
                  },
                })
                .then(() => {
                  onStarted?.()
                  return refresh()
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            {needsAi && e?.consentNeeded ? t`Agree and clean` : t`Clean`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Clean" / "Clean again" for one interview (its row, its review). */
export function CleanOneButton({
  studyId,
  interview,
  cleaned,
  disabled,
  onStarted,
}: {
  studyId: string
  interview: { sessionId: string; title: string }
  cleaned: boolean
  disabled?: boolean
  onStarted?: () => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        disabled={disabled}
        aria-label={cleaned ? t`Clean again: ${interview.title}` : t`Clean: ${interview.title}`}
        onClick={() => setOpen(true)}
      >
        <SparklesIcon aria-hidden />
        {cleaned ? t`Clean again` : t`Clean`}
      </Button>
      <CleanDialog
        studyId={studyId}
        open={open}
        onOpenChange={setOpen}
        interview={interview}
        {...(onStarted ? { onStarted } : {})}
      />
    </>
  )
}
