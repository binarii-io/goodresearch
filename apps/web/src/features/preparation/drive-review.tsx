import {
  type DriveChange,
  getGetInterviewGuideQueryKey,
  getListDriveChangesQueryKey,
  getListPlannedInterviewsQueryKey,
  getListPublicationsQueryKey,
  type Publication,
  useDecideDriveChanges,
  useListDriveChanges,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Textarea } from '@goodresearch/ui/components/textarea'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { PLANNED_STATUSES, type PlannedStatus } from './labels.ts'

const KINDS: Record<DriveChange['kind'], MessageDescriptor> = {
  changed: msg`Changed in Drive`,
  added: msg`Added in Drive`,
  removed: msg`Removed in Drive`,
  reordered: msg`Order changed in Drive`,
  conflict: msg`Changed in the app and in Drive`,
  'not-understood': msg`Not understood`,
  invalid: msg`Invalid in Drive`,
}

type Value =
  | { type: 'text'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'section'; title: string; minutes: number | null }
  | { type: 'order'; ids: string[] }
  | { type: 'question'; section: string | null; text: string; followUps: string[] }
  | { type: 'unread'; text: string }
  | {
      type: 'row'
      interviewee: string
      role: string
      interviewers: string
      scheduledAt: string | null
      status: PlannedStatus | null
      notes: string
    }

const FRAMING: Record<string, MessageDescriptor> = {
  'framing:objectives': msg`Objectives`,
  'framing:hypotheses': msg`Hypotheses`,
  'framing:audience': msg`Audience`,
  'framing:format': msg`Format`,
}

/** What the item is, in words: "Question", "Objectives", "Row: Sam"… */
function useItemLabel() {
  const { t, i18n } = useLingui()
  return (change: DriveChange): string => {
    const framing = FRAMING[change.key]
    if (framing) return i18n._(framing)
    if (change.key.startsWith('section:')) return t`Section`
    if (change.key === 'order:sections') return t`Order of the sections`
    if (change.key.startsWith('order:')) return t`Order of the questions`
    if (change.key.startsWith('question:') || change.key.startsWith('new:')) return t`Question`
    if (change.key === 'unread:structure') return t`Columns of the sheet`
    if (change.key === 'content') return t`Document text`
    if (change.key.startsWith('row:') || change.key.startsWith('new-row:'))
      return t`Planned interview`
    return t`Text`
  }
}

