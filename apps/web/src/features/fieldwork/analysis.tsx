import {
  deletePlannedInterview,
  type Fieldwork,
  getGetFieldworkQueryKey,
  getListPlannedInterviewsQueryKey,
  type Session,
  useAddPlannedInterview,
  useAnalyzeSession,
  useEstimateAnalysisRun,
  useLinkSession,
  useStartAnalysisRun,
  useStopAnalysisRun,
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
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { HourglassIcon, LoaderCircleIcon, SparklesIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { StopButton } from '../workspace/stop-button.tsx'
import { ANALYSIS_FAILURES, ANALYSIS_STATES } from './labels.ts'

/** Open to changes until a person decides (validated by the app included). */
export const reviewable = (s: Session) =>
  s.state === 'proposed' || (s.state === 'validated' && !s.decidedBy)

/** Waiting or analyzing: the list refreshes until it ends. */
export const analysisRunning = (data: Fieldwork | undefined) =>
  !!data &&
  (data.run !== null ||
    data.sessions.some((s) => s.analysis?.state === 'waiting' || s.analysis?.state === 'analyzing'))

/** FR-011: what goes to the AI provider, said before the first analysis of a study. */
function ConsentText() {
  const { t } = useLingui()
  return (
    <AlertDialogDescription className="grid gap-2">
      <span>{t`To find who took part and when, the beginning of each transcript (about 4,000 characters) is sent to your AI provider, with your own connection. This text may contain names of people.`}</span>
      <span>{t`The app adds neither the schedule nor the list of your team. With anonymisation on, the names it knows are replaced before sending; other names in the text stay.`}</span>
      <span>{t`What the AI proposes stays a proposal until you accept it.`}</span>
    </AlertDialogDescription>
  )
}

/** "Analyze" on one row, with the consent asked once per provider (US1). */
export function useAnalyzeOne(studyId: string) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const analyze = useAnalyzeSession()
  const [asking, setAsking] = useState<Session | null>(null)
  // The rows being analyzed now: each shows a loader until its analysis ends.
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set())
  const mark = (id: string, on: boolean) =>
    setRunning((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const go = async (s: Session, consent: boolean): Promise<Session | null> => {
    mark(s.id, true)
    try {
      const next = await analyze.mutateAsync({
        sessionId: s.id,
        data: consent ? { consent: true } : {},
      })
      await queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) })
      if (next.analysis?.failure) toast.warning(i18n._(ANALYSIS_FAILURES[next.analysis.failure]))
      else if (s.state === 'validated' && next.state === 'proposed')
        toast.info(
          t`The analysis found something new: the interview is to decide again. Its cleaning and facts are kept.`,
        )
      return next
    } catch (failure) {
      if (errorCode(failure) === 'ANALYSIS_CONSENT_REQUIRED') setAsking(s)
      else toast.error(errorMessage(i18n, failure))
      return null
    } finally {
      mark(s.id, false)
    }
  }

  const dialog = (
    <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Send the beginning of the transcript to your AI provider?`}</AlertDialogTitle>
          <ConsentText />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const s = asking
              setAsking(null)
              if (s) void go(s, true)
            }}
          >
            {t`Agree and analyze`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return {
    analyze: (s: Session) => go(s, false),
    pending: analyze.isPending,
    /** This row is being analyzed, by this person or by a run. */
    /** Where this row is: analyzing now, waiting in a run's queue, or neither. */
    stage: (s: Session): 'analyzing' | 'waiting' | null =>
      running.has(s.id) || s.analysis?.state === 'analyzing'
        ? 'analyzing'
        : s.analysis?.state === 'waiting'
          ? 'waiting'
          : null,
    dialog,
  }
}

/** Under the name of a row: the analysis state and what it cost (FR-010). */
export function AnalysisLine({ s }: { s: Session }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  if (!s.analysis) return null
  return (
    <span className="text-muted-foreground text-xs">
      {[
        s.analysis.failure === 'NOT_A_TRANSCRIPT'
          ? t`Summary, not a transcript`
          : i18n._(ANALYSIS_STATES[s.analysis.state]),
        s.analysis.filesChanged ? t`files changed since` : null,
        s.cost === null ? t`cost unknown` : money(s.cost),
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  )
}

/**
 * "Analyze interviews" (US2): a confirmation with the count and the most it can cost, then the
 * run goes on in the background; while it runs, its progress and "Stop".
 */
export function AnalyzeAll({ studyId, data }: { studyId: string; data: Fieldwork }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  // Also the interviews already analyzed: their decided proposals are kept.
  const [again, setAgain] = useState(false)
  const againId = useId()
  // Counted again at each opening: a run may have analyzed them meanwhile.
  const estimate = useEstimateAnalysisRun(studyId, again ? { all: 'true' } : undefined, {
    query: { enabled: open, staleTime: 0, gcTime: 0 },
  })
  const start = useStartAnalysisRun()
  const stop = useStopAnalysisRun()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) })

  if (data.run)
    return (
      <div className="ml-auto flex items-center gap-2" role="status">
        {data.run.done + data.run.failed === 0 ? (
          <HourglassIcon aria-hidden className="size-4" />
        ) : (
          <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        )}
        <span className="text-sm">
          {data.run.stopRequested
            ? t`Stopping…`
            : t`Analyzing: ${data.run.done + data.run.failed} of ${data.run.total}`}
        </span>
        <StopButton
          stopping={data.run.stopRequested || stop.isPending}
          onClick={() =>
            void stop
              .mutateAsync({ studyId, runId: data.run?.id ?? '' })
              .then(refresh)
              .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
          }
        />
      </div>
    )

  const e = estimate.data
  const cost = e?.estimatedCost === null ? t`unknown` : money(e?.estimatedCost ?? 0)
  return (
    <>
      <Button className="ml-auto" onClick={() => setOpen(true)}>
        <SparklesIcon aria-hidden />
        {t`Analyze interviews`}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Analyze the interviews?`}</AlertDialogTitle>
            {!e ? (
              <AlertDialogDescription>{t`Counting the interviews to analyze…`}</AlertDialogDescription>
            ) : e.count === 0 ? (
              <AlertDialogDescription>{t`Every interview is already analyzed. Tick the box below to analyze them again.`}</AlertDialogDescription>
            ) : (
              <>
                <AlertDialogDescription className="grid gap-2">
                  <span>{t`${e.count} interviews will be analyzed: never analyzed, incomplete, or whose files changed. Interviews a person decided are left as they are.`}</span>
                  {e.aiConnected ? (
                    <span>{t`At most ${cost} with your AI provider: the AI is asked only when the app's rules do not find everything.`}</span>
                  ) : (
                    <span>{t`No AI provider is set up: only the app's rules will run, at no cost.`}</span>
                  )}
                </AlertDialogDescription>
                {e.consentNeeded ? <ConsentText /> : null}
              </>
            )}
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox
              id={againId}
              checked={again}
              onCheckedChange={(checked) => setAgain(checked === true)}
            />
            <Label htmlFor={againId} className="grid gap-0.5 font-normal">
              <span>{t`Also analyze again the interviews already analyzed`}</span>
              <span className="text-muted-foreground text-xs">{t`What you accepted or rejected stays; only the proposals still to decide are replaced.`}</span>
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!e || e.count === 0 || start.isPending}
              onClick={() => {
                setOpen(false)
                void start
                  .mutateAsync({
                    studyId,
                    data: {
                      ...(e?.consentNeeded ? { consent: true } : {}),
                      ...(again ? { all: true } : {}),
                    },
                  })
                  .then(refresh)
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }}
            >
              <SparklesIcon aria-hidden />
              {e?.consentNeeded ? t`Agree and analyze` : t`Analyze`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * What an interview without a planned one would add to the schedule (spec 009 FR-017): its people
 * and date, accepted or proposed; null while nobody interviewed is known.
 */
export const scheduleEntryOf = (s: Session) => {
  const open = (s.analysis?.proposals ?? []).filter((p) => p.status !== 'rejected')
  const names = (role: 'interviewee' | 'interviewer') => {
    const accepted = s.roster.filter((r) => r.role === role).map((r) => r.name)
    if (accepted.length) return accepted
    const field = role === 'interviewee' ? 'interviewees' : 'interviewers'
    return open.find((p) => p.field === field)?.people?.map((p) => p.name) ?? []
  }
  const interviewee = names('interviewee').join(', ').slice(0, 120)
  if (!interviewee) return null
  const date = s.interviewDate ?? open.find((p) => p.field === 'date')?.text ?? null
  const fileAt = s.transcript?.modifiedAt ?? s.media[0]?.modifiedAt ?? null
  // The file's time when it is the same day, else midday of the interview date.
  const scheduledAt =
    date && fileAt?.startsWith(date) ? fileAt : date ? `${date}T12:00:00.000Z` : fileAt
  return { interviewee, interviewers: names('interviewer').join(', ').slice(0, 200), scheduledAt }
}

/** "Add to the schedule": a planned interview, done, made from the interview, then linked to it. */
export function useAddToSchedule(studyId: string) {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const add = useAddPlannedInterview()
  const link = useLinkSession()
  const run = async (s: Session): Promise<Session | null> => {
    const entry = scheduleEntryOf(s)
    if (!entry) return null
    try {
      const created = await add.mutateAsync({
        studyId,
        data: { ...entry, role: '', status: 'done', notes: '' },
      })
      try {
        return await link.mutateAsync({
          sessionId: s.id,
          data: { plannedInterviewId: created.id, version: s.version },
        })
      } catch (failure) {
        // The new row without its interview would be added again at the next try.
        await deletePlannedInterview(created.id).catch(() => undefined)
        throw failure
      }
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
      return null
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) }),
      ])
    }
  }
  return { add: run, pending: add.isPending || link.isPending }
}
