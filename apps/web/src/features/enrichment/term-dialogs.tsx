import {
  getListLexiconQueryKey,
  getListTermOccurrencesQueryKey,
  type LexiconTerm,
  type TermQuote,
  useDecideTerm,
  useJudgeOccurrence,
  useListLexicon,
  useListTermOccurrences,
  useMergeTerms,
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
import { CheckIcon, CircleDashedIcon, XIcon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Switch } from '@goodresearch/ui/components/switch'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { TERM_CATEGORIES, TERM_KINDS, TERM_SCOPES } from './labels.ts'

type Kind = LexiconTerm['kind']
type Category = LexiconTerm['category']
type Scope = LexiconTerm['scope']

/** Changing a term (FR-010): its form, kind, correction, category, definition and spellings. */
export function TermDialog({
  studyId,
  term,
  onClose,
  onSaved,
}: {
  studyId: string
  term: LexiconTerm
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useLingui()
  const decide = useDecideTerm()
  const [form, setForm] = useState(term.form)
  const [kind, setKind] = useState<Kind>(term.kind)
  const [correction, setCorrection] = useState(term.correction ?? '')
  const [category, setCategory] = useState<Category>(term.category)
  const [definition, setDefinition] = useState(term.definition ?? '')
  const [scope, setScope] = useState<Scope>(term.scope)
  // Each spelling kept or not; a proposed one counts as kept.
  const [kept, setKept] = useState<Record<string, boolean>>(
    Object.fromEntries(term.variants.map((v) => [v.spelling, v.status !== 'rejected'])),
  )
  const ids = {
    form: useId(),
    kind: useId(),
    correction: useId(),
    category: useId(),
    definition: useId(),
    scope: useId(),
  }
  const invalid = !form.trim() || (kind === 'suspect' && !correction.trim())

  const save = () =>
    void decide
      .mutateAsync({
        studyId,
        termId: term.id,
        data: {
          version: term.version,
          decision: 'edit',
          fields: {
            form: form.trim(),
            kind,
            correction: kind === 'suspect' ? correction.trim() : null,
            category,
            definition: definition.trim() || null,
            ...(scope !== term.scope ? { scope } : {}),
          },
          variants: term.variants.map((v) => ({
            spelling: v.spelling,
            status: kept[v.spelling] ? ('accepted' as const) : ('rejected' as const),
          })),
        },
      })
      .then(() => {
        toast.success(t`Term saved`)
        onSaved()
        onClose()
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        closeLabel={t`Close`}
        className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{t`Term: ${term.form}`}</DialogTitle>
          <DialogDescription>{t`Saving accepts the term with the spellings you keep.`}</DialogDescription>
        </DialogHeader>
        {/* Only the fields scroll: the title and the actions stay in view. */}
        <div className="-mx-6 grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.form}>{t`Form`}</Label>
              <Input
                id={ids.form}
                value={form}
                maxLength={80}
                onChange={(e) => setForm(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.kind}>{t`Kind`}</Label>
              <Select value={kind} onValueChange={(v) => setKind((v as Kind | null) ?? kind)}>
                <SelectTrigger id={ids.kind}>
                  <SelectValue>{(v: string) => i18n._(TERM_KINDS[v as Kind])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TERM_KINDS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {i18n._(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind === 'suspect' ? (
              <div className="grid gap-1.5">
                <Label htmlFor={ids.correction}>{t`What it should read`}</Label>
                <Input
                  id={ids.correction}
                  value={correction}
                  maxLength={80}
                  aria-invalid={!correction.trim()}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={ids.category}>{t`Category`}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory((v as Category | null) ?? category)}
              >
                <SelectTrigger id={ids.category}>
                  <SelectValue>{(v: string) => i18n._(TERM_CATEGORIES[v as Category])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TERM_CATEGORIES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {i18n._(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.scope}>{t`Where to correct`}</Label>
              <Select value={scope} onValueChange={(v) => setScope((v as Scope | null) ?? scope)}>
                <SelectTrigger id={ids.scope}>
                  <SelectValue>{(v: string) => i18n._(TERM_SCOPES[v as Scope])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TERM_SCOPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {i18n._(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.definition}>{t`Definition`}</Label>
            <Textarea
              id={ids.definition}
              value={definition}
              maxLength={200}
              rows={2}
              onChange={(e) => setDefinition(e.target.value)}
            />
          </div>
          {term.variants.length ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">{t`Spellings found`}</legend>
              {term.variants.map((v) => (
                <VariantSwitch
                  key={v.spelling}
                  spelling={v.spelling}
                  kept={kept[v.spelling] ?? true}
                  onChange={(on) => setKept((current) => ({ ...current, [v.spelling]: on }))}
                />
              ))}
            </fieldset>
          ) : null}
          {term.occurrences.length ? (
            <Occurrences studyId={studyId} term={term} headingId={`${ids.form}-found`} />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button disabled={invalid || decide.isPending} onClick={save}>
            {t`Save`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Verdict = NonNullable<TermQuote['verdict']>

/** One excerpt, the term as written marked in it, with the person's yes / no / unsure on it. */
function Quote({
  quote,
  busy,
  onVerdict,
}: {
  quote: TermQuote
  busy: boolean
  onVerdict: (verdict: Verdict | null) => void
}) {
  const { t } = useLingui()
  const excerpt = `${quote.before}${quote.match}${quote.after}`
  const toggle = (verdict: Verdict) => onVerdict(quote.verdict === verdict ? null : verdict)
  return (
    <div className="flex items-start gap-2">
      <blockquote
        className={`flex-1 border-l-2 pl-3 text-muted-foreground ${
          quote.verdict === 'no' ? 'line-through decoration-muted-foreground/60' : ''
        }`}
      >
        {quote.before}
        <mark className="rounded-sm bg-highlight-soft px-0.5 text-highlight-soft-foreground">
          {quote.match}
        </mark>
        {quote.after}
      </blockquote>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon-sm"
          variant={quote.verdict === 'yes' ? 'secondary' : 'ghost'}
          aria-pressed={quote.verdict === 'yes'}
          aria-label={t`This is the term: ${excerpt}`}
          title={t`This is the term`}
          disabled={busy}
          onClick={() => toggle('yes')}
        >
          <CheckIcon aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant={quote.verdict === 'no' ? 'secondary' : 'ghost'}
          aria-pressed={quote.verdict === 'no'}
          aria-label={t`Not this term: ${excerpt}`}
          title={t`Not this term here`}
          disabled={busy}
          onClick={() => toggle('no')}
        >
          <XIcon aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant={quote.verdict === 'unsure' ? 'secondary' : 'ghost'}
          aria-pressed={quote.verdict === 'unsure'}
          aria-label={t`Can't tell: ${excerpt}`}
          title={t`Can't tell yet, decide in Cleaning`}
          disabled={busy}
          onClick={() => toggle('unsure')}
        >
          <CircleDashedIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/**
 * Where the term was found, per interview: three excerpts first, every occurrence on demand (up to
 * 50 per spelling and interview are kept).
 */
function Occurrences({
  studyId,
  term,
  headingId,
}: {
  studyId: string
  term: LexiconTerm
  headingId: string
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [all, setAll] = useState(false)
  const full = useListTermOccurrences(studyId, term.id, { query: { enabled: all } })
  const judge = useJudgeOccurrence()
  // Verdicts given here, shown at once (the lists are read again behind).
  const [given, setGiven] = useState<Record<string, Verdict | null>>({})
  const placeOf = (q: TermQuote) => `${q.segmentId}/${q.offset}`
  const occurrences = (all && full.data ? full.data.occurrences : term.occurrences).map((o) => {
    const quotes = o.quotes.map((q) => {
      const key = placeOf(q)
      return key in given ? { ...q, verdict: given[key] ?? null } : q
    })
    const changed = (v: Verdict) =>
      quotes.filter((q) => q.verdict === v).length - o.quotes.filter((q) => q.verdict === v).length
    return {
      ...o,
      quotes,
      yes: o.yes + changed('yes'),
      no: o.no + changed('no'),
      unsure: o.unsure + changed('unsure'),
    }
  })
  const decide = (sessionId: string, q: TermQuote, verdict: Verdict | null) => {
    setGiven((current) => ({ ...current, [placeOf(q)]: verdict }))
    void judge
      .mutateAsync({
        studyId,
        termId: term.id,
        data: { sessionId, segmentId: q.segmentId, offset: q.offset, verdict },
      })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: getListLexiconQueryKey(studyId) }),
          queryClient.invalidateQueries({
            queryKey: getListTermOccurrencesQueryKey(studyId, term.id),
          }),
        ]),
      )
      .catch((failure: unknown) => {
        setGiven((current) => ({ ...current, [placeOf(q)]: q.verdict }))
        toast.error(errorMessage(i18n, failure))
      })
  }
  const total = term.occurrences.reduce((a, o) => a + o.count, 0)
  const shown = term.occurrences.reduce((a, o) => a + o.quotes.length, 0)
  return (
    <section className="grid gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="font-medium text-sm">
        {t`Where it was found`}
      </h3>
      <p className="text-muted-foreground text-xs">
        {term.scope === 'case-by-case'
          ? t`Case by case: say for each excerpt whether it is this term. Cleaning corrects only those you confirm; those you can't tell yet are left to decide there.`
          : t`Everywhere: Cleaning corrects every occurrence, except those you mark as not this term; those you can't tell yet are left to decide there.`}
      </p>
      <ul className="grid gap-3">
        {occurrences.map((o) => (
          <li key={o.sessionId} className="grid gap-1 text-sm">
            <span className="font-medium">
              {o.quotes.length < o.count
                ? t`${o.title} (${o.count} times, ${o.quotes.length} excerpts shown)`
                : t`${o.title} (${o.count} times)`}
            </span>
            {o.yes || o.no || o.unsure ? (
              <span className="text-muted-foreground text-xs">
                {o.unsure
                  ? t`${o.yes} confirmed · ${o.no} not this term · ${o.unsure} can't tell`
                  : t`${o.yes} confirmed · ${o.no} not this term`}
              </span>
            ) : null}
            {o.quotes.map((quote) => (
              <Quote
                key={placeOf(quote)}
                quote={quote}
                busy={judge.isPending}
                onVerdict={(verdict) => decide(o.sessionId, quote, verdict)}
              />
            ))}
          </li>
        ))}
      </ul>
      {!all && shown < total ? (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setAll(true)}>
          {t`Show every occurrence (${total})`}
        </Button>
      ) : all && full.isPending ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t`Loading every occurrence…`}
        </p>
      ) : null}
    </section>
  )
}

function VariantSwitch({
  spelling,
  kept,
  onChange,
}: {
  spelling: string
  kept: boolean
  onChange: (on: boolean) => void
}) {
  const { t } = useLingui()
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={kept} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {spelling}
        <span className="text-muted-foreground text-xs">{kept ? t`kept` : t`not this term`}</span>
      </Label>
    </div>
  )
}

/** Merging (research R7): the term's spellings go to the term picked, which counts as accepted. */
export function MergeDialog({
  studyId,
  term,
  onClose,
  onMerged,
}: {
  studyId: string
  term: LexiconTerm
  onClose: () => void
  onMerged: () => void
}) {
  const { t, i18n } = useLingui()
  const [q, setQ] = useState('')
  const [into, setInto] = useState<string | null>(null)
  const ids = { q: useId(), into: useId() }
  const options = useListLexicon(studyId, {
    status: 'all',
    language: term.language,
    ...(q.trim() ? { q: q.trim() } : {}),
  })
  const merge = useMergeTerms()
  const candidates = (options.data?.terms ?? []).filter(
    (x) => x.id !== term.id && x.status !== 'rejected',
  )
  const target = candidates.find((x) => x.id === into)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`Merge “${term.form}” into another term`}</DialogTitle>
          <DialogDescription>{t`Its spellings become spellings of the term you pick, which is then accepted. “${term.form}” disappears from the lexicon.`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={ids.q}>{t`Search a term`}</Label>
            <Input id={ids.q} value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.into}>{t`Merge into`}</Label>
            <Select value={into ?? ''} onValueChange={(v) => setInto(v || null)}>
              <SelectTrigger id={ids.into}>
                <SelectValue>
                  {(v: string) => candidates.find((x) => x.id === v)?.form ?? t`Pick a term`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {candidates.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.form}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            disabled={!target || merge.isPending}
            onClick={() =>
              target &&
              void merge
                .mutateAsync({
                  studyId,
                  termId: term.id,
                  data: {
                    version: term.version,
                    into: { termId: target.id, version: target.version },
                  },
                })
                .then(() => {
                  toast.success(t`Merged into ${target.form}`)
                  onMerged()
                  onClose()
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            {t`Merge`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
