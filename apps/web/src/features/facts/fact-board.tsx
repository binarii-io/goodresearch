import {
  type FactRow,
  getGetFactBoardQueryKey,
  useAcceptAnyFacts,
  useDecideAnyFact,
  useGetFactBoard,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { PlayIcon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { POLARITIES } from '../analysis/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { AcceptAllShown } from './accept-all.tsx'
import { FactDecision, type FactDecisionKind } from './fact-decision.tsx'
import { FactStatusBadge } from './fact-status.tsx'

type Status = 'to-decide' | 'accepted' | 'rejected' | 'all'

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Spec 039 FR-003: the facts of one study, the same list for every study type: filters, search,
 * counts, pages, the same decisions and "Accept all shown"; each fact with its own evidence.
 */
export function FactBoard({
  studyId,
  onOpenObservation,
}: {
  studyId: string
  /** A usability fact's observation: open its session at its moment. */
  onOpenObservation?: ((sessionId: string, momentMs: number) => void) | undefined
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('to-decide')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const searchId = useId()
  const board = useGetFactBoard(studyId, { status, page, ...(q.trim() ? { q: q.trim() } : {}) })
  const accept = useAcceptAnyFacts()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetFactBoardQueryKey(studyId) })
  const data = board.data
  const toDecide = data?.items.filter((f) => f.status === 'to-decide' && f.canDecide) ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Choice
          label={t`Status`}
          value={status}
          onChange={(v) => {
            setStatus(v as Status)
            setPage(1)
          }}
          className="w-44"
          options={[
            { value: 'to-decide', label: t`To decide (${data?.counts.toDecide ?? 0})` },
            {
              value: 'accepted',
              label: t`Accepted (${(data?.counts.accepted ?? 0) + (data?.counts.edited ?? 0)})`,
            },
            { value: 'rejected', label: t`Rejected (${data?.counts.rejected ?? 0})` },
            { value: 'all', label: t`All` },
          ]}
        />
        <div className="grid gap-1.5">
          <Label htmlFor={searchId}>{t`Search`}</Label>
          <Input
            id={searchId}
            value={q}
            className="w-64"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <span className="ml-auto">
          <AcceptAllShown
            count={toDecide.length}
            pending={accept.isPending}
            onAccept={() =>
              void accept
                .mutateAsync({
                  data: { facts: toDecide.map((f) => ({ id: f.id, version: f.version })) },
                })
                .then((r) => {
                  toast.success(
                    r.changed
                      ? t`${r.done} accepted; ${r.changed} changed meanwhile, left as they are`
                      : t`${r.done} accepted`,
                  )
                  return refresh()
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          />
        </span>
      </div>
      {board.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !data?.items.length ? (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          {status === 'to-decide' ? t`No fact to decide.` : t`No fact here.`}
        </p>
      ) : (
        <ul className="grid gap-2">
          {data.items.map((f) => (
            <li key={f.id}>
              <FactItem fact={f} onDone={refresh} onOpenObservation={onOpenObservation} />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t`Previous`}
          </Button>
          <span className="text-sm">{t`Page ${page} of ${pages}`}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t`Next`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FactItem({
  fact,
  onDone,
  onOpenObservation,
}: {
  fact: FactRow
  onDone: () => Promise<unknown>
  onOpenObservation?: ((sessionId: string, momentMs: number) => void) | undefined
}) {
  const { t, i18n } = useLingui()
  const decide = useDecideAnyFact()
  const [editing, setEditing] = useState(false)
  const fr = i18n.locale.startsWith('fr')
  const text =
    (fr ? fact.statement.fr : fact.statement.en) || (fr ? fact.statement.en : fact.statement.fr)
  const [draft, setDraft] = useState(text)
  const editId = useId()
  const act = (decision: FactDecisionKind | 'edit') =>
    void decide
      .mutateAsync({
        factId: fact.id,
        data: {
          decision,
          version: fact.version,
          ...(decision === 'edit'
            ? { statement: fr ? { fr: draft.trim() } : { en: draft.trim() } }
            : {}),
        },
      })
      .then(() => {
        setEditing(false)
        return onDone()
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const e = fact.evidence
  return (
    <article
      aria-label={text}
      className={`grid gap-2 rounded-md border p-3 ${fact.status === 'rejected' ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <FactStatusBadge status={fact.status} />
        <Badge variant="outline">{i18n._(POLARITIES[fact.polarity])}</Badge>
        <Badge variant="ghost">{fact.theme ? fact.theme.title : t`Other`}</Badge>
        {e.kind === 'task' && e.figuresChanged ? (
          <Badge variant="warning">{t`Figures changed`}</Badge>
        ) : null}
      </div>
      {editing ? (
        <div className="grid gap-1.5">
          <Label htmlFor={editId}>{t`Statement`}</Label>
          <Textarea
            id={editId}
            value={draft}
            maxLength={200}
            onChange={(ev) => setDraft(ev.target.value)}
          />
          <div className="flex gap-1">
            <Button
              size="xs"
              disabled={decide.isPending || !draft.trim()}
              onClick={() => act('edit')}
            >
              {t`Save`}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
              {t`Cancel`}
            </Button>
          </div>
        </div>
      ) : (
        <p className="font-medium text-sm">{text}</p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        {e.kind === 'verbatims' ? t`${e.count} verbatims` : null}
        {e.kind === 'figure' ? t`${e.base} respondents` : null}
        {e.kind === 'task' ? t`Decided outcomes of ${e.sessions} sessions` : null}
        {e.kind === 'observation' ? (
          <>
            {e.participant ? <span>{e.participant}</span> : null}
            {e.quote ? <span>« {e.quote} »</span> : null}
            <span>{clock(e.momentMs)}</span>
            {onOpenObservation ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenObservation(e.sessionId, e.momentMs)}
              >
                <PlayIcon aria-hidden />
                {t`See in the session`}
              </Button>
            ) : null}
          </>
        ) : null}
      </p>
      {fact.canDecide && !editing ? (
        <FactDecision
          status={fact.status}
          pending={decide.isPending}
          onDecide={act}
          onEdit={() => {
            setDraft(text)
            setEditing(true)
          }}
        />
      ) : null}
    </article>
  )
}