function ValueView({ value }: { value: unknown }) {
  const { t, i18n } = useLingui()
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' })
  const v = value as Value | null
  if (!v) return <span className="text-muted-foreground italic">{t`(none)`}</span>
  switch (v.type) {
    case 'text':
    case 'unread':
      return <span className="whitespace-pre-wrap">{v.text || t`(empty)`}</span>
    case 'list':
      return (
        <ul className="ml-4 list-disc">
          {v.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'section':
      return (
        <span>
          {v.title} {v.minutes === null ? t`(no duration)` : t`(${v.minutes} min)`}
        </span>
      )
    case 'order':
      return <span>{t`${v.ids.length} items in a new order`}</span>
    case 'question':
      return (
        <span className="grid gap-0.5">
          <span>{v.text}</span>
          {v.followUps.length ? (
            <span className="text-muted-foreground text-xs">{v.followUps.join(' · ')}</span>
          ) : null}
        </span>
      )
    case 'row':
      return (
        <span>
          {[
            v.interviewee,
            v.role,
            v.interviewers,
            v.scheduledAt ? date.format(new Date(v.scheduledAt)) : '',
            v.status ? i18n._(PLANNED_STATUSES[v.status]) : t`unknown status`,
            v.notes,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )
  }
}

type Choice = 'accept' | 'reject' | 'final'

/**
 * Review of the changes read from a published file (spec 007 US3): each change shows the app's and
 * Drive's values; the person accepts or rejects each one, or writes the final text of a conflict.
 */
export function DriveReview({
  studyId,
  publication,
  open,
  onOpenChange,
}: {
  studyId: string
  publication: Publication
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const changes = useListDriveChanges(publication.id, { query: { enabled: open } })
  const decide = useDecideDriveChanges()
  const label = useItemLabel()
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [finals, setFinals] = useState<Record<string, string>>({})
  const pending = (changes.data ?? []).filter((c) => c.decision === 'pending')
  // The best practices never come back to the app: their changes are only reported.
  const decidable = (c: DriveChange) =>
    publication.kind !== 'best-practices' && c.kind !== 'not-understood' && c.kind !== 'invalid'
  const finalOf = (c: DriveChange): unknown => {
    const text = finals[c.id] ?? ''
    const drive = c.drive as Value | null
    if (drive?.type === 'question') return { ...drive, text }
    return { type: 'text', text }
  }
  const textual = (c: DriveChange) => {
    const v = c.drive as Value | null
    return c.kind === 'conflict' && (v?.type === 'text' || v?.type === 'question')
  }

  const submit = async () => {
    const decisions = pending
      .filter((c) => decidable(c) && choices[c.id])
      .map((c) =>
        choices[c.id] === 'final'
          ? { changeId: c.id, decision: 'accept' as const, final: finalOf(c) }
          : { changeId: c.id, decision: choices[c.id] as 'accept' | 'reject' },
      )
    if (!decisions.length) return
    try {
      const result = await decide.mutateAsync({
        publicationId: publication.id,
        data: { decisions },
      })
      toast.success(t`${result.applied} applied, ${result.rejected} rejected`)
      setChoices({})
      onOpenChange(false)
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListDriveChangesQueryKey(publication.id) }),
        queryClient.invalidateQueries({ queryKey: getListPublicationsQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getGetInterviewGuideQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) }),
      ])
    }
  }

  const setAll = (choice: 'accept' | 'reject') =>
    setChoices(
      Object.fromEntries(pending.filter(decidable).map((c) => [c.id, choice])) as Record<
        string,
        Choice
      >,
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t`Close`} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t`Review the changes from Drive`}</DialogTitle>
          <DialogDescription>{t`Accepted changes are applied to the app; rejected ones are replaced in Drive at the next update.`}</DialogDescription>
        </DialogHeader>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t`No change to review.`}</p>
        ) : (
          <>
            {pending.some(decidable) ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAll('accept')}>
                  {t`Accept all`}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAll('reject')}>
                  {t`Reject all`}
                </Button>
              </div>
            ) : null}
            <ol className="grid gap-3">
              {pending.map((c) => (
                <li key={c.id} className="grid gap-2 rounded-md border p-3 text-sm">
                  <h3 className="font-semibold">
                    {label(c)} · {i18n._(KINDS[c.kind])}
                  </h3>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-0.5">
                      <dt className="text-muted-foreground text-xs">{t`In the app`}</dt>
                      <dd>
                        <ValueView value={c.app} />
                      </dd>
                    </div>
                    <div className="grid gap-0.5">
                      <dt className="text-muted-foreground text-xs">{t`In Drive`}</dt>
                      <dd>
                        <ValueView value={c.drive} />
                      </dd>
                    </div>
                  </dl>
                  {decidable(c) ? (
                    <RadioGroup
                      aria-label={t`Decision`}
                      value={choices[c.id] ?? null}
                      onValueChange={(value) => {
                        setChoices({ ...choices, [c.id]: value as Choice })
                        if (value === 'final' && finals[c.id] === undefined)
                          setFinals({
                            ...finals,
                            [c.id]: (c.drive as { text?: string })?.text ?? '',
                          })
                      }}
                      className="flex flex-wrap gap-4"
                    >
                      <Label className="flex items-center gap-2 font-normal">
                        <RadioGroupItem value="accept" />
                        {c.kind === 'conflict' ? t`Take Drive's` : t`Accept`}
                      </Label>
                      <Label className="flex items-center gap-2 font-normal">
                        <RadioGroupItem value="reject" />
                        {c.kind === 'conflict' ? t`Keep the app's` : t`Reject`}
                      </Label>
                      {textual(c) ? (
                        <Label className="flex items-center gap-2 font-normal">
                          <RadioGroupItem value="final" />
                          {t`Write the final text`}
                        </Label>
                      ) : null}
                    </RadioGroup>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {publication.kind === 'best-practices'
                        ? t`The best practices are not brought back: the next update replaces this.`
                        : t`This cannot be applied: copy it into the editor if you need it. The next update replaces it.`}
                    </p>
                  )}
                  {choices[c.id] === 'final' ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${c.id}-final`}>{t`Final text`}</Label>
                      <Textarea
                        id={`${c.id}-final`}
                        value={finals[c.id] ?? ''}
                        maxLength={4000}
                        onChange={(e) => setFinals({ ...finals, [c.id]: e.target.value })}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        )}
        <DialogFooter>
          <Button
            disabled={decide.isPending || !pending.some((c) => decidable(c) && choices[c.id])}
            onClick={() => void submit()}
          >
            {t`Apply the decisions`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
