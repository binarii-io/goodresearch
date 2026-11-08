import {
  getGetSurveyAnalysisQueryKey,
  getListSurveyFactsQueryKey,
  type SurveyFact,
  useAcceptAnyFacts,
  useDecideSurveyFact,
  useListSurveyFacts,
  useUpdateSurveyFactFigure,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { TriangleAlertIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { POLARITIES } from '../analysis/labels.ts'
import { AcceptAllShown } from '../facts/accept-all.tsx'
import { FactDecision } from '../facts/fact-decision.tsx'
import { FactStatusBadge } from '../facts/fact-status.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { Pager } from '../workspace/pager.tsx'
import { useShare } from './figure-card.tsx'

type Status = 'to-decide' | 'accepted' | 'rejected' | 'all'
const STATUSES: readonly Status[] = ['to-decide', 'accepted', 'rejected', 'all']

/** Where a survey fact comes from, as one line (spec 029 FR-010). */
function Support({ fact }: { fact: SurveyFact }) {
  const { t, i18n } = useLingui()
  const share = useShare()
  const s = fact.support
  if (s.kind === 'theme')
    return (
      <div className="grid gap-1 text-muted-foreground text-xs">
        <span>{t`Theme of open answers: ${s.share.answers} of ${s.share.base} answers`}</span>
        {s.quotes.length ? (
          <ul className="ml-4 list-disc">
            {s.quotes.map((q) => (
              <li key={q}>« {q} »</li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  const f = s.figure
  const value =
    f.measure === 'mean' ? i18n.number(f.value, { maximumFractionDigits: 1 }) : share(f.value)
  return (
    <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <span>
        {f.cross
          ? t`Figure ${value}, base ${f.base}, among “${f.cross.option}”`
          : t`Figure ${value}, base ${f.base}`}
      </span>
      {f.smallBase ? <Badge variant="highlight">{t`Small base`}</Badge> : null}
    </p>
  )
}

function EditDialog({
  studyId,
  fact,
  onClose,
}: {
  studyId: string
  fact: SurveyFact
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const decide = useDecideSurveyFact()
  const id = useId()
  const language = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const [text, setText] = useState(fact.statement[language])
  const submit = async () => {
    try {
      await decide.mutateAsync({
        studyId,
        factId: fact.id,
        data: { decision: 'edit', version: fact.version, statement: { [language]: text } },
      })
      await queryClient.invalidateQueries({ queryKey: getListSurveyFactsQueryKey(studyId) })
      onClose()
    } catch {
      // Shown in the dialog.
    }
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`Edit the fact`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{t`Statement`}</Label>
          <Textarea
            id={id}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t`The other language is translated after you save.`}</p>
        </div>
        {decide.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, decide.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!text.trim() || decide.isPending}
            onClick={() => void submit().catch(() => undefined)}
          >
            {t`Save`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Spec 029 US4: the survey's facts, decided like the facts of interviews. */
export function SurveyFacts({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const share = useShare()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('to-decide')
  const [editing, setEditing] = useState<SurveyFact | null>(null)
  const [page, setPage] = useState(1)
  const list = useListSurveyFacts(studyId, { status, page })
  const decide = useDecideSurveyFact()
  const accept = useAcceptAnyFacts()
  const figure = useUpdateSurveyFactFigure()
  const language = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const labels: Record<Status, string> = {
    'to-decide': t`To decide`,
    accepted: t`Accepted`,
    rejected: t`Rejected`,
    all: t`All`,
  }
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListSurveyFactsQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getGetSurveyAnalysisQueryKey(studyId) }),
    ])
  const run = (job: Promise<unknown>) =>
    void job.then(refresh).catch((failure: unknown) => {
      toast.error(errorMessage(i18n, failure))
      return refresh()
    })

  const facts = list.data?.facts ?? []
  const toDecide = facts.filter((f) => f.status === 'proposed')
  const content = list.isPending ? (
    <Skeleton className="h-24 w-full" />
  ) : list.isError ? (
    <p role="alert" className="text-destructive text-sm">
      {errorMessage(i18n, list.error)}
    </p>
  ) : facts.length === 0 ? (
    <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">{t`No fact here. Use “Find facts”, or make one from a figure with “Make a fact”.`}</p>
  ) : (
    <ul className="grid gap-2">
      {facts.map((f) => (
        <li key={f.id} className="grid gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FactStatusBadge status={f.status} />
            <Badge variant="ghost">{i18n._(POLARITIES[f.polarity])}</Badge>
            {f.theme ? (
              <span className="text-muted-foreground text-xs">{f.theme.title}</span>
            ) : null}
          </div>
          <p className="text-sm">
            {f.statement[language]}
            {f.translation === 'translating' ? (
              <span className="text-muted-foreground text-xs"> · {t`Translating…`}</span>
            ) : null}
          </p>
          <Support fact={f} />
          {f.itemRemoved ? (
            <p className="flex items-center gap-1.5 text-sm">
              <TriangleAlertIcon aria-hidden className="size-4" />
              {t`Item removed: the question is no longer in the questionnaire.`}
            </p>
          ) : f.figureChanged ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-highlight-soft p-2 text-sm">
              <TriangleAlertIcon aria-hidden className="size-4" />
              <span>
                {t`Figure changed: today ${
                  f.support.kind === 'figure' && f.support.figure.measure === 'mean'
                    ? i18n.number(f.figureChanged.value, { maximumFractionDigits: 1 })
                    : share(f.figureChanged.value)
                }, base ${f.figureChanged.base}.`}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={figure.isPending}
                onClick={() =>
                  run(
                    figure.mutateAsync({
                      studyId,
                      factId: f.id,
                      data: { action: 'update', version: f.version },
                    }),
                  )
                }
              >
                {t`Update to today`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={figure.isPending}
                onClick={() =>
                  run(
                    figure.mutateAsync({
                      studyId,
                      factId: f.id,
                      data: { action: 'keep', version: f.version },
                    }),
                  )
                }
              >
                {t`Keep`}
              </Button>
            </div>
          ) : null}
          {/* Spec 039: the same decisions as every fact, reopen included. */}
          <FactDecision
            status={f.status}
            pending={decide.isPending}
            onDecide={(decision) =>
              run(
                decide.mutateAsync({
                  studyId,
                  factId: f.id,
                  data: { decision, version: f.version },
                }),
              )
            }
            onEdit={() => setEditing(f)}
          />
        </li>
      ))}
    </ul>
  )

  return (
    <section aria-labelledby="survey-facts-heading" className="grid gap-3">
      <div className="grid gap-1">
        <SectionTitle id="survey-facts-heading" count={list.data?.total}>
          {t`Facts`}
        </SectionTitle>
        <p className="text-muted-foreground text-sm">{t`Accepted facts feed the project's insights, with those of interviews.`}</p>
      </div>
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as Status)
          setPage(1)
        }}
        className="gap-3"
      >
        <TabsList variant="line">
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {labels[s]}
            </TabsTrigger>
          ))}
        </TabsList>
        {STATUSES.map((s) => (
          <TabsContent key={s} value={s} className="grid gap-3">
            {status === s && s !== 'rejected' ? (
              <div className="flex justify-end">
                <AcceptAllShown
                  count={toDecide.length}
                  pending={accept.isPending}
                  onAccept={() =>
                    run(
                      accept.mutateAsync({
                        data: { facts: toDecide.map((f) => ({ id: f.id, version: f.version })) },
                      }),
                    )
                  }
                />
              </div>
            ) : null}
            {status === s ? content : null}
            {status === s && list.data ? (
              <Pager
                page={page}
                total={list.data.total}
                pageSize={list.data.pageSize}
                onPage={setPage}
              />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
      {editing ? (
        <EditDialog studyId={studyId} fact={editing} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  )
}
