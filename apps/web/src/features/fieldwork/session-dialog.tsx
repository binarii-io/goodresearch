import {
  type Fieldwork,
  getGetFieldworkQueryKey,
  getListPlannedInterviewsQueryKey,
  type Session,
  useDecideProposals,
  useDecideSession,
  useEditSession,
  useLinkSession,
  useListPlannedInterviews,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Pill } from '@goodresearch/ui/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { PLANNED_STATUSES } from '../preparation/labels.ts'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'
import { useMe } from '../workspace/me.ts'
import { scheduleEntryOf, useAddToSchedule, useAnalyzeOne } from './analysis.tsx'
import { excludedReason, matchReason, SESSION_STATES, SUGGESTION_RULES } from './labels.ts'
import {
  acceptAllDecisions,
  ProposalAction,
  ProposalCard,
  Proposals,
  RenameDialog,
  useQuietRename,
} from './proposals.tsx'

type Person = {
  key: string
  id?: string
  name: string
  role: 'interviewer' | 'interviewee'
  /** Kept as it is unless the person ticks or unticks "This is me" (PR #8 review). */
  memberId: string | null
}

const NONE = '__none__'

const peopleOf = (s: Session): Person[] =>
  s.roster.map((r) => ({ key: r.id, id: r.id, name: r.name, role: r.role, memberId: r.memberId }))

