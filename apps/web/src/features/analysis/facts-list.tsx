import {
  type Fact,
  getGetFactsOverviewQueryKey,
  getListFactsQueryKey,
  useAcceptFacts,
  useListFacts,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon } from '@goodresearch/ui/components/icons'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { Choice } from './choice.tsx'
import { FactCard } from './fact-card.tsx'
import { FactDialog } from './fact-dialog.tsx'
import { POLARITIES } from './labels.ts'

const ALL = 'all'
type Status = 'to-decide' | 'accepted' | 'rejected' | 'all'

/** FR-018: every fact of the study, filtered, decided here or opened in its interview. */
export function FactsList({
  studyId,
  onOpen,
}: {
  studyId: string
  onOpen: (sessionId: string, segmentId: string) => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('to-decide')
  const [theme, setTheme] = useState(ALL)
  const [polarity, setPolarity] = useState(ALL)
  const [participant, setParticipant] = useState(ALL)
  const [session, setSession] = useState(ALL)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Fact | null>(null)
  const filtered = (change: () => void) => {
    change()
    setPage(1)
  }
  const list = useListFacts(studyId, {
    status,
    page,
    ...(theme !== ALL ? { theme } : {}),
    ...(polarity !== ALL ? { polarity: polarity as Fact['polarity'] } : {}),
    ...(participant !== ALL ? { participant } : {}),
    ...(session !== ALL ? { sessionId: session } : {}),
  })
  const accept = useAcceptFacts()
  const data = list.data
  const toDecide = data?.facts.filter((f) => f.status === 'proposed') ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Choice
          label={t`Status`}
          value={status}
          onChange={(v) => filtered(() => setStatus(v as Status))}
          className="w-36"
          options={[
            { value: 'to-decide', label: t`To decide` },
            { value: 'accepted', label: t`Accepted` },
            { value: 'rejected', label: t`Rejected` },
            { value: 'all', label: t`All` },
          ]}
        />
        <Choice
          label={t`Theme`}
          value={theme}
          onChange={(v) => filtered(() => setTheme(v))}
          className="w-52"
          options={[
            { value: ALL, label: t`All themes` },
            ...(data?.themes ?? []).map((x) => ({ value: x.id, label: x.title })),
            { value: 'other', label: t`Other` },
          ]}
        />
        <Choice
          label={t`Polarity`}
          value={polarity}
          onChange={(v) => filtered(() => setPolarity(v))}
          className="w-36"
          options={[
            { value: ALL, label: t`All` },
            ...Object.entries(POLARITIES).map(([value, label]) => ({
              value,
              label: i18n._(label),
            })),
          ]}
        />
        <Choice
          label={t`Participant`}
          value={participant}
          onChange={(v) => filtered(() => setParticipant(v))}
          className="w-40"
          options={[
            { value: ALL, label: t`Everyone` },
            ...(data?.participants ?? []).map((p) => ({ value: p.code, label: p.label })),
          ]}
        />
        <Choice
          label={t`Interview`}
          value={session}
          onChange={(v) => filtered(() => setSession(v))}
          className="w-56"
          options={[
            { value: ALL, label: t`All interviews` },
            ...(data?.interviews ?? []).map((i) => ({ value: i.sessionId, label: i.title })),
          ]}
        />
        {toDecide.length > 0 ? (
          <Button
            className="ml-auto"
            variant="outline"
            disabled={accept.isPending}
            onClick={() =>
              void accept
                .mutateAsync({
                  studyId,
                  data: { facts: toDecide.map((f) => ({ id: f.id, version: f.version })) },
                })
                .then((result) => {
                  if (result.changed > 0)
                    toast.info(t`${result.changed} facts changed meanwhile: check them again.`)
                  return Promise.all([
                    queryClient.invalidateQueries({ queryKey: getListFactsQueryKey(studyId) }),
                    queryClient.invalidateQueries({
                      queryKey: getGetFactsOverviewQueryKey(studyId),
                    }),
                  ])
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            <CheckIcon aria-hidden />
            {t`Accept all shown (${toDecide.length})`}
          </Button>
        ) : null}
      </div>
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : data.facts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t`No fact here.`}</p>
      ) : (
        <ul className="grid gap-3">
          {data.facts.map((f) => (
            <li key={f.id}>
              <FactCard
                studyId={studyId}
                fact={f}
                showInterview
                onVerbatim={(segmentId) => onOpen(f.sessionId, segmentId)}
                onEdit={() => setEditing(f)}
              />
            </li>
          ))}
        </ul>
      )}
      {data && pages > 1 ? (
        <nav className="flex items-center gap-2" aria-label={t`Pages`}>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t`Previous`}
          </Button>
          <span className="text-sm">{t`Page ${page} of ${pages}`}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t`Next`}
          </Button>
        </nav>
      ) : null}
      {editing ? (
        <FactDialog
          key={editing.id}
          studyId={studyId}
          sessionId={editing.sessionId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          fact={editing}
          themes={data?.themes ?? []}
        />
      ) : null}
    </div>
  )
}
