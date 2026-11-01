import { type ProjectFact, useListInsightFacts } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useId, useState } from 'react'
import { Choice } from '../analysis/choice.tsx'
import { POLARITIES } from '../analysis/labels.ts'
import { useBilingual } from './insight-card.tsx'

const ALL = 'all'

/** A fact's link to its interview in its study's Analysis tab. */
export function FactSource({
  fact,
  projectId,
}: {
  fact: { studyId: string; sessionId: string; participant: string | null }
  /** The project it is read from, for the study page's breadcrumb (spec 019). */
  projectId: string
}) {
  const { t } = useLingui()
  return (
    <Link
      to="/studies/$studyId"
      params={{ studyId: fact.studyId }}
      search={{ phase: 'analysis', interview: fact.sessionId, from: projectId }}
      className="text-xs underline underline-offset-2"
    >
      {fact.participant ? t`See ${fact.participant} in the interview` : t`See in the interview`}
    </Link>
  )
}

/**
 * FR-013: the project's facts not rejected (those still to decide marked "to validate"), 25 per page, with a search and filters; `actions` gives
 * each fact its buttons (link to the insight open, pick for a new one).
 */
export function FactsPanel({
  projectId,
  themes,
  actions,
}: {
  projectId: string
  themes: readonly { key: string; title: string | null }[]
  actions?: (fact: ProjectFact) => ReactNode
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const searchId = useId()
  const unlinkedId = useId()
  const [q, setQ] = useState('')
  const [polarity, setPolarity] = useState(ALL)
  const [theme, setTheme] = useState(ALL)
  const [study, setStudy] = useState(ALL)
  const [unlinked, setUnlinked] = useState(false)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const filtered = (change: () => void) => {
    change()
    setPage(1)
  }
  const list = useListInsightFacts(projectId, {
    page,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(polarity !== ALL ? { polarity: polarity as ProjectFact['polarity'] } : {}),
    ...(theme !== ALL ? { theme } : {}),
    ...(study !== ALL ? { study } : {}),
    ...(unlinked ? { unlinked: 'true' } : {}),
    ...(status !== ALL ? { status: status as ProjectFact['status'] } : {}),
  })
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <section aria-label={t`Accepted facts`} className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor={searchId} className="text-muted-foreground text-xs">
          {t`Search`}
        </Label>
        <Input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => filtered(() => setQ(e.target.value))}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Choice
          label={t`Status`}
          value={status}
          className="w-36"
          onChange={(v) => filtered(() => setStatus(v))}
          options={[
            { value: ALL, label: t`All` },
            { value: 'accepted', label: t`Accepted` },
            { value: 'to-decide', label: t`To validate` },
          ]}
        />
        <Choice
          label={t`Polarity`}
          value={polarity}
          className="w-32"
          onChange={(v) => filtered(() => setPolarity(v))}
          options={[
            { value: ALL, label: t`All` },
            ...Object.entries(POLARITIES).map(([value, label]) => ({
              value,
              label: i18n._(label),
            })),
          ]}
        />
        <Choice
          label={t`Theme`}
          value={theme}
          className="w-44"
          onChange={(v) => filtered(() => setTheme(v))}
          options={[
            { value: ALL, label: t`All themes` },
            ...themes.map((x) => ({ value: x.key, label: x.title ?? t`Other` })),
          ]}
        />
        {(data?.studies.length ?? 0) > 1 ? (
          <Choice
            label={t`Study`}
            value={study}
            className="w-44"
            onChange={(v) => filtered(() => setStudy(v))}
            options={[
              { value: ALL, label: t`All studies` },
              ...(data?.studies ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        ) : null}
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id={unlinkedId}
            checked={unlinked}
            onCheckedChange={(checked) => filtered(() => setUnlinked(checked === true))}
          />
          <Label htmlFor={unlinkedId} className="font-normal">
            {t`Not in any insight`}
          </Label>
        </div>
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {data ? t`${data.total} facts` : null}
      </p>
      {list.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <ul className="grid gap-2">
          {(data?.items ?? []).map((f) => (
            <li key={f.id} className="grid gap-1.5 rounded-md border p-2.5">
              <p className="text-sm">
                {f.statement ? bilingual(f.statement).text : t`From a study you cannot open`}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {f.status === 'to-decide' ? (
                  <Badge variant="outline">{t`To validate`}</Badge>
                ) : null}
                <Badge variant="outline">{i18n._(POLARITIES[f.polarity])}</Badge>
                <Badge variant="ghost">{f.theme.title ?? t`Other`}</Badge>
                {f.participant ? <Badge variant="ghost">{f.participant}</Badge> : null}
                <span className="text-muted-foreground text-xs">
                  {f.insights === 0 ? t`In no insight` : t`In ${f.insights} insights`}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FactSource fact={f} projectId={projectId} />
                {actions ? <div className="flex gap-1">{actions(f)}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label={t`Pages of facts`} className="flex items-center justify-between gap-2">
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
    </section>
  )
}
