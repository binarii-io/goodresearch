import {
  type Fieldwork,
  getGetFieldworkQueryKey,
  getListPlannedInterviewsQueryKey,
  type Session,
  useDecideSession,
  useEditSession,
  useLinkSession,
  useListPlannedInterviews,
  useUpdatePlannedInterview,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { PlusIcon, Trash2Icon } from '@goodresearch/ui/components/icons'
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
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'
import { useMe } from '../workspace/me.ts'
import { matchReason, SESSION_STATES, SUGGESTION_RULES } from './labels.ts'

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
  const markDone = useUpdatePlannedInterview()
  const [view, setView] = useState(session)
  const [title, setTitle] = useState(session.title ?? '')
  const [media, setMedia] = useState(() => session.media.map((m) => m.fileId))
  const [people, setPeople] = useState(() => peopleOf(session))
  const [reason, setReason] = useState('')
  const [excluding, setExcluding] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [offerDone, setOfferDone] = useState(false)
  const ids = {
    title: useId(),
    planned: useId(),
    reason: useId(),
    media: useId(),
    names: useId(),
  }
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const unnamed = people.some((p) => !p.name.trim())
  // Open to changes until a person decides: proposed, or validated by the app (spec 008).
  const proposed = view.state === 'proposed' || (view.state === 'validated' && !view.decidedBy)
  const busy = link.isPending || edit.isPending || decide.isPending

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) }),
    ])

  /** Every change answers with the session as it now is: the next one uses its version. */
  const took = async (next: Session) => {
    setView(next)
    setPeople(peopleOf(next))
    setMedia(next.media.map((m) => m.fileId))
    await refresh()
    return next
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
      const next = await took(
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
      // FR-009: the planned interview can be marked done in one action.
      if (decision === 'validate' && next.link && next.link.status !== 'done') setOfferDone(true)
      else if (decision !== 'reopen') onClose()
    } catch (failure) {
      await fail(failure)
    }
  }

  const markPlannedDone = async () => {
    const row = planned.data?.find((p) => p.id === view.link?.plannedInterviewId)
    if (!row) return onClose()
    try {
      await markDone.mutateAsync({
        plannedInterviewId: row.id,
        data: {
          interviewee: row.interviewee,
          role: row.role,
          interviewers: row.interviewers,
          scheduledAt: row.scheduledAt,
          status: 'done',
          notes: row.notes,
          version: row.version,
        },
      })
      toast.success(t`Marked done in the schedule`)
      await refresh()
    } catch (failure) {
      await fail(failure)
    }
    onClose()
  }

  const available = [
    ...view.media,
    ...unmatchedMedia.filter((f) => !view.media.some((m) => m.fileId === f.fileId)),
  ]
  const name = view.title ?? view.defaultTitle

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t`Close`} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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

        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <Label id={ids.planned}>{t`Planned interview`}</Label>
            {proposed && view.suggestion && !view.link ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-highlight-soft p-2 text-highlight-soft-foreground text-sm">
                <span>
                  {t`Suggested: ${view.suggestion.interviewee} (${i18n._(SUGGESTION_RULES[view.suggestion.rule])})`}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void linkTo(view.suggestion?.plannedInterviewId ?? null, { confirm: true })
                  }
                >
                  {t`Confirm`}
                </Button>
              </div>
            ) : null}
            <Select
              value={view.link?.plannedInterviewId ?? NONE}
              disabled={!proposed || busy}
              onValueChange={(value) => value && void linkTo(value === NONE ? null : value)}
            >
              <SelectTrigger aria-labelledby={ids.planned} className="w-full">
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
          </div>

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

          {view.excludedReason ? (
            <p className="text-sm">{t`Excluded because: ${view.excludedReason}`}</p>
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
        </div>

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
              <Button disabled={busy || unnamed} onClick={() => void run('validate')}>
                {t`Validate`}
              </Button>
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

        <AlertDialog open={offerDone} onOpenChange={(open) => !open && onClose()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Mark the planned interview done?`}</AlertDialogTitle>
              <AlertDialogDescription>{t`The interview with ${view.link?.interviewee ?? ''} is validated. Its row in the schedule can be marked done.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t`Not now`}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void markPlannedDone()}>
                {t`Mark done`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
