import {
  getGetInterviewGuideQueryKey,
  type InterviewGuide,
  useSaveInterviewGuide,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import type { GuideLike } from './guide-view.tsx'
import { SECTION_KINDS, type SectionKind } from './labels.ts'

type DraftQuestion = { key: string; id?: string; text: string; followUps: string }
type DraftSection = {
  key: string
  id?: string
  kind: SectionKind
  title: string
  minutes: string
  questions: DraftQuestion[]
}
type Draft = {
  objectives: string
  hypotheses: string
  audience: string
  format: string
  sections: DraftSection[]
}

const key = () => crypto.randomUUID()
const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const toDraft = (guide: GuideLike): Draft => ({
  objectives: guide.framing.objectives,
  hypotheses: guide.framing.hypotheses.join('\n'),
  audience: guide.framing.audience,
  format: guide.framing.format,
  sections: guide.sections.map((s) => ({
    key: key(),
    ...(s.id ? { id: s.id } : {}),
    kind: s.kind,
    title: s.title,
    minutes: String(s.minutes),
    questions: s.questions.map((q) => ({
      key: key(),
      ...(q.id ? { id: q.id } : {}),
      text: q.text,
      followUps: q.followUps.join('\n'),
    })),
  })),
})

const fromDraft = (d: Draft) => ({
  framing: {
    objectives: d.objectives.trim(),
    hypotheses: lines(d.hypotheses),
    audience: d.audience.trim(),
    format: d.format.trim(),
  },
  sections: d.sections.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    kind: s.kind,
    title: s.title.trim(),
    minutes: Number(s.minutes),
    questions: s.questions.map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      text: q.text.trim(),
      followUps: lines(q.followUps),
    })),
  })),
})

/** The four phases, for "Write it myself" (US3). */
export const useEmptyGuide = (): GuideLike => {
  const { t } = useLingui()
  return {
    framing: { objectives: '', hypotheses: [], audience: '', format: '' },
    sections: [
      { kind: 'introduction', title: t`Introduction`, minutes: 5, questions: [] },
      { kind: 'warm-up', title: t`About you`, minutes: 10, questions: [] },
      { kind: 'theme', title: t`Theme 1`, minutes: 30, questions: [] },
      { kind: 'wrap-up', title: t`Wrap-up`, minutes: 5, questions: [] },
    ],
  }
}

const move = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

/**
 * Edits the whole guide by hand (US3). Saved against the version seen; known question ids are
 * sent back so they are kept (research R4).
 */
