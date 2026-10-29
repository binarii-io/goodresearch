import {
  type Fact,
  type FactsTurn,
  type InterviewFacts,
  useAcceptFacts,
  useAddVerbatim,
  useAttributeSpeaker,
  useGetInterviewFacts,
  useResizeVerbatim,
  useSetVerbatimAside,
  type Verbatim,
} from '@goodresearch/api-client'
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
  LinkIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { Popover, PopoverContent, PopoverTitle } from '@goodresearch/ui/components/popover'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { Choice } from './choice.tsx'
import { FactCard, useStatement } from './fact-card.tsx'
import { FactDialog, useRefreshFacts } from './fact-dialog.tsx'
import { FindFactsOneButton } from './find-facts.tsx'
import { FACT_STATUSES, FACTS_STATES, POLARITIES, TONE_FILLS, TONES, type Tone } from './labels.ts'

const ALL = 'all'
const MIN_WORDS = 3
const MAX_WORDS = 120
type Status = 'to-decide' | 'accepted' | 'rejected' | 'all'

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const matchesStatus = (fact: Fact, status: Status) =>
  status === 'all' ||
  (status === 'to-decide' && fact.status === 'proposed') ||
  (status === 'accepted' && (fact.status === 'accepted' || fact.status === 'edited')) ||
  (status === 'rejected' && fact.status === 'rejected')

/** A highlighted place, to add as a verbatim. */
type Picked = {
  segmentId: string
  offset: number
  length: number
  text: string
  /** The one verbatim the selection falls on (narrowed to it), else null. */
  verbatimId: string | null
  /** How many verbatims the selection touches. */
  overlaps: number
  /** Where the selection is on screen now (it follows the page when it scrolls). */
  anchor: { getBoundingClientRect: () => DOMRect }
}

/** The verbatims of a turn a selection touches. */
const touched = (verbatims: readonly Verbatim[], start: number, end: number) =>
  verbatims.filter((v) => v.offset < end && v.offset + v.length > start)

/**
 * An interview's analysis (US2): the transcript with its verbatims highlighted, the facts beside
 * it. Highlighting text in an interviewee's turn adds a verbatim; each turn also offers it from the
 * keyboard.
 */
