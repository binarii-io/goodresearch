import {
  type Questionnaire,
  useGetQuestionnaire,
  useGetResponse,
  useListResponses,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { EyeIcon } from '@goodresearch/ui/components/icons'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { cn } from '@goodresearch/ui/lib/utils'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import { RESPONSE_STATES, type ResponseStateKey } from './labels.ts'

const ALL = 'all' as const

type Item = Questionnaire['content']['sections'][number]['items'][number]

/** A scale answer as its boxes, the chosen one filled, with the words of both ends. */
function ScaleAnswer({ item, value }: { item: Extract<Item, { kind: 'likert' }>; value: string }) {
  const { t } = useLingui()
  const chosen = Number(value)
  const points = Array.from({ length: item.points }, (_, i) => i + 1)
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-3">
        <span
          className="flex gap-1"
          role="img"
          aria-label={t`${value} on a scale of ${item.points}`}
        >
          {points.map((p) => (
            <span
              key={p}
              className={cn(
                'grid size-7 place-items-center rounded-md border text-xs',
                p === chosen
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {p}
            </span>
          ))}
        </span>
      </div>
      <span className="text-muted-foreground text-xs">
        {t`1 = ${item.lowLabel} · ${item.points} = ${item.highLabel}`}
      </span>
    </div>
  )
}

function Answer({ item, values }: { item: Item | undefined; values: readonly string[] }) {
  const { t } = useLingui()
  if (!values.length)
    return <span className="text-muted-foreground text-sm italic">{t`No answer`}</span>
  // A scale answer the form gave without its number reads as text.
  const scale = item?.kind === 'likert' && values[0] && /^\d+$/.test(values[0]) ? item : null
  if (scale && values[0]) return <ScaleAnswer item={scale} value={values[0]} />
  if (item?.kind === 'single-choice' || item?.kind === 'multiple-choice')
    return (
      <span className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="secondary">
            {v}
          </Badge>
        ))}
      </span>
    )
  return (
    <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm wrap-anywhere">
      {values.join(', ')}
    </p>
  )
}

/** One response, section by section, each answer shown as its kind of item reads best. */
function ResponseDialog({
  studyId,
  responseId,
  onClose,
}: {
  studyId: string
  responseId: string
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const response = useGetResponse(studyId, responseId)
  const questionnaire = useGetQuestionnaire(studyId)
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'long', timeStyle: 'short' })
  const sections = questionnaire.data?.content.sections ?? []
  const answers = new Map(response.data?.answers.map((a) => [a.itemId, a]))
  // Items the questionnaire no longer has, or a questionnaire not loaded: still shown, at the end.
  const placed = new Set(sections.flatMap((s) => s.items.map((i) => i.id)))
  const rest = response.data?.answers.filter((a) => !placed.has(a.itemId)) ?? []
  const groups = [
    ...sections.map((s) => ({
      id: s.id,
      title: s.title,
      rows: s.items.flatMap((item) => {
        const a = answers.get(item.id)
        return a ? [{ a, item: item as Item | undefined }] : []
      }),
    })),
    { id: 'rest', title: null, rows: rest.map((a) => ({ a, item: undefined })) },
  ].filter((g) => g.rows.length)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t`Close`} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t`Response`}</DialogTitle>
          {response.data ? (
            <DialogDescription className="flex flex-wrap items-center gap-2">
              {t`Received ${date.format(new Date(response.data.submittedAt))}`}
              <Badge variant={response.data.state === 'counted' ? 'secondary' : 'ghost'}>
                {i18n._(RESPONSE_STATES[response.data.state])}
              </Badge>
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {response.isPending || questionnaire.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : response.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, response.error)}
          </p>
        ) : (
          <div className="grid gap-6">
            {groups.map((g) => (
              <section key={g.id} className="grid gap-2">
                {g.title ? (
                  <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    {g.title}
                  </h3>
                ) : null}
                <dl className="grid divide-y rounded-md border">
                  {g.rows.map(({ a, item }) => (
                    <div key={a.itemId} className="grid gap-2 p-3">
                      <dt className="font-medium text-sm">{a.formerText ?? a.text}</dt>
                      {a.formerText ? (
                        <dd className="text-muted-foreground text-xs">{t`Answered this former wording. Now: ${a.text}`}</dd>
                      ) : null}
                      <dd>
                        <Answer item={item} values={a.values} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One page of responses, by state in tabs, as the interviews of a study (spec 028 US4). */
export function ResponsesList({
  studyId,
  counts,
  toolbar,
  filters,
}: {
  studyId: string
  counts: Record<ResponseStateKey | 'all', number>
  /** Sits in the tab bar, outside the tab list (only tabs belong there). */
  toolbar: ReactNode
  /** Above the table, shared by every tab so switching never moves the layout. */
  filters: ReactNode
}) {
  const { t, i18n } = useLingui()
  const [tab, setTab] = useState<ResponseStateKey | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const list = useListResponses(studyId, { page, ...(tab === ALL ? {} : { state: tab }) })
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' })
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const keys = Object.keys(RESPONSE_STATES) as ResponseStateKey[]

  const content = (
    <>
      {filters}
      {list.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : list.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, list.error)}
        </p>
      ) : data?.items.length ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t`Received`}</TableHead>
                <TableHead>{t`State`}</TableHead>
                <TableHead>
                  <span className="sr-only">{t`Actions`}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {date.format(new Date(r.submittedAt))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.state === 'counted' ? 'secondary' : 'ghost'}>
                      {i18n._(RESPONSE_STATES[r.state])}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {r.state === 'refused-consent' ? null : (
                      <Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>
                        <EyeIcon aria-hidden />
                        {t({ message: 'Read', context: 'action' })}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          {counts.all
            ? t`No response here.`
            : t`No response yet. Share the link of the open form, then refresh.`}
        </p>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t`Previous`}
          </Button>
          <span>{t`Page ${page} of ${pages}`}</span>
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
    </>
  )

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as ResponseStateKey | typeof ALL)
          setPage(1)
        }}
        className="gap-3"
      >
        <div className="flex flex-wrap items-center gap-2 border-b">
          <TabsList variant="line" className="flex-1 flex-wrap border-b-0">
            {[ALL, ...keys].map((key) => {
              const label = key === ALL ? t`All` : i18n._(RESPONSE_STATES[key])
              const n = i18n.number(counts[key])
              return (
                <TabsTrigger key={key} value={key}>
                  {t`${label} (${n})`}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {toolbar}
        </div>
        {[ALL, ...keys].map((key) => (
          <TabsContent key={key} value={key} className="grid gap-3">
            {tab === key ? content : null}
          </TabsContent>
        ))}
      </Tabs>
      {open ? (
        <ResponseDialog studyId={studyId} responseId={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  )
}
