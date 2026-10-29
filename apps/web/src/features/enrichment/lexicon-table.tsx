import {
  type EnrichmentInterview,
  getGetEnrichmentQueryKey,
  getListLexiconQueryKey,
  type LexiconTerm,
  type ListLexiconParams,
  useDecideTerm,
  useDecideTerms,
  useListLexicon,
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
  CheckIcon,
  MergeIcon,
  PencilIcon,
  SearchIcon,
  Undo2Icon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { LANGUAGES, TERM_CATEGORIES, TERM_KINDS, TERM_SCOPES, TERM_STATUSES } from './labels.ts'
import { MergeDialog, TermDialog } from './term-dialogs.tsx'

const ALL = '__all__'

type Status = NonNullable<ListLexiconParams['status']>

/** What is left to decide on a term: itself, or new spellings found since. */
const openVariants = (term: LexiconTerm) => term.variants.filter((v) => v.status === 'proposed')

/** An icon action of a row, its name said aloud and shown on hover. */
function Action({
  label,
  icon,
  onClick,
  disabled,
  primary,
}: {
  label: string
  icon: React.ReactNode
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

/** US2: the team's terms found in this study, with filters, decisions and "accept all shown". */
export function LexiconTable({
  studyId,
  interviews,
  session,
  onSession,
}: {
  studyId: string
  interviews: readonly EnrichmentInterview[]
  session: string | null
  onSession: (sessionId: string | null) => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('to-decide')
  const [kind, setKind] = useState<string>(ALL)
  const [category, setCategory] = useState<string>(ALL)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState<LexiconTerm | null>(null)
  const [merging, setMerging] = useState<LexiconTerm | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const ids = { status: useId(), kind: useId(), category: useId(), q: useId() }
  const params: ListLexiconParams = {
    status,
    ...(kind !== ALL ? { kind: kind as NonNullable<ListLexiconParams['kind']> } : {}),
    ...(category !== ALL
      ? { category: category as NonNullable<ListLexiconParams['category']> }
      : {}),
    ...(session ? { sessionId: session } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(cursor ? { cursor } : {}),
  }
  const page = useListLexicon(studyId, params)
  const decide = useDecideTerm()
  const decideAll = useDecideTerms()
  // A decision changes the list: back to its first page, nothing skipped (review of PR #10).
  const refresh = () => {
    setCursor(undefined)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: getListLexiconQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getGetEnrichmentQueryKey(studyId) }),
    ])
  }
  const busy = decide.isPending || decideAll.isPending
  const filtered = (change: () => void) => {
    change()
    setCursor(undefined)
  }

  const act = (term: LexiconTerm, decision: 'accept' | 'reject' | 'reopen') =>
    void decide
      .mutateAsync({ studyId, termId: term.id, data: { version: term.version, decision } })
      .then(refresh)
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))

  const terms = page.data?.terms ?? []
  const size = page.data?.pageSize ?? 50
  const pages = Math.max(1, Math.ceil((page.data?.total ?? 0) / size))
  // A page emptied meanwhile (its last terms decided elsewhere): back to the last page there is.
  const emptied = !!cursor && !!page.data && page.data.terms.length === 0
  useEffect(() => {
    if (emptied) setCursor(pages > 1 ? String((pages - 1) * size) : undefined)
  }, [emptied, pages, size])
  // The cursor is the offset of the page.
  const pageLabel = (offset: number, shown: number, total: number) => {
    const first = offset + 1
    const last = offset + shown
    const current = Math.floor(offset / size) + 1
    return t`Terms ${first}–${last} of ${total} · page ${current} of ${pages}`
  }
  const interviewTitle = interviews.find((i) => i.sessionId === session)?.title

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={ids.status} className="text-muted-foreground text-xs">
            {t`Status`}
          </label>
          <Select value={status} onValueChange={(v) => filtered(() => setStatus(v as Status))}>
            <SelectTrigger id={ids.status} className="w-40">
              <SelectValue>
                {(v: string) =>
                  v === 'all'
                    ? t`All`
                    : v === 'accepted'
                      ? t`Accepted`
                      : v === 'rejected'
                        ? t`Rejected`
                        : t`To decide`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="to-decide">{t`To decide`}</SelectItem>
              <SelectItem value="accepted">{t`Accepted`}</SelectItem>
              <SelectItem value="rejected">{t`Rejected`}</SelectItem>
              <SelectItem value="all">{t`All`}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.kind} className="text-muted-foreground text-xs">
            {t`Kind`}
          </label>
          <Select value={kind} onValueChange={(v) => filtered(() => setKind(v ?? ALL))}>
            <SelectTrigger id={ids.kind} className="w-44">
              <SelectValue>
                {(v: string) =>
                  v === ALL ? t`All kinds` : i18n._(TERM_KINDS[v as LexiconTerm['kind']])
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t`All kinds`}</SelectItem>
              {Object.entries(TERM_KINDS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {i18n._(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.category} className="text-muted-foreground text-xs">
            {t`Category`}
          </label>
          <Select value={category} onValueChange={(v) => filtered(() => setCategory(v ?? ALL))}>
            <SelectTrigger id={ids.category} className="w-40">
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? t`All categories`
                    : i18n._(TERM_CATEGORIES[v as LexiconTerm['category']])
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t`All categories`}</SelectItem>
              {Object.entries(TERM_CATEGORIES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {i18n._(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.q} className="text-muted-foreground text-xs">
            {t`Search a spelling`}
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
            />
            <Input
              id={ids.q}
              value={q}
              maxLength={80}
              className="w-56 pl-8"
              onChange={(event) => filtered(() => setQ(event.target.value))}
            />
          </div>
        </div>
        {status === 'to-decide' && terms.length > 0 ? (
          <Button
            variant="outline"
            className="ml-auto"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
          >
            <CheckIcon aria-hidden />
            {t`Accept all shown (${terms.length})`}
          </Button>
        ) : null}
      </div>
      {session ? (
        <p className="flex items-center gap-2 text-sm">
          {t`Terms found in: ${interviewTitle ?? ''}`}
          <Button variant="link" size="xs" onClick={() => filtered(() => onSession(null))}>
            {t`Show every interview`}
          </Button>
        </p>
      ) : null}

      {page.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : terms.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {status === 'to-decide'
            ? t`Nothing to decide. Find terms to read new interviews, or see the accepted terms.`
            : t`No term matches these filters.`}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t`Term`}</TableHead>
              <TableHead>{t`Spellings found`}</TableHead>
              <TableHead>{t`Found`}</TableHead>
              <TableHead>{t`Decision`}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((term) => {
              const count = term.occurrences.reduce((a, o) => a + o.count, 0)
              const yes = term.occurrences.reduce((a, o) => a + o.yes, 0)
              const no = term.occurrences.reduce((a, o) => a + o.no, 0)
              const pending = openVariants(term)
              return (
                // The whole row opens the term (its "Change" button is the keyboard way).
                <TableRow key={term.id} className="cursor-pointer" onClick={() => setEditing(term)}>
                  <TableCell className="align-top">
                    {/* A table cell ignores a width limit: the block inside carries it. */}
                    <span className="grid min-w-0 max-w-80 gap-1">
                      <span className="truncate font-medium">
                        {term.kind === 'suspect' && term.correction
                          ? t`${term.form} → ${term.correction}`
                          : term.form}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="outline">{i18n._(TERM_KINDS[term.kind])}</Badge>
                        <Badge variant="ghost">{i18n._(TERM_CATEGORIES[term.category])}</Badge>
                        <Badge variant="ghost">{i18n._(TERM_SCOPES[term.scope])}</Badge>
                        {term.language !== 'en' ? (
                          <Badge variant="ghost">{i18n._(LANGUAGES[term.language])}</Badge>
                        ) : null}
                      </span>
                      {term.definition ? (
                        <span
                          className="truncate text-muted-foreground text-xs"
                          title={term.definition}
                        >
                          {term.definition}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <ul className="flex max-w-72 flex-wrap gap-1">
                      {term.variants.map((v) => (
                        <li key={v.spelling}>
                          <Badge
                            variant={v.status === 'proposed' ? 'outline' : 'secondary'}
                            className={v.status === 'rejected' ? 'line-through' : undefined}
                          >
                            {v.spelling}
                            <span className="sr-only">
                              {' '}
                              (
                              {i18n._(
                                TERM_STATUSES[v.status === 'proposed' ? 'proposed' : v.status],
                              )}
                              )
                            </span>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <span className="grid">
                      <span>{t`${count} times in ${term.occurrences.length} interviews`}</span>
                      {yes || no ? (
                        <span className="text-muted-foreground text-xs">
                          {t`${yes} confirmed · ${no} not this term`}
                        </span>
                      ) : null}
                      {term.otherStudies > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {t`also in ${term.otherStudies} other studies of the team`}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  {/* Its buttons and dialogs are not part of the row's click (portals bubble in React). */}
                  <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {term.status === 'proposed' || term.status === 'rejected' ? null : (
                        <Badge variant="secondary">{i18n._(TERM_STATUSES[term.status])}</Badge>
                      )}
                      {term.status === 'rejected' ? (
                        <>
                          <Badge variant="ghost">{i18n._(TERM_STATUSES.rejected)}</Badge>
                          <Action
                            label={t`Reopen: ${term.form}`}
                            icon={<Undo2Icon aria-hidden />}
                            disabled={busy}
                            onClick={() => act(term, 'reopen')}
                          />
                        </>
                      ) : (
                        <>
                          {term.status === 'proposed' || pending.length > 0 ? (
                            <Action
                              primary
                              label={
                                term.status === 'proposed'
                                  ? t`Accept: ${term.form}`
                                  : t`Accept the new spellings of ${term.form}`
                              }
                              icon={<CheckIcon aria-hidden />}
                              disabled={busy}
                              onClick={() => act(term, 'accept')}
                            />
                          ) : null}
                          <Action
                            label={t`Change: ${term.form}`}
                            icon={<PencilIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => setEditing(term)}
                          />
                          <Action
                            label={t`Merge ${term.form} into another term`}
                            icon={<MergeIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => setMerging(term)}
                          />
                          <Action
                            label={t`Reject: ${term.form}`}
                            icon={<XIcon aria-hidden />}
                            disabled={busy}
                            onClick={() => act(term, 'reject')}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {page.data && (cursor || page.data.next) ? (
        <nav aria-label={t`Pages of the lexicon`} className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!cursor}
            onClick={() => {
              const previous = Number(cursor ?? 0) - size
              setCursor(previous > 0 ? String(previous) : undefined)
            }}
          >
            {t`Previous`}
          </Button>
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {pageLabel(Number(cursor ?? 0), terms.length, page.data.total)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!page.data.next}
            onClick={() => setCursor(page.data?.next ?? undefined)}
          >
            {t`Next`}
          </Button>
        </nav>
      ) : null}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Accept the ${terms.length} terms shown?`}</AlertDialogTitle>
            <AlertDialogDescription>{t`Each term is accepted with its spellings. A transcription error without its correction, or a term changed meanwhile, stays to decide.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void decideAll
                  .mutateAsync({
                    studyId,
                    data: {
                      decision: 'accept',
                      terms: terms.map((x) => ({ termId: x.id, version: x.version })),
                    },
                  })
                  .then((r) => {
                    toast.success(
                      r.changed
                        ? t`${r.done} accepted, ${r.changed} left to decide`
                        : t`${r.done} accepted`,
                    )
                    return refresh()
                  })
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }
            >
              {t`Accept all`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editing ? (
        <TermDialog
          studyId={studyId}
          term={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      ) : null}
      {merging ? (
        <MergeDialog
          studyId={studyId}
          term={merging}
          onClose={() => setMerging(null)}
          onMerged={() => void refresh()}
        />
      ) : null}
    </div>
  )
}