export function InterviewFactsView({
  studyId,
  sessionId,
  focus,
  running,
}: {
  studyId: string
  sessionId: string
  /** A turn to show first (from the Facts view). */
  focus: string | null
  running: boolean
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const view = useGetInterviewFacts(studyId, sessionId, { query: { refetchOnMount: 'always' } })
  const refresh = useRefreshFacts(studyId, sessionId)
  const accept = useAcceptFacts()
  const [status, setStatus] = useState<Status>('to-decide')
  const [theme, setTheme] = useState(ALL)
  const [polarity, setPolarity] = useState(ALL)
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [writing, setWriting] = useState<{ chosen: string[] } | null>(null)
  const [editing, setEditing] = useState<Fact | null>(null)
  const turnsRef = useRef<HTMLOListElement>(null)

  const showTurn = (segmentId: string) =>
    turnsRef.current
      ?.querySelector(`[data-segment="${CSS.escape(segmentId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const data = view.data
  useEffect(() => {
    if (focus && data) showTurn(focus)
  }, [focus, data])

  if (!data) return <Skeleton className="h-80 w-full" />
  const facts = data.facts.filter(
    (f) =>
      matchesStatus(f, status) &&
      (theme === ALL || (theme === 'other' ? f.theme === null : f.theme?.id === theme)) &&
      (polarity === ALL || f.polarity === polarity),
  )
  const toDecide = facts.filter((f) => f.status === 'proposed')
  const unused = data.verbatims.filter((v) => v.facts.length === 0)
  const highlighted = new Set(data.facts.find((f) => f.id === selected)?.verbatims.map((v) => v.id))
  const verbatimFacts = new Map(data.verbatims.map((v) => [v.id, v.facts]))
  const polarityOf = new Map(
    data.facts.filter((f) => f.status !== 'rejected').map((f) => [f.id, f.polarity]),
  )
  const tones = new Map(
    data.verbatims.map((v): [string, Tone] => {
      const found = new Set(v.facts.flatMap((id) => polarityOf.get(id) ?? []))
      const [only] = found
      return [v.id, found.size > 1 ? 'mixed' : (only ?? 'none')]
    }),
  )

  return (
    <div className="grid gap-4">
      <Speakers studyId={studyId} data={data} onDone={refresh} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-label={t`Transcript`} className="grid content-start gap-2">
          <p className="text-muted-foreground text-sm">
            {t`Highlight what an interviewee says to add it as a verbatim.`}
          </p>
          <ToneLegend />
          {picked ? (
            <AddPicked
              studyId={studyId}
              sessionId={sessionId}
              picked={picked}
              facts={data.facts.filter((f) => f.status !== 'rejected')}
              onClose={() => setPicked(null)}
              onAdded={(id, write) => {
                setPicked(null)
                if (write) setWriting({ chosen: [id] })
              }}
            />
          ) : null}
          {data.turns === null ? (
            <p className="text-sm">{t`This interview has no text to analyse.`}</p>
          ) : (
            <ol ref={turnsRef} className="grid gap-2">
              {data.turns.map((turn) => (
                <Turn
                  key={turn.id}
                  studyId={studyId}
                  sessionId={sessionId}
                  turn={turn}
                  verbatims={data.verbatims.filter((v) => v.segmentId === turn.id && !v.lost)}
                  highlighted={highlighted}
                  tones={tones}
                  onVerbatim={(id) => setSelected(verbatimFacts.get(id)?.[0] ?? null)}
                  onPick={setPicked}
                />
              ))}
            </ol>
          )}
        </section>
        {/* A panel of its own, as the assistant's: it stays in view while the transcript scrolls. */}
        <section
          aria-label={t`Facts`}
          className="flex flex-col overflow-hidden rounded-lg border bg-card lg:sticky lg:self-start lg:top-20 lg:max-h-[calc(100svh-6rem)]"
        >
          {/* One line: the count, the reading's cost and run, beside the facts it finds (the
              transcript does not move); the state only when it asks for something. */}
          <header className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5">
            <h2 className="font-semibold text-base">{t`Facts`}</h2>
            {/* "Faits 15 - 0,15 $": the count (shown / all when filtered), then the reading's cost. */}
            <span className="text-muted-foreground text-sm">
              {facts.length === data.facts.length ? (
                data.facts.length
              ) : (
                <span title={t`${facts.length} shown of ${data.facts.length}`}>
                  {facts.length}/{data.facts.length}
                </span>
              )}{' '}
              -{' '}
              <span title={t`Cost of the readings`}>
                <span className="sr-only">{t`Cost:`} </span>
                {data.cost === null ? '?' : money(data.cost, { narrow: true })}
              </span>
            </span>
            {data.state === 'to-analyse-again' ? (
              <Badge variant="highlight">{i18n._(FACTS_STATES[data.state])}</Badge>
            ) : null}
            <span className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setWriting({ chosen: [] })}>
                <PlusIcon aria-hidden />
                {t`New fact`}
              </Button>
              <FindFactsOneButton
                studyId={studyId}
                interview={{ sessionId, title: data.title }}
                analysed={data.state !== 'not-analysed'}
                disabled={running}
                primary
              />
            </span>
          </header>
          <div className="flex flex-wrap items-end gap-2 border-b px-4 py-3">
            <Choice
              label={t`Status`}
              value={status}
              onChange={(v) => setStatus(v as Status)}
              className="w-32"
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
              onChange={setTheme}
              className="w-40"
              options={[
                { value: ALL, label: t`All themes` },
                ...data.themes.map((x) => ({ value: x.id, label: x.title })),
                { value: 'other', label: t`Other` },
              ]}
            />
            <Choice
              label={t`Polarity`}
              value={polarity}
              onChange={setPolarity}
              className="w-32"
              options={[
                { value: ALL, label: t`All` },
                ...Object.entries(POLARITIES).map(([value, label]) => ({
                  value,
                  label: i18n._(label),
                })),
              ]}
            />
          </div>
          <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
            {facts.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t`No fact here.`}</p>
            ) : (
              <ul className="grid gap-2">
                {facts.map((f) => (
                  <li key={f.id}>
                    <FactCard
                      studyId={studyId}
                      fact={f}
                      selected={selected === f.id}
                      onSelect={() => setSelected(selected === f.id ? null : f.id)}
                      onVerbatim={(segmentId) => {
                        setSelected(f.id)
                        showTurn(segmentId)
                      }}
                      onEdit={() => setEditing(f)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {unused.length > 0 ? (
              <Unused
                studyId={studyId}
                sessionId={sessionId}
                verbatims={unused}
                onWrite={(id) => setWriting({ chosen: [id] })}
              />
            ) : null}
          </div>
          {toDecide.length > 0 ? (
            <div className="flex justify-end border-t p-3">
              <Button
                disabled={accept.isPending}
                onClick={() =>
                  void accept
                    .mutateAsync({
                      studyId,
                      data: { facts: toDecide.map((f) => ({ id: f.id, version: f.version })) },
                    })
                    .then((result) => {
                      if (result.changed > 0)
                        toast.info(
                          t`${result.changed} facts were not accepted: they changed meanwhile, or their speaker is to attribute.`,
                        )
                      return refresh()
                    })
                    .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                }
              >
                <CheckIcon aria-hidden />
                {t`Accept all shown (${toDecide.length})`}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      {writing ? (
        <FactDialog
          studyId={studyId}
          sessionId={sessionId}
          open
          onOpenChange={(open) => !open && setWriting(null)}
          verbatims={data.verbatims}
          chosen={writing.chosen}
          themes={data.themes}
        />
      ) : null}
      {editing ? (
        <FactDialog
          key={editing.id}
          studyId={studyId}
          sessionId={sessionId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          fact={editing}
          verbatims={data.verbatims}
          themes={data.themes}
        />
      ) : null}
    </div>
  )
}

/** Research R8: the speaker labels the app could not match, for a person to attribute. */
function Speakers({
  studyId,
  data,
  onDone,
}: {
  studyId: string
  data: InterviewFacts
  onDone: () => Promise<unknown>
}) {
  const { t, i18n } = useLingui()
  const attribute = useAttributeSpeaker()
  if (data.speakers.length === 0) return null
  return (
    <section aria-label={t`Who speaks`} className="grid gap-2 rounded-md border border-dashed p-3">
      <p className="flex items-center gap-2 text-sm">
        <TriangleAlertIcon aria-hidden className="size-4 text-highlight-soft-foreground" />
        {t`Say who speaks: facts count once their speakers are known.`}
      </p>
      {data.participants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t`This interview has no interviewee yet: add them in Fieldwork, on the interview.`}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        {data.speakers.map((s) => (
          <Choice
            key={s.label}
            label={s.label}
            value={s.participant ?? ''}
            className="w-48"
            onChange={(participant) =>
              void attribute
                .mutateAsync({
                  studyId,
                  sessionId: data.sessionId,
                  data: { label: s.label, participant },
                })
                .then(onDone)
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
            options={[
              ...(s.participant ? [] : [{ value: '', label: t`To attribute` }]),
              ...data.participants.map((p) => ({ value: p.code, label: p.label })),
              { value: 'interviewer', label: t`An interviewer` },
            ]}
          />
        ))}
      </div>
    </section>
  )
}

/** A turn's start as the prototype shows it: "7:50", "1:02:05". */
const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** What the colours of the verbatims mean (never colour alone: each mark also says it). */
function ToneLegend() {
  const { t, i18n } = useLingui()
  return (
    <ul aria-label={t`Colours of the verbatims`} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {(['positive', 'negative', 'neutral', 'mixed', 'none'] as const).map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-3 rounded-sm ${TONE_FILLS[tone]}`} />
          {i18n._(TONES[tone])}
        </li>
      ))}
    </ul>
  )
}