export function GuideEditor({
  studyId,
  guide,
  start,
  onDone,
}: {
  studyId: string
  /** The saved guide, or `null` to start from `start`. */
  guide: InterviewGuide | null
  start: GuideLike
  onDone: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const save = useSaveInterviewGuide()
  const [draft, setDraft] = useState<Draft>(() => toDraft(guide?.content ?? start))
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { objectives: useId(), hypotheses: useId(), audience: useId(), format: useId() }
  const errorId = useId()

  const setSection = (index: number, change: Partial<DraftSection>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === index ? { ...s, ...change } : s)),
    }))
  const setQuestion = (si: number, qi: number, change: Partial<DraftQuestion>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === si
          ? { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...change } : q)) }
          : s,
      ),
    }))

  const check = (): string | null => {
    if (draft.sections.length === 0) return t`Keep at least one section.`
    for (const s of draft.sections) {
      const minutes = Number(s.minutes)
      if (!s.title.trim()) return t`Every section needs a title.`
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)
        return t`Durations are whole minutes from 1 to 180.`
      if (s.questions.some((q) => !q.text.trim())) return t`Remove or fill in the empty questions.`
    }
    if (draft.sections.reduce((n, s) => n + s.questions.length, 0) > 60)
      return t`At most 60 main questions.`
    const hypotheses = lines(draft.hypotheses)
    if (hypotheses.length > 15) return t`At most 15 hypotheses.`
    if (hypotheses.some((h) => h.length > 600)) return t`A hypothesis has more than 600 characters.`
    for (const s of draft.sections)
      for (const q of s.questions) {
        const followUps = lines(q.followUps)
        if (followUps.length > 8) return t`At most 8 follow-ups per question.`
        if (followUps.some((f) => f.length > 600))
          return t`A follow-up has more than 600 characters.`
      }
    return null
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = check()
    setProblem(found)
    if (found) return
    await save.mutateAsync({
      studyId,
      data: { content: fromDraft(draft), version: guide?.version ?? null },
    })
    await queryClient.invalidateQueries({ queryKey: getGetInterviewGuideQueryKey(studyId) })
    onDone()
  }

  return (
    <form
      className="grid gap-5"
      noValidate
      aria-label={t`Edit the interview guide`}
      onSubmit={(e) => void submit(e).catch(() => undefined)}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Framing`}</legend>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.objectives}>{t`Objectives and research themes`}</Label>
          <Textarea
            id={ids.objectives}
            value={draft.objectives}
            maxLength={4000}
            onChange={(e) => setDraft({ ...draft, objectives: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.hypotheses}>{t`Hypotheses (one per line)`}</Label>
          <Textarea
            id={ids.hypotheses}
            value={draft.hypotheses}
            onChange={(e) => setDraft({ ...draft, hypotheses: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.audience}>{t`Audience and recruitment`}</Label>
          <Textarea
            id={ids.audience}
            value={draft.audience}
            maxLength={4000}
            onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.format}>{t`Format and logistics`}</Label>
          <Textarea
            id={ids.format}
            value={draft.format}
            maxLength={4000}
            onChange={(e) => setDraft({ ...draft, format: e.target.value })}
          />
        </div>
      </fieldset>

      {draft.sections.map((s, si) => (
        <fieldset key={s.key} className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 font-semibold">{t`Section ${si + 1}`}</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_7rem]">
            <div className="grid gap-1.5">
              <Label htmlFor={`${s.key}-title`}>{t`Title`}</Label>
              <Input
                id={`${s.key}-title`}
                value={s.title}
                maxLength={120}
                onChange={(e) => setSection(si, { title: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label id={`${s.key}-kind`}>{t`Kind`}</Label>
              <Select
                value={s.kind}
                onValueChange={(value) => value && setSection(si, { kind: value as SectionKind })}
              >
                <SelectTrigger aria-labelledby={`${s.key}-kind`}>
                  <SelectValue>{(value: SectionKind) => i18n._(SECTION_KINDS[value])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SECTION_KINDS) as SectionKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {i18n._(SECTION_KINDS[kind])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${s.key}-minutes`}>{t`Minutes`}</Label>
              <Input
                id={`${s.key}-minutes`}
                type="number"
                min={1}
                max={180}
                value={s.minutes}
                onChange={(e) => setSection(si, { minutes: e.target.value })}
              />
            </div>
          </div>

          {s.questions.map((q, qi) => (
            <div key={q.key} className="grid gap-2 rounded-md bg-muted/50 p-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor={`${q.key}-text`}>{t`Question ${qi + 1}`}</Label>
                <Textarea
                  id={`${q.key}-text`}
                  value={q.text}
                  maxLength={600}
                  rows={2}
                  onChange={(e) => setQuestion(si, qi, { text: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${q.key}-follow`}>{t`Follow-ups (one per line)`}</Label>
                <Textarea
                  id={`${q.key}-follow`}
                  value={q.followUps}
                  rows={2}
                  onChange={(e) => setQuestion(si, qi, { followUps: e.target.value })}
                />
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Move question ${qi + 1} up`}
                  disabled={qi === 0}
                  onClick={() => setSection(si, { questions: move(s.questions, qi, qi - 1) })}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Move question ${qi + 1} down`}
                  disabled={qi === s.questions.length - 1}
                  onClick={() => setSection(si, { questions: move(s.questions, qi, qi + 1) })}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Remove question ${qi + 1}`}
                  onClick={() =>
                    setSection(si, { questions: s.questions.filter((_, j) => j !== qi) })
                  }
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSection(si, {
                  questions: [...s.questions, { key: key(), text: '', followUps: '' }],
                })
              }
            >
              <PlusIcon aria-hidden />
              {t`Add a question`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={si === 0}
              onClick={() => setDraft({ ...draft, sections: move(draft.sections, si, si - 1) })}
            >
              <ArrowUpIcon aria-hidden />
              {t`Move section up`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={si === draft.sections.length - 1}
              onClick={() => setDraft({ ...draft, sections: move(draft.sections, si, si + 1) })}
            >
              <ArrowDownIcon aria-hidden />
              {t`Move section down`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== si) })
              }
            >
              <Trash2Icon aria-hidden />
              {t`Remove section`}
            </Button>
          </div>
        </fieldset>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          disabled={draft.sections.length >= 12}
          onClick={() => {
            // Before the wrap-up when there is one.
            const at = draft.sections.findLastIndex((s) => s.kind === 'wrap-up')
            const theme: DraftSection = {
              key: key(),
              kind: 'theme',
              title: t`New theme`,
              minutes: '10',
              questions: [],
            }
            const sections = [...draft.sections]
            sections.splice(at >= 0 ? at : sections.length, 0, theme)
            setDraft({ ...draft, sections })
          }}
        >
          <PlusIcon aria-hidden />
          {t`Add a theme section`}
        </Button>
      </div>

      {problem || save.isError ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {problem ?? errorMessage(i18n, save.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t`Save the guide`}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t`Cancel`}
        </Button>
      </div>
    </form>
  )
}
