import {
  type DecideProposalsDecisionsItem,
  getGetFieldworkQueryKey,
  getGetRenamePlanQueryKey,
  type RenameResult,
  type Session,
  type SessionProposal,
  useGetRenamePlan,
  useRenameSessionFiles,
} from '@goodresearch/api-client'
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
import { CheckIcon, FileSearchIcon, PencilIcon, XIcon } from '@goodresearch/ui/components/icons'
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
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import {
  ANALYSIS_FAILURES,
  ANALYSIS_STATES,
  LANGUAGES,
  PROPOSAL_FIELDS,
  PROPOSAL_ORIGINS,
  PROPOSAL_STATUSES,
} from './labels.ts'

type Decision = DecideProposalsDecisionsItem

const keyOf = (p: SessionProposal) =>
  p.field === 'attachment' ? `attachment:${p.attachment?.fileId ?? ''}` : p.field

const decisionOf = (p: SessionProposal, action: Decision['action']): Decision => ({
  field: p.field,
  action,
  ...(p.field === 'attachment' && p.attachment ? { fileId: p.attachment.fileId } : {}),
})

/** What a proposal says, as people read it. */
function Value({ p }: { p: SessionProposal }) {
  const { i18n } = useLingui()
  if (p.people) return <span>{p.people.map((person) => person.name).join(', ')}</span>
  if (p.field === 'language' && p.text)
    return <span>{i18n._(LANGUAGES[p.text as keyof typeof LANGUAGES] ?? LANGUAGES.other)}</span>
  if (p.attachment)
    return (
      <a href={p.attachment.webLink} target="_blank" rel="noreferrer" className="underline">
        {p.attachment.name}
      </a>
    )
  return <span className="break-words">{p.text}</span>
}

