import {
  type CleaningTurn,
  type Correction,
  type GetInterviewCleaningParams,
  getGetCleaningQueryKey,
  getGetInterviewCleaningQueryKey,
  useAddCorrection,
  useDecideCorrection,
  useDecideCorrections,
  useGetInterviewCleaning,
  usePublishClean,
  useValidateClean,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import {
  ArrowRightIcon,
  CheckIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Undo2Icon,
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
import { Switch } from '@goodresearch/ui/components/switch'
import type { MessageDescriptor } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { CleanOneButton } from './cleaning-table.tsx'
import {
  CLEANING_STATES,
  CONFIDENCES,
  CORRECTION_KINDS,
  CORRECTION_SOURCES,
  CORRECTION_STATUSES,
} from './labels.ts'

const ALL = '__all__'

/** Goes to Google's consent for editing, then back to the Enrichment tab (spec 007 flow). */
const askWriteConsent = (studyId: string) => {
  const back = `/studies/${studyId}?phase=enrichment`
  window.location.assign(
    `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(back)}`,
  )
}
type Status = NonNullable<GetInterviewCleaningParams['status']>

const time = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')

/** A filter of the review, its label above it. */
function Filter({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Record<string, MessageDescriptor>
  all: string
}) {
  const { i18n } = useLingui()
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </label>
      <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue>
            {(v: string) => (v === ALL ? all : options[v] ? i18n._(options[v]) : v)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {Object.entries(options).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {i18n._(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** The text of a turn with its corrections in place: the original struck, the replacement after. */
function TurnText({ turn }: { turn: CleaningTurn }) {
  const { t } = useLingui()
  const inline = turn.corrections
    .filter((c) => c.target === 'text' && !c.overridden && c.status !== 'rejected')
    .sort((a, b) => a.offset - b.offset)
  const parts: React.ReactNode[] = []
  let at = 0
  for (const c of inline) {
    if (c.offset < at) continue
    parts.push(turn.text.slice(at, c.offset))
    parts.push(
      <span key={c.key} className="rounded-sm bg-highlight-soft px-0.5">
        <del className="text-muted-foreground">
          <span className="sr-only">{t`was:`} </span>
          {c.original}
        </del>{' '}
        <ins className="font-medium no-underline">
          <span className="sr-only">{t`now:`} </span>
          {c.replacement}
        </ins>
      </span>,
    )
    at = c.offset + c.length
  }
  parts.push(turn.text.slice(at))
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{parts}</p>
}

/** One correction with its source, reason and the decisions (US2, FR-021: never colour alone). */
function CorrectionRow({
  correction: c,
  busy,
  onDecide,
  onEdit,
}: {
  correction: Correction
  busy: boolean
  onDecide: (c: Correction, decision: 'accept' | 'reject' | 'reopen') => void
  onEdit: (c: Correction) => void
}) {
  const { t, i18n } = useLingui()
  const decided = c.status !== 'proposed'
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {c.target === 'speaker' ? (
          <span className="text-muted-foreground">{t`Speaker:`}</span>
        ) : null}
        <del className="text-muted-foreground">{c.original}</del>
        <ArrowRightIcon aria-hidden className="size-3.5" />
        <span className="font-medium">{c.replacement}</span>
        <Badge variant="outline">{i18n._(CORRECTION_SOURCES[c.source])}</Badge>
        <Badge variant="ghost">{i18n._(CORRECTION_KINDS[c.kind])}</Badge>
        {c.confidence ? (
          <span className="text-muted-foreground text-xs">{i18n._(CONFIDENCES[c.confidence])}</span>
        ) : null}
        <Badge variant={decided ? 'secondary' : 'outline'}>
          {i18n._(CORRECTION_STATUSES[c.status])}
        </Badge>
        {c.overridden ? (
          <span className="text-muted-foreground text-xs">{t`Hidden by another correction here`}</span>
        ) : null}
        {c.reason ? <span className="w-full text-muted-foreground text-xs">{c.reason}</span> : null}
      </span>
      <span className="flex items-center gap-1">
        {decided ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t`Take back the decision on “${c.original}”`}
            title={t`Take back`}
            disabled={busy}
            onClick={() => onDecide(c, 'reopen')}
          >
            <Undo2Icon />
          </Button>
        ) : null}
        {c.status !== 'accepted' ? (
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t`Accept “${c.original}” → “${c.replacement}”`}
            title={t`Accept`}
            disabled={busy}
            onClick={() => onDecide(c, 'accept')}
          >
            <CheckIcon />
          </Button>
        ) : null}
        {c.status !== 'rejected' ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t`Reject “${c.original}” → “${c.replacement}”`}
            title={t`Reject`}
            disabled={busy}
            onClick={() => onDecide(c, 'reject')}
          >
            <XIcon />
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t`Details of “${c.original}”`}
          title={t`Details`}
          onClick={() => onEdit(c)}
        >
          <PencilIcon />
        </Button>
      </span>
    </li>
  )
}

/** Spec 011 US2–US4: the review of one interview's corrections, its validation and publishing. */
export function InterviewCleaningView({
  studyId,
  sessionId,
  onBack,
}: {
  studyId: string
  sessionId: string
  onBack: () => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>('to-decide')
  const [source, setSource] = useState<string>(ALL)
  const [kind, setKind] = useState<string>(ALL)
  const [confidence, setConfidence] = useState<string>(ALL)
  const [onlyCorrected, setOnlyCorrected] = useState(true)
  const [editing, setEditing] = useState<Correction | null>(null)
  const [adding, setAdding] = useState<CleaningTurn | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const onlyId = useId()
  const params: GetInterviewCleaningParams = {
    ...(status !== ALL ? { status: status as Status } : { status: 'all' }),
    ...(source !== ALL ? { source: source as Correction['source'] } : {}),
    ...(kind !== ALL ? { kind: kind as Correction['kind'] } : {}),
    ...(confidence !== ALL
      ? { confidence: confidence as NonNullable<Correction['confidence']> }
      : {}),
    onlyCorrected: onlyCorrected ? 'true' : 'false',
  }
  const view = useGetInterviewCleaning(studyId, sessionId, params)
  const decide = useDecideCorrection()
  const decideAll = useDecideCorrections()
  const validate = useValidateClean()
  const publish = usePublishClean()
  const add = useAddCorrection()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getGetInterviewCleaningQueryKey(studyId, sessionId),
      }),
      queryClient.invalidateQueries({ queryKey: getGetCleaningQueryKey(studyId) }),
    ])
  const fail = (failure: unknown) => toast.error(errorMessage(i18n, failure))
  const busy = decide.isPending || decideAll.isPending

  const act = (c: Correction, decision: 'accept' | 'reject' | 'reopen') =>
    void decide
      .mutateAsync({
        studyId,
        sessionId,
        key: c.key,
        data: { decision, ...(c.version !== null ? { version: c.version } : {}) },
      })
      .then(refresh)
      .catch(fail)

  const data = view.data
  if (!data) return <Skeleton className="h-60 w-full" />
  const shown = data.turns
    .flatMap((x) => x.corrections)
    .filter((c) => c.status === 'proposed' && !c.overridden)
  const latest = data.versions[0]

  const doPublish = (force: boolean) =>
    void publish
      .mutateAsync({
        studyId,
        sessionId,
        data: { overwrite: force, language: i18n.locale.startsWith('fr') ? 'fr' : 'en' },
      })
      .then((r) => {
        toast.success(t`Published in Drive (version ${r.versionNumber}).`)
        return refresh()
      })
      .catch((failure: unknown) => {
        if (errorCode(failure) === 'DRIVE_CHANGED') setOverwrite(true)
        else if (errorCode(failure) === 'DRIVE_WRITE_REQUIRED') askWriteConsent(studyId)
        else fail(failure)
      })

  return (
    <div className="grid gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">{i18n._(CLEANING_STATES[data.state])}</Badge>
        <span className="text-muted-foreground text-sm">
          {data.cost === null ? t`Cost: unknown` : t`Cost: ${money(data.cost)}`}
        </span>
        {data.anonymised ? (
          <Badge variant="ghost">{t`Anonymised: names become pseudonyms`}</Badge>
        ) : null}
        <span className="ml-auto">
          <CleanOneButton
            studyId={studyId}
            interview={{ sessionId, title: data.title }}
            cleaned={data.state !== 'not-cleaned'}
            onStarted={onBack}
          />
        </span>
      </div>
      {data.counts.toDecide === 0 && data.versions.length === 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-highlight bg-highlight-soft px-4 py-3"
          role="status"
        >
          <CheckIcon aria-hidden className="size-4" />
          <p className="text-sm">{t`Every correction is decided. One step left: validate the clean version, the one Analysis will read.`}</p>
          <Button
            className="ml-auto"
            disabled={validate.isPending}
            onClick={() =>
              void validate
                .mutateAsync({ studyId, sessionId, data: { fingerprint: data.fingerprint } })
                .then((r) => {
                  toast.success(t`Clean version ${r.number} validated.`)
                  return refresh()
                })
                .catch(fail)
            }
          >
            {t`Validate the clean version`}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Filter
          label={t`Status`}
          value={status}
          onChange={setStatus}
          options={{
            'to-decide': CORRECTION_STATUSES.proposed,
            accepted: CORRECTION_STATUSES.accepted,
            rejected: CORRECTION_STATUSES.rejected,
          }}
          all={t`All`}
        />
        <Filter
          label={t`Source`}
          value={source}
          onChange={setSource}
          options={CORRECTION_SOURCES}
          all={t`All sources`}
        />
        <Filter
          label={t`Kind`}
          value={kind}
          onChange={setKind}
          options={CORRECTION_KINDS}
          all={t`All kinds`}
        />
        <Filter
          label={t`Confidence`}
          value={confidence}
          onChange={setConfidence}
          options={CONFIDENCES}
          all={t`Any confidence`}
        />
        <div className="flex items-center gap-2 pb-2">
          <Switch id={onlyId} checked={onlyCorrected} onCheckedChange={setOnlyCorrected} />
          <Label htmlFor={onlyId} className="font-normal">{t`Only turns with corrections`}</Label>
        </div>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={shown.length === 0 || busy}
          onClick={() =>
            void decideAll
              .mutateAsync({
                studyId,
                sessionId,
                data: { decision: 'accept', keys: shown.slice(0, 500).map((c) => c.key) },
              })
              .then(refresh)
              .catch(fail)
          }
        >
          <CheckIcon aria-hidden />
          {t`Accept all shown (${shown.length})`}
        </Button>
      </div>
      {data.turns.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t`No correction matches these filters.`}</p>
      ) : (
        <ol className="grid gap-3" aria-label={t`Turns of the transcript`}>
          {data.turns.map((turn) => (
            <li key={turn.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {turn.start !== null ? <span>[{time(turn.start)}]</span> : null}
                <span className="font-medium text-foreground">{turn.speaker ?? t`No speaker`}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                  onClick={() => setAdding(turn)}
                >
                  <PlusIcon aria-hidden />
                  {t`Add a correction`}
                </Button>
              </div>
              <TurnText turn={turn} />
              {turn.corrections.length ? (
                <ul className="grid gap-1.5" aria-label={t`Corrections of this turn`}>
                  {turn.corrections.map((c) => (
                    <CorrectionRow
                      key={c.key}
                      correction={c}
                      busy={busy}
                      onDecide={act}
                      onEdit={setEditing}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <p className="text-sm" role="status">
            {t`${data.counts.toDecide} to decide · ${data.counts.accepted} accepted · ${data.counts.rejected} rejected`}
            {latest ? ` · ${t`clean version ${latest.number}`}` : ''}
          </p>
          {data.published ? (
            <a
              href={data.published.webLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm underline"
            >
              <FolderOpenIcon aria-hidden className="size-4" />
              {t`Open in Drive`}
            </a>
          ) : null}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {data.counts.toDecide > 0 ? (
              <span className="text-muted-foreground text-xs">{t`Decide every correction to validate.`}</span>
            ) : null}
            <Button
              disabled={
                data.counts.toDecide > 0 ||
                validate.isPending ||
                data.state === 'clean' ||
                data.state === 'published' ||
                data.state === 'out-of-date'
              }
              onClick={() =>
                void validate
                  .mutateAsync({ studyId, sessionId, data: { fingerprint: data.fingerprint } })
                  .then((r) => {
                    toast.success(t`Clean version ${r.number} validated.`)
                    return refresh()
                  })
                  .catch(fail)
              }
            >
              {validate.isPending ? (
                <LoaderCircleIcon aria-hidden className="animate-spin" />
              ) : (
                <CheckIcon aria-hidden />
              )}
              {t`Validate the clean version`}
            </Button>
            <Button
              variant="outline"
              disabled={!latest || publish.isPending || data.state === 'published'}
              onClick={() => doPublish(false)}
            >
              {publish.isPending ? (
                <LoaderCircleIcon aria-hidden className="animate-spin" />
              ) : (
                <FolderOpenIcon aria-hidden />
              )}
              {publish.isPending
                ? t`Publishing…`
                : data.published
                  ? t`Update in Drive`
                  : t`Publish to Drive`}
            </Button>
          </span>
        </div>
      </div>
      {editing ? (
        <CorrectionDialog
          correction={editing}
          onClose={() => setEditing(null)}
          onSave={(replacement) =>
            decide
              .mutateAsync({
                studyId,
                sessionId,
                key: editing.key,
                data: {
                  decision: 'edit',
                  replacement,
                  ...(editing.version !== null ? { version: editing.version } : {}),
                },
              })
              .then(() => {
                setEditing(null)
                return refresh()
              })
              .catch(fail)
          }
        />
      ) : null}
      {adding ? (
        <AddDialog
          turn={adding}
          onClose={() => setAdding(null)}
          speakers={data.speakers}
          onAdd={(input) =>
            add
              .mutateAsync({ studyId, sessionId, data: input })
              .then(() => {
                setAdding(null)
                return refresh()
              })
              .catch(fail)
          }
        />
      ) : null}
      <AlertDialog open={overwrite} onOpenChange={setOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Changed in Drive`}</AlertDialogTitle>
            <AlertDialogDescription>{t`Someone changed this document in Drive since it was published. Updating it replaces those changes with the clean version; the app does not bring them back.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOverwrite(false)
                doPublish(true)
              }}
            >
              {t`Replace it`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** A correction's details: its reason, and its replacement to edit (not for the lexicon's). */
function CorrectionDialog({
  correction: c,
  onClose,
  onSave,
}: {
  correction: Correction
  onClose: () => void
  onSave: (replacement: string) => Promise<unknown>
}) {
  const { t, i18n } = useLingui()
  const [value, setValue] = useState(c.replacement)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const fromLexicon = c.source === 'lexicon' || c.source === 'ai-lexicon'
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`Correction`}</DialogTitle>
          <DialogDescription>
            {i18n._(CORRECTION_SOURCES[c.source])} · {i18n._(CORRECTION_KINDS[c.kind])}
            {c.decidedBy?.name ? ` · ${t`decided by ${c.decidedBy.name}`}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <p>
            <span className="text-muted-foreground">{t`Written:`}</span> {c.original}
          </p>
          {c.reason ? <p className="text-muted-foreground">{c.reason}</p> : null}
          {fromLexicon ? (
            <p>
              {t`It reads “${c.replacement}”, from the term “${c.term?.form ?? c.replacement}” of the lexicon. Accept or reject it here; to change its form, edit the term in the lexicon.`}
            </p>
          ) : (
            <div className="grid gap-1">
              <Label htmlFor={id}>{t`It should read`}</Label>
              <Input
                id={id}
                value={value}
                maxLength={200}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t`Close`}
          </Button>
          {fromLexicon ? null : (
            <Button
              disabled={!value.trim() || value.trim() === c.replacement || saving}
              onClick={() => {
                setSaving(true)
                void onSave(value.trim()).finally(() => setSaving(false))
              }}
            >
              {t`Save the edit`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Add a correction" (FR-009): the words to change in this turn, or its speaker. */
function AddDialog({
  turn,
  speakers,
  onClose,
  onAdd,
}: {
  turn: CleaningTurn
  speakers: readonly string[]
  onClose: () => void
  onAdd: (input: {
    segmentId: string
    target: 'text' | 'speaker'
    offset: number
    length: number
    original: string
    replacement: string
  }) => Promise<unknown>
}) {
  const { t } = useLingui()
  const [target, setTarget] = useState<'text' | 'speaker'>('text')
  const [original, setOriginal] = useState('')
  const [replacement, setReplacement] = useState('')
  const [speaker, setSpeaker] = useState<string>(speakers.find((s) => s !== turn.speaker) ?? '')
  const [saving, setSaving] = useState(false)
  const ids = { original: useId(), replacement: useId(), speaker: useId(), target: useId() }
  // The words must be written once in the turn: the correction knows its place.
  const first = original ? turn.text.indexOf(original) : -1
  const once = first >= 0 && turn.text.indexOf(original, first + 1) < 0
  const problem =
    target === 'speaker'
      ? null
      : !original
        ? null
        : first < 0
          ? t`These words are not in the turn (copy them exactly).`
          : !once
            ? t`These words are in the turn more than once: add a word before or after them.`
            : null
  const ready =
    target === 'speaker'
      ? !!turn.speaker && !!speaker && speaker !== turn.speaker
      : once && replacement.trim().length > 0 && replacement.trim() !== original
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`Add a correction`}</DialogTitle>
          <DialogDescription>{turn.text}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {turn.speaker ? (
            <div className="flex items-center gap-2">
              <Switch
                id={ids.target}
                checked={target === 'speaker'}
                onCheckedChange={(on) => setTarget(on ? 'speaker' : 'text')}
              />
              <Label
                htmlFor={ids.target}
                className="font-normal"
              >{t`Change the speaker of this turn`}</Label>
            </div>
          ) : null}
          {target === 'speaker' ? (
            <div className="grid gap-1">
              <Label htmlFor={ids.speaker}>{t`Spoken by`}</Label>
              <Select value={speaker} onValueChange={(v) => setSpeaker(v ?? '')}>
                <SelectTrigger id={ids.speaker} className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {speakers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <Label htmlFor={ids.original}>{t`Words written`}</Label>
                <Input
                  id={ids.original}
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? `${ids.original}-problem` : undefined}
                />
                {problem ? (
                  <p id={`${ids.original}-problem`} className="text-destructive text-xs">
                    {problem}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1">
                <Label htmlFor={ids.replacement}>{t`It should read`}</Label>
                <Input
                  id={ids.replacement}
                  value={replacement}
                  maxLength={200}
                  onChange={(e) => setReplacement(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            disabled={!ready || saving}
            onClick={() => {
              setSaving(true)
              void onAdd(
                target === 'speaker'
                  ? {
                      segmentId: turn.id,
                      target,
                      offset: 0,
                      length: turn.speaker?.length ?? 0,
                      original: turn.speaker ?? '',
                      replacement: speaker,
                    }
                  : {
                      segmentId: turn.id,
                      target,
                      offset: first,
                      length: original.length,
                      original,
                      replacement: replacement.trim(),
                    },
              ).finally(() => setSaving(false))
            }}
          >
            {t`Add`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