/** One turn, its verbatims marked in place (with a text label, never colour alone). */
function Turn({
  studyId,
  sessionId,
  turn,
  verbatims,
  highlighted,
  tones,
  onVerbatim,
  onPick,
}: {
  studyId: string
  sessionId: string
  turn: FactsTurn
  verbatims: readonly Verbatim[]
  highlighted: ReadonlySet<string>
  tones: ReadonlyMap<string, Tone>
  onVerbatim: (id: string) => void
  onPick: (picked: Picked) => void
}) {
  const { t, i18n } = useLingui()
  const textRef = useRef<HTMLParagraphElement>(null)
  const [keyboard, setKeyboard] = useState(false)
  const speaks = turn.role !== 'interviewer'
  const parts: { text: string; verbatim: Verbatim | null }[] = []
  let at = 0
  for (const v of [...verbatims].sort((a, b) => a.offset - b.offset)) {
    if (v.offset < at) continue
    if (v.offset > at) parts.push({ text: turn.text.slice(at, v.offset), verbatim: null })
    parts.push({ text: turn.text.slice(v.offset, v.offset + v.length), verbatim: v })
    at = v.offset + v.length
  }
  if (at < turn.text.length) parts.push({ text: turn.text.slice(at), verbatim: null })

  // The selection's place in the turn's text: the turn's own text before it, labels left out.
  useEffect(() => {
    const element = textRef.current
    if (!speaks || !element) return
    const textBefore = (container: Node, offset: number) => {
      let length = 0
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const skipped = node.parentElement?.closest('[data-label]') !== null
        if (node === container) return length + (skipped ? 0 : offset)
        if (!skipped) length += node.textContent?.length ?? 0
      }
      return length
    }
    const onMouseUp = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return
      const range = selection.getRangeAt(0)
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return
      const kept = range.cloneRange()
      const start = textBefore(range.startContainer, range.startOffset)
      const end = textBefore(range.endContainer, range.endOffset)
      const raw = turn.text.slice(start, end)
      const lead = raw.length - raw.trimStart().length
      const text = raw.trim()
      if (!text) return
      const hits = touched(verbatims, start + lead, start + lead + text.length)
      onPick({
        segmentId: turn.id,
        offset: start + lead,
        length: text.length,
        text,
        verbatimId: hits.length === 1 ? (hits[0]?.id ?? null) : null,
        overlaps: hits.length,
        anchor: { getBoundingClientRect: () => kept.getBoundingClientRect() },
      })
    }
    element.addEventListener('mouseup', onMouseUp)
    return () => element.removeEventListener('mouseup', onMouseUp)
  }, [speaks, turn.id, turn.text, verbatims, onPick])

  const role =
    turn.role === 'interviewer'
      ? t`interviewer`
      : turn.role === 'interviewee'
        ? t`interviewee`
        : t`speaker to attribute`
  return (
    <li data-segment={turn.id} className="group grid grid-cols-[3.5rem_1fr_auto] gap-x-3">
      <span className="pt-0.5 text-muted-foreground text-xs tabular-nums">
        {turn.start !== null ? clock(turn.start) : null}
      </span>
      <p
        ref={textRef}
        className={`text-sm leading-relaxed ${speaks ? '' : 'text-muted-foreground'}`}
      >
        {/* Left out of a selection's place (data-label), as the marks' labels. */}
        <span
          data-label
          title={role}
          className={`font-semibold ${turn.role === 'interviewee' ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {turn.speaker ?? t`No speaker`}
          <span className="sr-only"> ({role})</span>
          {turn.role === 'unknown' ? (
            <Badge variant="outline" className="ml-1.5 align-middle">
              {role}
            </Badge>
          ) : null}
          {' : '}
        </span>
        {parts.map((p, i) => {
          if (!p.verbatim) return <span key={i}>{p.text}</span>
          const tone = tones.get(p.verbatim.id) ?? 'none'
          const toneLabel = i18n._(TONES[tone])
          return (
            <mark key={i} className="rounded-sm bg-transparent p-0">
              {/* biome-ignore lint/a11y/useSemanticElements: a <button>'s words cannot be selected, and a person selects some of them to narrow the verbatim. */}
              <span
                role="button"
                tabIndex={0}
                title={toneLabel}
                className={`cursor-pointer rounded-sm px-0.5 text-left text-foreground underline decoration-foreground/40 decoration-dashed underline-offset-4 ${TONE_FILLS[tone]} ${
                  highlighted.has(p.verbatim.id) ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => {
                  // A drag selects words; only a plain click shows the verbatim's facts.
                  if (window.getSelection()?.isCollapsed === false) return
                  if (p.verbatim) onVerbatim(p.verbatim.id)
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  if (p.verbatim) onVerbatim(p.verbatim.id)
                }}
              >
                <span data-label className="sr-only">
                  {t`verbatim, ${toneLabel}:`}{' '}
                </span>
                {p.text}
              </span>
            </mark>
          )
        })}
      </p>
      {speaks ? (
        <Button
          variant="ghost"
          size="xs"
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t`Add a verbatim from this turn`}
          onClick={() => setKeyboard(true)}
        >
          <PlusIcon aria-hidden />
        </Button>
      ) : (
        <span />
      )}
      {keyboard ? (
        <PickFromTurn
          studyId={studyId}
          sessionId={sessionId}
          turn={turn}
          verbatims={verbatims}
          onClose={() => setKeyboard(false)}
        />
      ) : null}
    </li>
  )
}