/** One interview found in the folder: its planned interview, recordings, people and decision (US2, US3). */
export function SessionDialog({
  studyId,
  session,
  unmatchedMedia,
  onClose,
}: {
  studyId: string
  session: Session
  unmatchedMedia: Fieldwork['unmatchedMedia']
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const me = useMe()
  const queryClient = useQueryClient()
  const formatDate = useFormatDate()
  const planned = useListPlannedInterviews(studyId)
  const link = useLinkSession()
  const edit = useEditSession()
  const decide = useDecideSession()
  const quietRename = useQuietRename(studyId)
  const proposals = useDecideProposals()
  const analyzer = useAnalyzeOne(studyId)
  const schedule = useAddToSchedule(studyId)
  /** `consent`: an accepted name needs the editing consent, and renames after it. */
  const [renaming, setRenaming] = useState<false | 'asked' | 'consent'>(false)
  const [renameBusy, setRenameBusy] = useState(false)
  /** The whole of a decision, between its requests too (`Accept all` makes several). */
  const [deciding, setDeciding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [view, setView] = useState(session)
  const [title, setTitle] = useState(session.title ?? '')
  const [media, setMedia] = useState(() => session.media.map((m) => m.fileId))
  const [people, setPeople] = useState(() => peopleOf(session))
  const [reason, setReason] = useState('')
  const [excluding, setExcluding] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const ids = {
    title: useId(),
    reason: useId(),
    media: useId(),
    names: useId(),
  }
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const unnamed = people.some((p) => !p.name.trim())
  // Open to changes until a person decides: proposed, or validated by the app (spec 008).
  const proposed = view.state === 'proposed' || (view.state === 'validated' && !view.decidedBy)
  const busy =
    link.isPending ||
    edit.isPending ||
    decide.isPending ||
    proposals.isPending ||
    analyzer.pending ||
    schedule.pending ||
    renameBusy ||
    deciding

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) }),
    ])

  /** Every change answers with the session as it now is: the next one uses its version. */
  const took = async (next: Session) => {
    setView(next)
    setTitle(next.title ?? '')
    setPeople(peopleOf(next))
    setMedia(next.media.map((m) => m.fileId))
    await refresh()
    return next
  }

  /** The session as it now is (after a change made elsewhere, such as renaming its files). */
  const reload = async () => {
    const key = getGetFieldworkQueryKey(studyId)
    await queryClient.refetchQueries({ queryKey: key })
    const fresh = queryClient.getQueryData<Fieldwork>(key)?.sessions.find((s) => s.id === view.id)
    if (fresh) await took(fresh)
  }

  /** An accepted name reaches the files in Drive with no window, but for the editing consent. */
  const renameFiles = async (sessionId: string) => {
    setRenameBusy(true)
    const outcome = await quietRename(sessionId)
    if (outcome === 'consent') setRenaming('consent')
    // Only the version and the files changed: what the person is typing stays.
    const fresh = queryClient
      .getQueryData<Fieldwork>(getGetFieldworkQueryKey(studyId))
      ?.sessions.find((s) => s.id === sessionId)
    if (fresh) setView(fresh)
    setRenameBusy(false)
  }

  /** Someone changed it meanwhile: show the session as it now is, so the next action works. */
  const fail = async (failure: unknown) => {
    toast.error(errorMessage(i18n, failure))
    if (errorCode(failure) !== 'VERSION_CONFLICT') return
    const key = getGetFieldworkQueryKey(studyId)
    await queryClient.refetchQueries({ queryKey: key })
    const fresh = queryClient.getQueryData<Fieldwork>(key)?.sessions.find((s) => s.id === view.id)
    if (fresh) {
      setView(fresh)
      setTitle(fresh.title ?? '')
      setPeople(peopleOf(fresh))
      setMedia(fresh.media.map((m) => m.fileId))
    }
  }

  const linkTo = async (
    plannedInterviewId: string | null,
    options: { move?: boolean; confirm?: boolean } = {},
  ) => {
    try {
      // Edits typed before choosing the planned interview are saved first, never lost.
      const current = dirty ? await save() : view
      await took(
        await link.mutateAsync({
          sessionId: view.id,
          data: {
            plannedInterviewId,
            version: current.version,
            ...(options.move ? { move: true } : {}),
            ...(options.confirm ? { confirmSuggestion: true } : {}),
          },
        }),
      )
    } catch (failure) {
      if (errorCode(failure) === 'PLANNED_INTERVIEW_LINKED' && plannedInterviewId && !options.move)
        return setMoving(plannedInterviewId)
      await fail(failure)
    }
  }

  const dirty =
    title.trim() !== (view.title ?? '') ||
    media.join() !== view.media.map((m) => m.fileId).join() ||
    JSON.stringify(people.map(({ key: _, ...p }) => p)) !==
      JSON.stringify(peopleOf(view).map(({ key: _, ...p }) => p))
  const mediaChanged = media.join() !== view.media.map((m) => m.fileId).join()

  const save = async (): Promise<Session> =>
    took(
      await edit.mutateAsync({
        sessionId: view.id,
        data: {
          version: view.version,
          title: title.trim() || null,
          // Sent only when changed: unchanged recordings stay matched by the app.
          ...(mediaChanged ? { media } : {}),
          roster: people.map((p) => ({
            ...(p.id ? { id: p.id } : {}),
            name: p.name,
            role: p.role,
            memberId: p.role === 'interviewer' ? p.memberId : null,
          })),
        },
      }),
    )

  const run = async (decision: 'validate' | 'exclude' | 'reopen') => {
    try {
      const current = proposed && dirty ? await save() : view
      await took(
        await decide.mutateAsync({
          sessionId: view.id,
          data: {
            decision,
            version: current.version,
            ...(decision === 'exclude' && reason.trim() ? { reason: reason.trim() } : {}),
          },
        }),
      )
      setExcluding(false)
      if (decision !== 'reopen') onClose()
    } catch (failure) {
      await fail(failure)
    }
  }

  /** Spec 009: decisions on the proposals; typed edits are saved first, never lost. */
  const decideProposals = async (
    decisions: Parameters<typeof proposals.mutateAsync>[0]['data']['decisions'],
    options: { acceptAll?: boolean } = {},
  ) => {
    setDeciding(true)
    try {
      let next = dirty ? await save() : view
      // A request carries at most 10 decisions; the order is kept (the name comes last).
      for (let at = 0; at < decisions.length; at += 10) {
        next = await took(
          await proposals.mutateAsync({
            sessionId: view.id,
            data: { version: next.version, decisions: decisions.slice(at, at + 10) },
          }),
        )
      }
      // "Accept all" also settles the planned interview: a suggestion found by name, or a new row
      // (FR-017). A suggestion by date alone may be someone else: it stays for the person.
      if (options.acceptAll && !next.link) {
        if (next.suggestion && next.suggestion.rule !== 'date') {
          const plannedInterviewId = next.suggestion.plannedInterviewId
          // A failed link never stops the renaming: the proposals are already accepted.
          try {
            next = await took(
              await link.mutateAsync({
                sessionId: view.id,
                data: { plannedInterviewId, version: next.version, confirmSuggestion: true },
              }),
            )
          } catch (failure) {
            if (errorCode(failure) === 'PLANNED_INTERVIEW_LINKED') setMoving(plannedInterviewId)
            else await fail(failure)
          }
        } else if (!next.suggestion) {
          const added = await schedule.add(next)
          if (added) next = await took(added)
        }
      }
      const name = next.analysis?.proposals.find((p) => p.field === 'name')
      if (
        decisions.some((d) => d.field === 'name' && d.action !== 'reject') &&
        (name?.status === 'accepted' || name?.status === 'edited')
      )
        await renameFiles(view.id)
    } catch (failure) {
      await fail(failure)
    } finally {
      setDeciding(false)
    }
  }

  const analyzeAgain = async () => {
    try {
      if (dirty) await save()
    } catch (failure) {
      return fail(failure)
    }
    const next = await analyzer.analyze(view)
    if (next) await took(next)
  }

  /** A planned interview as the schedule shows it: person, date, interviewers, status. */
  const plannedValue = (p: {
    interviewee: string
    scheduledAt: string | null
    interviewers: string
    status: keyof typeof PLANNED_STATUSES
  }) => (
    <span>
      {[
        p.interviewee,
        p.scheduledAt ? formatDate(p.scheduledAt) : null,
        p.interviewers ? t`with ${p.interviewers}` : null,
        i18n._(PLANNED_STATUSES[p.status]),
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  )
  const entry = scheduleEntryOf(view)
  const pick = (
    <Select
      value={view.link?.plannedInterviewId ?? NONE}
      disabled={!proposed || busy}
      onValueChange={(value) => {
        setChoosing(false)
        if (value) void linkTo(value === NONE ? null : value)
      }}
    >
      <SelectTrigger aria-label={t`Planned interview`} className="w-full">
        <SelectValue>
          {(value: string) =>
            value === NONE
              ? t`No planned interview`
              : (planned.data?.find((p) => p.id === value)?.interviewee ??
                view.link?.interviewee ??
                '—')
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t`No planned interview`}</SelectItem>
        {(planned.data ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.interviewee}
            {p.scheduledAt ? ` · ${formatDate(p.scheduledAt)}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  const change = proposed ? (
    <ProposalAction
      label={t`Change the planned interview`}
      icon={<PencilIcon aria-hidden />}
      disabled={busy}
      onClick={() => setChoosing(true)}
    />
  ) : null
  const label = t`Planned interview`
  const editor = choosing ? pick : null
  // The planned interview as a proposal row, like the others (spec 009 FR-021).
  const plannedCard = view.link ? (
    <ProposalCard
      label={label}
      value={plannedValue(view.link)}
      status={t`Linked`}
      pending={false}
      origin={
        view.link.linkedBy === 'suggestion'
          ? t`suggested by the app, confirmed`
          : t`chosen by a person`
      }
      editor={editor}
      actions={
        proposed && !choosing ? (
          <>
            <Badge variant="secondary">{t`Linked`}</Badge>
            {change}
          </>
        ) : undefined
      }
    />
  ) : view.suggestion ? (
    <ProposalCard
      label={label}
      value={plannedValue(view.suggestion)}
      status={t`To decide`}
      pending
      origin={i18n._(SUGGESTION_RULES[view.suggestion.rule])}
      editor={editor}
      actions={
        proposed && !choosing ? (
          <>
            <ProposalAction
              primary
              label={t`Accept: ${label}`}
              icon={<CheckIcon aria-hidden />}
              disabled={busy}
              onClick={() =>
                void linkTo(view.suggestion?.plannedInterviewId ?? null, { confirm: true })
              }
            />
            {change}
          </>
        ) : undefined
      }
    />
  ) : (
    <ProposalCard
      label={label}
      value={
        entry ? (
          // What "Add to the schedule" creates, as the schedule shows it (FR-017).
          <div className="grid gap-1.5">
            <span>{t`Not in the schedule yet. This row will be added:`}</span>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-muted/50 px-3 py-2 font-normal text-sm">
              <dt className="text-muted-foreground">{t`Person to interview`}</dt>
              <dd>{entry.interviewee}</dd>
              <dt className="text-muted-foreground">{t`Date and time`}</dt>
              <dd>{entry.scheduledAt ? formatDate(entry.scheduledAt) : '—'}</dd>
              <dt className="text-muted-foreground">{t`Interviewer(s)`}</dt>
              <dd>{entry.interviewers || '—'}</dd>
              <dt className="text-muted-foreground">{t`Status`}</dt>
              <dd>{i18n._(PLANNED_STATUSES.done)}</dd>
            </dl>
          </div>
        ) : (
          t`No planned interview`
        )
      }
      status={entry ? t`To decide` : t`None`}
      pending={!!entry}
      origin={t`no planned interview matches`}
      editor={editor}
      actions={
        proposed && !choosing ? (
          <>
            {entry ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    const current = dirty ? await save() : view
                    const next = await schedule.add(current)
                    if (next) await took(next)
                  })().catch(fail)
                }
              >
                <PlusIcon aria-hidden />
                {t`Add to the schedule`}
              </Button>
            ) : null}
            {change}
          </>
        ) : undefined
      }
    />
  )
  const openProposals = view.analysis?.proposals.filter((p) => p.status === 'proposed').length ?? 0
  /** What waits for the person here: open proposals and the planned interview. */
  const waiting = openProposals + (!view.link && (view.suggestion || entry) ? 1 : 0)

  const available = [
    ...view.media,
    ...unmatchedMedia.filter((f) => !view.media.some((m) => m.fileId === f.fileId)),
  ]
  const name = view.title ?? view.defaultTitle

  return (
    // "Accept all" goes on for a few requests, each moving the version: closing in between would
    // let the list act with the version it read.
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent closeLabel={t`Close`} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t`Interview: ${name}`}</DialogTitle>
          <DialogDescription>
            {view.transcript ? (
              <a
                href={view.transcript.webLink}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {view.transcript.name}
              </a>
            ) : view.noTranscript ? (
              t`No transcript found: only a recording.`
            ) : (
              t`The transcript is missing in Drive.`
            )}{' '}
            · {i18n._(SESSION_STATES[view.state])}
            {view.decidedBy
              ? ` · ${t`by ${view.decidedBy.name ?? '—'}, ${formatDate(view.decidedAt)}`}`
              : view.state === 'validated'
                ? ` · ${t`by the app: its transcript was found`}`
                : null}
          </DialogDescription>
        </DialogHeader>

        {/* Two tabs: what waits for a decision, then the interview's own details (FR-020). */}
        <Tabs defaultValue="decide" className="gap-4">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger value="decide">{t`To decide (${waiting})`}</TabsTrigger>
            <TabsTrigger value="interview">{t`Interview`}</TabsTrigger>
          </TabsList>
          <TabsContent value="decide">
            <Proposals
              view={view}
              editable={proposed}
              busy={busy}
              onDecide={decideProposals}
              plannedPending={!view.link && Boolean(view.suggestion || entry)}
              onAnalyze={() => void analyzeAgain()}
              onRename={() => setRenaming('asked')}
              renaming={renameBusy}
              lead={plannedCard}
            />
          </TabsContent>
          <TabsContent value="interview" className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.title}>{t`Title`}</Label>
              <Input
                id={ids.title}
                value={title}
                maxLength={120}
                disabled={!proposed}
                placeholder={view.defaultTitle}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <fieldset className="grid gap-2" aria-describedby={ids.media}>
              <legend className="mb-1 font-medium text-sm">{t`Recordings`}</legend>
              <p id={ids.media} className="text-muted-foreground text-xs">
                {t`Recordings matched by the app, and the ones no other interview uses.`}
              </p>
              {available.length ? (
                available.map((f) => {
                  const matched = view.media.find((m) => m.fileId === f.fileId)
                  return (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control.
                    <label key={f.fileId} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={media.includes(f.fileId)}
                        disabled={!proposed}
                        onCheckedChange={(checked) =>
                          setMedia((current) =>
                            checked
                              ? [...current, f.fileId]
                              : current.filter((id) => id !== f.fileId),
                          )
                        }
                      />
                      <span>{f.name}</span>
                      {matched ? (
                        <span className="text-muted-foreground text-xs">
                          ({matchReason(i18n, matched)})
                        </span>
                      ) : null}
                    </label>
                  )
                })
              ) : (
                <p className="text-muted-foreground text-sm">{t`No recording found for this interview.`}</p>
              )}
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">{t`People of the interview`}</legend>
              {people.map((p, i) => (
                <div key={p.key} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t`Name of person ${i + 1}`}
                    className="min-w-40 flex-1"
                    value={p.name}
                    maxLength={120}
                    disabled={!proposed}
                    aria-invalid={!p.name.trim() || undefined}
                    aria-describedby={!p.name.trim() ? ids.names : undefined}
                    ref={(el) => {
                      // A person just added gets the focus on their name.
                      if (el && focusKey === p.key) {
                        el.focus()
                        setFocusKey(null)
                      }
                    }}
                    onChange={(e) =>
                      setPeople(
                        people.map((o) => (o.key === p.key ? { ...o, name: e.target.value } : o)),
                      )
                    }
                  />
                  <Select
                    value={p.role}
                    disabled={!proposed}
                    onValueChange={(value) =>
                      value &&
                      setPeople(
                        people.map((o) =>
                          o.key === p.key ? { ...o, role: value as Person['role'] } : o,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label={t`Role of person ${i + 1}`} className="w-40">
                      <SelectValue>
                        {(value: Person['role']) =>
                          value === 'interviewer' ? t`Interviewer` : t`Interviewee`
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interviewee">{t`Interviewee`}</SelectItem>
                      <SelectItem value="interviewer">{t`Interviewer`}</SelectItem>
                    </SelectContent>
                  </Select>
                  {p.role === 'interviewer' ? (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control.
                    <label className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={p.memberId === me.id}
                        disabled={!proposed}
                        onCheckedChange={(checked) =>
                          setPeople(
                            people.map((o) =>
                              o.key === p.key
                                ? { ...o, memberId: checked ? me.id : null }
                                : // One person is "me"; others' links to other members are kept.
                                  checked && o.memberId === me.id
                                  ? { ...o, memberId: null }
                                  : o,
                            ),
                          )
                        }
                      />
                      {t`This is me`}
                    </label>
                  ) : null}
                  {proposed ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Remove person ${i + 1}`}
                      onClick={() => setPeople(people.filter((o) => o.key !== p.key))}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
              {proposed && people.length < 10 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => {
                    const key = `new-${Date.now()}`
                    setFocusKey(key)
                    setPeople([...people, { key, name: '', role: 'interviewee', memberId: null }])
                  }}
                >
                  <PlusIcon aria-hidden />
                  {t`Add a person`}
                </Button>
              ) : null}
              {unnamed && proposed ? (
                <p id={ids.names} className="text-destructive text-sm">
                  {t`Every person needs a name before you save or validate.`}
                </p>
              ) : null}
            </fieldset>
          </TabsContent>
        </Tabs>

        {view.excludedReason ? (
          <p className="text-sm">{t`Excluded because: ${excludedReason(i18n, view.excludedReason)}`}</p>
        ) : null}
        {excluding ? (
          <div className="grid gap-1.5">
            <Label htmlFor={ids.reason}>{t`Why exclude it? (optional)`}</Label>
            <Textarea
              id={ids.reason}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          {proposed ? (
            <>
              <Button
                variant="outline"
                disabled={busy || !dirty || unnamed}
                onClick={() => void save().catch(fail)}
              >
                {t`Save`}
              </Button>
              {excluding ? (
                <Button variant="destructive" disabled={busy} onClick={() => void run('exclude')}>
                  {t`Exclude the interview`}
                </Button>
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => setExcluding(true)}>
                  {t`Exclude`}
                </Button>
              )}
              {/* Validating comes once the proposals are decided, not before them. */}
              {openProposals > 0 ? (
                <Button
                  disabled={busy || unnamed}
                  onClick={() =>
                    void decideProposals(acceptAllDecisions(view), { acceptAll: true })
                  }
                >
                  <CheckIcon aria-hidden />
                  {t`Accept all`}
                </Button>
              ) : (
                <Button disabled={busy || unnamed} onClick={() => void run('validate')}>
                  {t`Validate`}
                </Button>
              )}
            </>
          ) : (
            <>
              <Pill>{i18n._(SESSION_STATES[view.state])}</Pill>
              <Button variant="outline" disabled={busy} onClick={() => void run('reopen')}>
                {t`Back to review`}
              </Button>
            </>
          )}
        </DialogFooter>

        {analyzer.dialog}
        {renaming ? (
          <RenameDialog
            studyId={studyId}
            session={view}
            resumeAfterConsent={renaming === 'consent'}
            onClose={() => setRenaming(false)}
            onRenamed={reload}
            onBusy={setRenameBusy}
          />
        ) : null}

        <AlertDialog open={moving !== null} onOpenChange={(open) => !open && setMoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Move the link here?`}</AlertDialogTitle>
              <AlertDialogDescription>{t`This planned interview is linked to another interview. Moving it removes that link.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = moving
                  setMoving(null)
                  if (target) void linkTo(target, { move: true })
                }}
              >
                {t`Move the link`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