/** The field typed by the person instead of the proposal (`edit`). */
function Editor({
  p,
  onSave,
  onCancel,
}: {
  p: SessionProposal
  onSave: (decision: Decision) => void
  onCancel: () => void
}) {
  const { t, i18n } = useLingui()
  const id = useId()
  const [text, setText] = useState(
    p.people ? p.people.map((person) => person.name).join(', ') : (p.text ?? ''),
  )
  const label = i18n._(PROPOSAL_FIELDS[p.field])
  const save = () => {
    if (p.people) {
      const names = text
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .slice(0, 10)
      // A person proposed under the same name keeps their link to a member.
      const people = names.map((name) => ({
        name,
        memberId: p.people?.find((o) => o.name === name)?.memberId ?? null,
      }))
      return onSave({ ...decisionOf(p, 'edit'), people })
    }
    onSave({ ...decisionOf(p, 'edit'), text: text.trim() })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.field === 'language' ? (
        <Select value={text || 'other'} onValueChange={(v) => v && setText(v)}>
          <SelectTrigger aria-label={label} className="w-44">
            <SelectValue>
              {(v: string) => i18n._(LANGUAGES[v as keyof typeof LANGUAGES] ?? LANGUAGES.other)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(['en', 'fr', 'other'] as const).map((l) => (
              <SelectItem key={l} value={l}>
                {i18n._(LANGUAGES[l])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          aria-label={label}
          className="min-w-48 flex-1"
          type={p.field === 'date' ? 'date' : 'text'}
          maxLength={p.people ? 1200 : 120}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={p.people ? `${id}-hint` : undefined}
        />
      )}
      <Button size="sm" disabled={!text.trim()} onClick={save}>
        {t`Use this`}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t`Cancel`}
      </Button>
      {p.people ? (
        <p id={`${id}-hint`} className="w-full text-muted-foreground text-xs">
          {t`Names separated by commas.`}
        </p>
      ) : null}
    </div>
  )
}

/** An icon action of a proposal: its name shows on hover and is read by screen readers. */
export function ProposalAction({
  label,
  icon,
  onClick,
  disabled,
  primary,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <Button
      size="icon-sm"
      variant={primary ? 'outline' : 'ghost'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  )
}

/**
 * One proposal as a row (spec 009): what it is about on the left, its value with where it comes
 * from and its quote in the middle, the actions (or what was decided) on the right. The planned
 * interview uses the same row.
 */
export function ProposalCard({
  label,
  value,
  status,
  pending,
  origin,
  quote,
  actions,
  editor,
  rejected,
}: {
  label: string
  value: ReactNode
  status: string
  pending: boolean
  origin: string
  quote?: string | null
  actions?: ReactNode
  /** Shown under the value while the person types another one. */
  editor?: ReactNode
  rejected?: boolean
}) {
  return (
    <li className="grid items-start gap-x-4 gap-y-1 border-t py-2.5 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
      <span className="pt-0.5 text-muted-foreground text-sm">{label}</span>
      <div className="grid min-w-0 gap-1">
        <div
          className={`break-words font-medium text-sm${rejected ? ' text-muted-foreground line-through' : ''}`}
        >
          {value}
        </div>
        <span className="text-muted-foreground text-xs">{origin}</span>
        {quote ? (
          <blockquote className="border-l-2 pl-2 text-muted-foreground text-xs italic">
            “{quote}”
          </blockquote>
        ) : null}
        {editor}
      </div>
      <div className="flex items-center gap-1 sm:justify-end">
        {actions ?? <Badge variant={pending ? 'outline' : 'secondary'}>{status}</Badge>}
      </div>
    </li>
  )
}

/** The proposals, grouped as people read an interview: who and when, then its files. */
const GROUPS = [
  {
    key: 'people',
    title: msg`People and date`,
    fields: ['interviewees', 'interviewers', 'date', 'language'],
  },
  { key: 'files', title: msg`Files`, fields: ['name', 'attachment'] },
] as const satisfies readonly {
  key: string
  title: MessageDescriptor
  fields: readonly SessionProposal['field'][]
}[]

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <h4 id={id} className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h4>
      <ul aria-labelledby={id} className="rounded-md border px-3">
        {children}
      </ul>
    </div>
  )
}

/**
 * Spec 009 FR-008: what the analysis proposes, each with where it comes from (and its quote when
 * the AI found it); the person accepts, changes or rejects each one, or accepts all.
 */
export function Proposals({
  view,
  editable,
  busy,
  onDecide,
  onAnalyze,
  onRename,
  lead,
}: {
  /** The planned interview's card, first in the list (same pattern as the proposals). */
  lead?: ReactNode
  view: Session
  editable: boolean
  busy: boolean
  onDecide: (decisions: Decision[]) => Promise<void>
  onAnalyze: () => void
  onRename: () => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const [editing, setEditing] = useState<string | null>(null)
  const a = view.analysis
  const titleId = useId()
  const open = a?.proposals.filter((p) => p.status === 'proposed') ?? []

  return (
    <section aria-labelledby={titleId} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="font-medium text-sm">
          {t`Analysis`}
        </h3>
        {a ? (
          <span className="text-muted-foreground text-xs">
            {[
              i18n._(ANALYSIS_STATES[a.state]),
              a.usedAi ? t`with the AI` : t`app's rules only`,
              view.cost === null ? t`cost unknown` : money(view.cost),
            ].join(' · ')}
          </span>
        ) : null}
        <span className="ml-auto flex gap-2">
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || a?.state === 'waiting' || a?.state === 'analyzing'}
              onClick={onAnalyze}
            >
              <FileSearchIcon aria-hidden />
              {a ? t`Analyze again` : t`Analyze`}
            </Button>
          ) : null}
          {editable && open.length > 1 ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void onDecide(
                  // The name last: it follows the people and date accepted with it.
                  [...open]
                    .sort((x, y) => +(x.field === 'name') - +(y.field === 'name'))
                    .slice(0, 10)
                    .map((p) => decisionOf(p, 'accept')),
                )
              }
            >
              <CheckIcon aria-hidden />
              {t`Accept all`}
            </Button>
          ) : null}
        </span>
      </div>
      {!a ? (
        <p className="text-muted-foreground text-sm">{t`Analyze the interview to find who took part, when, and a clear name for its files.`}</p>
      ) : null}
      {a?.failure ? (
        <p role="status" className="text-sm">
          {i18n._(ANALYSIS_FAILURES[a.failure])}
        </p>
      ) : null}
      {a?.filesChanged ? (
        <p className="text-sm">{t`The files changed in Drive since this analysis: analyze again to update the proposals.`}</p>
      ) : null}
      {lead ? <Group title={t`Planned interview`}>{lead}</Group> : null}
      {GROUPS.map((group) => {
        const fields: readonly string[] = group.fields
        const items = (a?.proposals ?? []).filter((p) => fields.includes(p.field))
        if (!items.length) return null
        return (
          <Group key={group.key} title={i18n._(group.title)}>
            {items.map((p) => {
              const key = keyOf(p)
              const label = i18n._(PROPOSAL_FIELDS[p.field])
              const open = editable && (p.status === 'proposed' || p.status === 'already-set')
              return (
                <ProposalCard
                  key={key}
                  label={label}
                  value={<Value p={p} />}
                  status={i18n._(PROPOSAL_STATUSES[p.status])}
                  pending={p.status === 'proposed'}
                  rejected={p.status === 'rejected'}
                  origin={`${i18n._(PROPOSAL_ORIGINS[p.origin])}${p.otherDate ? ` · ${t`another date found: ${p.otherDate}`}` : ''}`}
                  quote={p.quote}
                  editor={
                    editing === key ? (
                      <Editor
                        p={p}
                        onCancel={() => setEditing(null)}
                        onSave={(d) => {
                          setEditing(null)
                          void onDecide([d])
                        }}
                      />
                    ) : null
                  }
                  actions={
                    p.field === 'name' && (p.status === 'accepted' || p.status === 'edited') ? (
                      // FR-028: the files in Drive carry this name, or the rename is offered here.
                      view.fileNames?.inSync ? (
                        <Badge variant="secondary">
                          <CheckIcon aria-hidden />
                          {t`Files named in Drive`}
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={onRename}>
                          {t`Rename in Drive (${view.fileNames?.differing ?? 0})`}
                        </Button>
                      )
                    ) : open && editing !== key ? (
                      <>
                        {p.status === 'proposed' ? (
                          <ProposalAction
                            primary
                            label={t`Accept: ${label}`}
                            icon={<CheckIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => void onDecide([decisionOf(p, 'accept')])}
                          />
                        ) : null}
                        {p.field !== 'attachment' ? (
                          <ProposalAction
                            label={t`Change: ${label}`}
                            icon={<PencilIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => setEditing(key)}
                          />
                        ) : null}
                        {p.status === 'proposed' ? (
                          <ProposalAction
                            label={t`Reject: ${label}`}
                            icon={<XIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => void onDecide([decisionOf(p, 'reject')])}
                          />
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              )
            })}
          </Group>
        )
      })}
    </section>
  )
}

const RENAME_KEY = 'goodresearch.renameWithoutAsking'

/** "Don't ask me again" for renaming, kept in this browser (storage may be unavailable). */
const renameWithoutAsking = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(RENAME_KEY) === 'yes'
  } catch {
    return false
  }
}
const rememberRenameWithoutAsking = (on: boolean) => {
  try {
    if (on) globalThis.localStorage?.setItem(RENAME_KEY, 'yes')
    else globalThis.localStorage?.removeItem(RENAME_KEY)
  } catch {
    // Only the memory of the choice is lost.
  }
}