/** The highlighted text, kept as a verbatim (and a fact written from it, if asked). */
function AddPicked({
  studyId,
  sessionId,
  picked,
  facts,
  onClose,
  onAdded,
}: {
  studyId: string
  sessionId: string
  picked: Picked
  /** The interview's facts a verbatim can support (not rejected). */
  facts: readonly Fact[]
  onClose: () => void
  onAdded: (id: string, write: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const statementOf = useStatement()
  const [choosing, setChoosing] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const add = useAddVerbatim()
  const resize = useResizeVerbatim()
  const refresh = useRefreshFacts(studyId, sessionId)
  const count = wordCount(picked.text)
  const fits = count >= MIN_WORDS && count <= MAX_WORDS
  const save = (write: boolean) =>
    void add
      .mutateAsync({
        studyId,
        sessionId,
        data: { segmentId: picked.segmentId, offset: picked.offset, length: picked.length },
      })
      .then(async (created) => {
        await refresh()
        onAdded(created.id, write)
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const addTo = (fact: Fact) =>
    void add
      .mutateAsync({
        studyId,
        sessionId,
        data: {
          segmentId: picked.segmentId,
          offset: picked.offset,
          length: picked.length,
          fact: { id: fact.id, version: fact.version },
        },
      })
      .then(async () => {
        await refresh()
        onClose()
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const narrow = (verbatimId: string) =>
    void resize
      .mutateAsync({
        studyId,
        sessionId,
        verbatimId,
        data: { segmentId: picked.segmentId, offset: picked.offset, length: picked.length },
      })
      .then(async () => {
        await refresh()
        onClose()
      })
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        // The click ending a new selection is not a dismissal: that selection replaces this one.
        const selecting = window.getSelection()?.isCollapsed === false
        if (!open && !(details.reason === 'outside-press' && selecting)) onClose()
      }}
    >
      <PopoverContent ref={panel} anchor={picked.anchor} side="bottom" align="start">
        <PopoverTitle className="text-muted-foreground text-xs">
          {picked.verbatimId ? t`Narrow this verbatim` : t`New verbatim`} · {t`${count} words`}
        </PopoverTitle>
        <p className="line-clamp-3 italic">« {picked.text} »</p>
        {fits ? null : (
          <p className="text-muted-foreground text-xs">{t`A verbatim has 3 to 120 words.`}</p>
        )}
        {picked.overlaps > 1 ? (
          <p className="text-muted-foreground text-xs">{t`The selection covers several verbatims: select words within one of them.`}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {picked.verbatimId ? (
            <Button
              size="sm"
              disabled={!fits || resize.isPending}
              onClick={() => picked.verbatimId && narrow(picked.verbatimId)}
            >
              <CheckIcon aria-hidden />
              {t`Narrow the verbatim to this selection`}
            </Button>
          ) : null}
          {picked.overlaps === 0 ? (
            <>
              <Button size="sm" disabled={!fits || add.isPending} onClick={() => save(true)}>
                <ArrowRightIcon aria-hidden />
                {t`Add and write a fact`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!fits || add.isPending}
                onClick={() => save(false)}
              >
                <PlusIcon aria-hidden />
                {t`Add the verbatim`}
              </Button>
              {facts.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!fits || add.isPending}
                  aria-expanded={choosing}
                  onClick={() => setChoosing(true)}
                >
                  <LinkIcon aria-hidden />
                  {t`Add to a fact`}
                </Button>
              ) : null}
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t`Cancel`}
          </Button>
        </div>
        {/* A second panel beside this one, so this one stays where the eyes are. Nested in it:
            a click in the facts is not a click outside the first panel. */}
        <Popover open={choosing && fits} onOpenChange={(open) => !open && setChoosing(false)}>
          <PopoverContent anchor={panel} side="right" align="start" sideOffset={8}>
            <PopoverTitle className="text-muted-foreground text-xs">{t`Facts of this interview`}</PopoverTitle>
            <ul className="grid max-h-72 gap-1 overflow-y-auto">
              {facts.map((fact) => (
                <li key={fact.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto w-full justify-start whitespace-normal py-1.5 text-left"
                    disabled={add.isPending}
                    onClick={() => addTo(fact)}
                  >
                    <span className="grid gap-0.5">
                      <span>{statementOf(fact).text}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <span
                          className={`rounded-sm px-1.5 text-foreground ${TONE_FILLS[fact.polarity]}`}
                        >
                          {i18n._(POLARITIES[fact.polarity])}
                        </span>
                        {i18n._(FACT_STATUSES[fact.status])}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </PopoverContent>
    </Popover>
  )
}

/** The keyboard way to add a verbatim: select it in the turn's text, then add it. */
function PickFromTurn({
  studyId,
  sessionId,
  turn,
  verbatims,
  onClose,
}: {
  studyId: string
  sessionId: string
  turn: FactsTurn
  verbatims: readonly Verbatim[]
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const id = useId()
  const add = useAddVerbatim()
  const resize = useResizeVerbatim()
  const refresh = useRefreshFacts(studyId, sessionId)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const text = range ? turn.text.slice(range.start, range.end) : ''
  const lead = text.length - text.trimStart().length
  const count = wordCount(text)
  const fits = count >= MIN_WORDS && count <= MAX_WORDS
  const place = range ? { offset: range.start + lead, length: text.trim().length } : null
  const hits = place ? touched(verbatims, place.offset, place.offset + place.length) : []
  const done = (saving: Promise<unknown>) =>
    void saving
      .then(refresh)
      .then(onClose)
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const track = (e: { currentTarget: HTMLTextAreaElement }) =>
    setRange({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t`Add a verbatim`}</DialogTitle>
          <DialogDescription>{t`Select the words of the verbatim in the turn (3 to 120 words), then add it.`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <Label htmlFor={id}>{turn.speaker ?? t`No speaker`}</Label>
          <Textarea
            id={id}
            readOnly
            rows={6}
            value={turn.text}
            onSelect={track}
            onKeyUp={track}
            onMouseUp={track}
          />
        </div>
        {text.trim() ? <p className="text-sm">« {text.trim()} »</p> : null}
        {hits.length > 1 ? (
          <p className="text-muted-foreground text-xs">{t`The selection covers several verbatims: select words within one of them.`}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t`Cancel`}
          </Button>
          {hits.length === 1 ? (
            <Button
              disabled={!place || !fits || resize.isPending}
              onClick={() =>
                place &&
                hits[0] &&
                done(
                  resize.mutateAsync({
                    studyId,
                    sessionId,
                    verbatimId: hits[0].id,
                    data: { segmentId: turn.id, ...place },
                  }),
                )
              }
            >
              {t`Narrow the verbatim to this selection`}
            </Button>
          ) : (
            <Button
              disabled={!place || !fits || hits.length > 0 || add.isPending}
              onClick={() =>
                place &&
                done(
                  add.mutateAsync({ studyId, sessionId, data: { segmentId: turn.id, ...place } }),
                )
              }
            >
              {t`Add the verbatim`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Verbatims no fact uses: write a fact from one, or set it aside (never proposed again). */
function Unused({
  studyId,
  sessionId,
  verbatims,
  onWrite,
}: {
  studyId: string
  sessionId: string
  verbatims: readonly Verbatim[]
  onWrite: (id: string) => void
}) {
  const { t, i18n } = useLingui()
  const aside = useSetVerbatimAside()
  const refresh = useRefreshFacts(studyId, sessionId)
  return (
    <section aria-label={t`Verbatims without a fact`} className="grid gap-2">
      <h3 className="font-medium text-sm">{t`Verbatims without a fact (${verbatims.length})`}</h3>
      <ul className="grid gap-2">
        {verbatims.map((v) => (
          <li key={v.id} className="grid gap-1 rounded-md border p-2">
            <p className="text-muted-foreground text-sm">
              « {v.text} »{v.lost ? ` ${t`(no longer in the text)`}` : ''}
            </p>
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="outline" onClick={() => onWrite(v.id)}>
                <PlusIcon aria-hidden />
                {t`Write a fact`}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={aside.isPending}
                onClick={() =>
                  void aside
                    .mutateAsync({ studyId, sessionId, verbatimId: v.id })
                    .then(refresh)
                    .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                }
              >
                <Trash2Icon aria-hidden />
                {t`Set aside`}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