/** Goes to Google's consent for editing, then back to the Fieldwork tab (spec 007 flow). */
const askWriteConsent = (studyId: string) => {
  const back = `/studies/${studyId}?phase=fieldwork`
  window.location.assign(
    `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(back)}`,
  )
}

/**
 * US3: each file of the interview with its current and new name; nothing is renamed before the
 * person confirms, and the result is shown file by file, failed ones offered again.
 */
export function RenameDialog({
  studyId,
  session,
  onClose,
  onRenamed,
  afterAccept = false,
}: {
  studyId: string
  session: Session
  onClose: () => void
  /** The interview changed (its files' names): the window holding it reloads it. */
  onRenamed?: () => Promise<void>
  /** Opened because a name was just accepted: renames at once if the person said not to ask. */
  afterAccept?: boolean
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const plan = useGetRenamePlan(session.id)
  const rename = useRenameSessionFiles()
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [results, setResults] = useState<RenameResult['results'] | null>(null)
  const [skip, setSkip] = useState(renameWithoutAsking)
  // Without asking: the dialog shows only when something needs the person.
  const [silent, setSilent] = useState(afterAccept && renameWithoutAsking())
  const skipId = useId()
  const outcome = (o: RenameResult['results'][number]['outcome']) =>
    o === 'renamed'
      ? t`Renamed`
      : o === 'cannot-edit'
        ? t`You cannot edit this file in Drive`
        : o === 'not-found'
          ? t`The file is no longer in Drive`
          : t`Drive did not answer: try again`
  const files = plan.data?.files ?? []
  const todo = files.filter((f) => f.canEdit && f.current !== f.next)
  const selected = chosen ?? new Set(todo.map((f) => f.fileId))
  const failed = results?.filter((r) => r.outcome !== 'renamed').map((r) => r.fileId) ?? []

  const submit = async (fileIds: string[]) => {
    try {
      const done = await rename.mutateAsync({ sessionId: session.id, data: { fileIds } })
      setResults(done.results)
      if (done.results.every((r) => r.outcome === 'renamed')) {
        toast.success(t`Files renamed in Drive`)
        if (silent) onClose()
      } else setSilent(false)
      setChosen(new Set(done.results.filter((r) => r.outcome !== 'renamed').map((r) => r.fileId)))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getGetRenamePlanQueryKey(session.id) }),
      ])
      await onRenamed?.()
    } catch (failure) {
      setSilent(false)
      if (errorCode(failure) === 'DRIVE_WRITE_REQUIRED') return askWriteConsent(studyId)
      toast.error(errorMessage(i18n, failure))
    }
  }

  // Not asking: rename what can be, as soon as the plan is known.
  const started = useRef(false)
  useEffect(() => {
    if (!silent || started.current || !plan.data) return
    started.current = true
    if (!plan.data.writeAccess) return setSilent(false)
    const ids = plan.data.files.filter((f) => f.canEdit && f.current !== f.next)
    if (!ids.length) return onClose()
    void submit(ids.map((f) => f.fileId))
  })

  if (silent) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t`Rename the files in Drive`}</DialogTitle>
          <DialogDescription>{t`Only the names change: no file is moved, copied or deleted.`}</DialogDescription>
        </DialogHeader>
        {plan.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {plan.data && !plan.data.writeAccess ? (
          <p className="rounded-md border bg-highlight-soft p-2 text-highlight-soft-foreground text-sm">
            {t`Renaming needs your permission to edit files in Google Drive.`}{' '}
            <Button size="sm" variant="outline" onClick={() => askWriteConsent(studyId)}>
              {t`Allow editing in Drive`}
            </Button>
          </p>
        ) : null}
        <ul className="grid gap-2">
          {files.map((f) => {
            const result = results?.find((r) => r.fileId === f.fileId)
            return (
              <li key={f.fileId} className="flex items-start gap-2 text-sm">
                <Checkbox
                  aria-label={t`Rename ${f.current}`}
                  checked={selected.has(f.fileId)}
                  disabled={!f.canEdit || f.current === f.next}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected)
                    if (checked) next.add(f.fileId)
                    else next.delete(f.fileId)
                    setChosen(next)
                  }}
                />
                <span className="grid min-w-0">
                  <span className="break-words text-muted-foreground">{f.current}</span>
                  <span className="break-words font-medium">→ {f.next}</span>
                  {!f.canEdit ? (
                    <span className="text-xs">{t`You cannot edit this file in Drive.`}</span>
                  ) : null}
                  {result ? (
                    <span role="status" className="text-xs">
                      {outcome(result.outcome)}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="flex items-start gap-2">
          <Checkbox
            id={skipId}
            checked={skip}
            onCheckedChange={(checked) => {
              setSkip(checked === true)
              rememberRenameWithoutAsking(checked === true)
            }}
          />
          <Label htmlFor={skipId} className="grid gap-0.5 font-normal">
            <span>{t`Don't ask me again`}</span>
            <span className="text-muted-foreground text-xs">{t`When a name is accepted, its files are renamed in Drive right away.`}</span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {results && !failed.length ? t`Close` : t`Cancel`}
          </Button>
          <Button
            disabled={!selected.size || rename.isPending || plan.data?.writeAccess === false}
            onClick={() => void submit([...selected])}
          >
            {failed.length ? t`Retry ${selected.size} files` : t`Rename ${selected.size} files`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
