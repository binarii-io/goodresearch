import {
  getGetQuestionnaireQueryKey,
  type Questionnaire,
  useSaveQuestionnaire,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
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
import { normalise } from '../../app/i18n.ts'
import { errorMessage } from '../workspace/errors.ts'
import {
  ITEM_KINDS,
  ITEM_MEASURES,
  type ItemKind,
  QUESTIONNAIRE_SECTION_KINDS,
  type QuestionnaireSectionKind,
  RECRUITMENTS,
} from './labels.ts'
import type { QuestionnaireLike } from './questionnaire-view.tsx'

type DraftItem = {
  key: string
  id?: string
  kind: ItemKind
  text: string
  measure: 'factual' | 'subjective'
  required: boolean
  subTheme: string
  contact: boolean
  points: 5 | 7
  lowLabel: string
  highLabel: string
  options: string
  ordered: boolean
}
type DraftSection = {
  key: string
  id?: string
  kind: QuestionnaireSectionKind
  title: string
  items: DraftItem[]
}
type Framing = QuestionnaireLike['framing']
type Draft = Omit<Framing, 'hypotheses' | 'targetResponses'> & {
  hypotheses: string
  targetResponses: string
  sections: DraftSection[]
}

const key = () => crypto.randomUUID()
const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const move = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

const toDraft = (q: QuestionnaireLike, low: string, high: string): Draft => ({
  ...q.framing,
  hypotheses: q.framing.hypotheses.join('\n'),
  targetResponses: q.framing.targetResponses === null ? '' : String(q.framing.targetResponses),
  sections: q.sections.map((s) => ({
    key: key(),
    ...(s.id ? { id: s.id } : {}),
    kind: s.kind,
    title: s.title,
    items: s.items.map((i) => ({
      key: key(),
      ...(i.id ? { id: i.id } : {}),
      kind: i.kind,
      text: i.text,
      measure: i.measure,
      required: i.required,
      subTheme: i.subTheme ?? '',
      contact: i.contact,
      points: i.kind === 'likert' ? i.points : 7,
      lowLabel: i.kind === 'likert' ? i.lowLabel : low,
      highLabel: i.kind === 'likert' ? i.highLabel : high,
      options:
        i.kind === 'single-choice' || i.kind === 'multiple-choice' ? i.options.join('\n') : '',
      ordered: i.kind === 'single-choice' || i.kind === 'multiple-choice' ? i.ordered : false,
    })),
  })),
})

const fromDraft = (d: Draft) => {
  const { hypotheses, targetResponses, sections, ...framing } = d
  return {
    framing: {
      ...framing,
      objective: d.objective.trim(),
      audience: d.audience.trim(),
      administration: d.administration.trim(),
      targetReason: d.targetReason.trim(),
      consent: d.consent.trim(),
      thanks: d.thanks.trim(),
      hypotheses: lines(hypotheses),
      targetResponses: targetResponses.trim() ? Number(targetResponses) : null,
    },
    sections: sections.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      kind: s.kind,
      title: s.title.trim(),
      items: s.items.map((i) => {
        const common = {
          ...(i.id ? { id: i.id } : {}),
          text: i.text.trim(),
          measure: i.measure,
          required: i.required,
          subTheme: s.kind === 'theme' && i.subTheme.trim() ? i.subTheme.trim() : null,
          contact: i.contact,
        }
        if (i.kind === 'open') return { ...common, kind: i.kind }
        if (i.kind === 'likert')
          return {
            ...common,
            kind: i.kind,
            points: i.points,
            lowLabel: i.lowLabel.trim(),
            highLabel: i.highLabel.trim(),
          }
        return { ...common, kind: i.kind, options: lines(i.options), ordered: i.ordered }
      }),
    })),
  }
}

/** "Write it myself" (US3): the default consent and thanks, in the interface language. */
export const useEmptyQuestionnaire = (): QuestionnaireLike => {
  const { t, i18n } = useLingui()
  return {
    framing: {
      objective: '',
      hypotheses: [],
      audience: '',
      recruitment: 'targeted',
      administration: '',
      targetResponses: null,
      targetReason: '',
      language: normalise(i18n.locale),
      consent: t`We are studying [objective]. This questionnaire takes about [length] minutes: [format]. Your answers are anonymous and are only used for this research. There is no right or wrong answer. Taking part is your free choice. [Announce any sensitive theme here: health, lived experience, personal habits.]`,
      thanks: t`Thank you for taking part.`,
      shuffle: true,
    },
    sections: [
      { kind: 'profiling', title: t`About you`, items: [] },
      { kind: 'theme', title: t`Theme 1`, items: [] },
    ],
  }
}

/** Edits the whole questionnaire by hand (US3), against the version seen; known ids are kept. */
export function QuestionnaireEditor({
  studyId,
  questionnaire,
  start,
  onDone,
}: {
  studyId: string
  questionnaire: Questionnaire | null
  start: QuestionnaireLike
  onDone: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const save = useSaveQuestionnaire()
  const low = t`Strongly disagree`
  const high = t`Strongly agree`
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(questionnaire?.content ?? start, low, high),
  )
  // Problems next to their field (US3 scenario 4), by the key of the field.
  const [problems, setProblems] = useState<Record<string, string>>({})
  const id = useId()
  const errorId = useId()

  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }))
  const setSection = (index: number, change: Partial<DraftSection>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === index ? { ...s, ...change } : s)),
    }))
  const setItem = (si: number, ii: number, change: Partial<DraftItem>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === si ? { ...s, items: s.items.map((x, j) => (j === ii ? { ...x, ...change } : x)) } : s,
      ),
    }))
  const newItem = (over: Partial<DraftItem> = {}): DraftItem => ({
    key: key(),
    kind: 'likert',
    text: '',
    measure: 'subjective',
    required: true,
    subTheme: '',
    contact: false,
    points: 7,
    lowLabel: low,
    highLabel: high,
    options: '',
    ordered: false,
    ...over,
  })

  const check = (): Record<string, string> => {
    const found: Record<string, string> = {}
    if (!draft.consent.trim()) found.consent = t`The consent text cannot be empty.`
    if (!draft.thanks.trim()) found.thanks = t`The thanks cannot be empty.`
    const target = draft.targetResponses.trim()
    if (target && (!Number.isInteger(Number(target)) || Number(target) < 1))
      found.target = t`Enter a whole number, or leave it empty.`
    const hypotheses = lines(draft.hypotheses)
    if (hypotheses.length > 15 || hypotheses.some((h) => h.length > 600))
      found.hypotheses = t`At most 15 hypotheses of 600 characters.`
    if (!draft.sections.some((s) => s.kind === 'theme' && s.items.length > 0))
      found.form = t`Add at least one item to a theme section.`
    if (draft.sections.reduce((n, s) => n + s.items.length, 0) > 80)
      found.form = t`At most 80 items.`
    for (const s of draft.sections) {
      if (!s.title.trim()) found[s.key] = t`Every section needs a title.`
      for (const i of s.items) {
        if (!i.text.trim()) found[i.key] = t`Fill in this item, or remove it.`
        else if (i.kind === 'likert' && (!i.lowLabel.trim() || !i.highLabel.trim()))
          found[i.key] = t`A scale needs its two end labels.`
        else if (i.kind !== 'likert' && i.kind !== 'open') {
          const options = lines(i.options)
          if (options.length < 2 || options.length > 20)
            found[i.key] = t`A choice needs 2 to 20 options.`
          else if (new Set(options).size !== options.length)
            found[i.key] = t`Two options are identical.`
          else if (options.some((o) => o.length > 600))
            found[i.key] = t`An option has more than 600 characters.`
        }
      }
    }
    return found
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = check()
    setProblems(found)
    if (Object.keys(found).length) return
    await save.mutateAsync({
      studyId,
      data: { content: fromDraft(draft), version: questionnaire?.version ?? null },
    })
    await queryClient.invalidateQueries({ queryKey: getGetQuestionnaireQueryKey(studyId) })
    onDone()
  }

  const problem = (name: string) =>
    problems[name] ? (
      <p id={`${id}-${name}`} role="alert" className="text-destructive text-sm">
        {problems[name]}
      </p>
    ) : null
  const area = (name: keyof Draft, label: string, invalid?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${name}`}>{label}</Label>
      <Textarea
        id={`${id}-${name}`}
        value={draft[name] as string}
        maxLength={4000}
        aria-invalid={invalid && problems[invalid] ? true : undefined}
        onChange={(e) => set({ [name]: e.target.value } as Partial<Draft>)}
      />
      {invalid ? problem(invalid) : null}
    </div>
  )
  const hasContact = draft.sections.some((s) => s.items.some((i) => i.contact))

  return (
    <form
      className="grid gap-5"
      noValidate
      aria-label={t`Edit the questionnaire`}
      onSubmit={(e) => void submit(e).catch(() => undefined)}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Framing`}</legend>
        {area('objective', t`Objective`)}
        {area('hypotheses', t`Hypotheses (one per line)`, 'hypotheses')}
        {area('audience', t`Target audience`)}
        <div className="grid gap-1.5">
          <Label id={`${id}-recruitment`}>{t`Recruitment`}</Label>
          <Select
            value={draft.recruitment}
            onValueChange={(value) => value && set({ recruitment: value as Draft['recruitment'] })}
          >
            <SelectTrigger aria-labelledby={`${id}-recruitment`}>
              <SelectValue>
                {(value: Draft['recruitment']) => i18n._(RECRUITMENTS[value])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RECRUITMENTS) as Draft['recruitment'][]).map((value) => (
                <SelectItem key={value} value={value}>
                  {i18n._(RECRUITMENTS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {area('administration', t`Administration`)}
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-target`}>{t`Target number of responses`}</Label>
            <Input
              id={`${id}-target`}
              type="number"
              min={1}
              value={draft.targetResponses}
              aria-invalid={problems.target ? true : undefined}
              onChange={(e) => set({ targetResponses: e.target.value })}
            />
            {problem('target')}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-reason`}>{t`Why this number`}</Label>
            <Input
              id={`${id}-reason`}
              value={draft.targetReason}
              maxLength={4000}
              onChange={(e) => set({ targetReason: e.target.value })}
            />
          </div>
        </div>
        {area('consent', t`Consent text`, 'consent')}
        {area('thanks', t`Thanks`, 'thanks')}
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-shuffle`}
            checked={draft.shuffle}
            onCheckedChange={(checked) => set({ shuffle: checked === true })}
          />
          <Label htmlFor={`${id}-shuffle`}>{t`Shuffle the scales of each theme`}</Label>
        </div>
        <p className="text-muted-foreground text-sm">{t`Consecutive scales sharing a legend are then published as one grid, with its rows in a random order. A grid is less comfortable on a phone: without it, each scale stays on its own, in a fixed order.`}</p>
      </fieldset>

      {draft.sections.map((s, si) => (
        <fieldset key={s.key} className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 font-semibold">{t`Section ${si + 1}`}</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="grid gap-1.5">
              <Label htmlFor={`${s.key}-title`}>{t`Title`}</Label>
              <Input
                id={`${s.key}-title`}
                value={s.title}
                maxLength={120}
                aria-invalid={problems[s.key] ? true : undefined}
                onChange={(e) => setSection(si, { title: e.target.value })}
              />
              {problem(s.key)}
            </div>
            <div className="grid gap-1.5">
              <Label id={`${s.key}-kind`}>{t`Kind`}</Label>
              <Select
                value={s.kind}
                onValueChange={(value) =>
                  value && setSection(si, { kind: value as QuestionnaireSectionKind })
                }
              >
                <SelectTrigger aria-labelledby={`${s.key}-kind`}>
                  <SelectValue>
                    {(value: QuestionnaireSectionKind) =>
                      i18n._(QUESTIONNAIRE_SECTION_KINDS[value])
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUESTIONNAIRE_SECTION_KINDS) as QuestionnaireSectionKind[]).map(
                    (kind) => (
                      <SelectItem key={kind} value={kind}>
                        {i18n._(QUESTIONNAIRE_SECTION_KINDS[kind])}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {s.items.map((item, ii) => (
            <div key={item.key} className="grid gap-2 rounded-md bg-muted/50 p-2.5">
              <div className="grid gap-1.5">
                <Label htmlFor={`${item.key}-text`}>{t`Item ${ii + 1}`}</Label>
                <Textarea
                  id={`${item.key}-text`}
                  value={item.text}
                  maxLength={600}
                  rows={2}
                  aria-invalid={problems[item.key] ? true : undefined}
                  onChange={(e) => setItem(si, ii, { text: e.target.value })}
                />
                {problem(item.key)}
              </div>
              {item.contact ? (
                <p className="text-muted-foreground text-sm">{t`Contact item: optional, never imported by the app. Deleting the addresses in the form and its spreadsheet is up to your team.`}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label id={`${item.key}-kind`}>{t`Kind`}</Label>
                    <Select
                      value={item.kind}
                      onValueChange={(value) =>
                        value && setItem(si, ii, { kind: value as ItemKind })
                      }
                    >
                      <SelectTrigger aria-labelledby={`${item.key}-kind`}>
                        <SelectValue>{(value: ItemKind) => i18n._(ITEM_KINDS[value])}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ITEM_KINDS) as ItemKind[]).map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {i18n._(ITEM_KINDS[kind])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label id={`${item.key}-measure`}>{t`What it measures`}</Label>
                    <Select
                      value={item.measure}
                      onValueChange={(value) =>
                        value && setItem(si, ii, { measure: value as DraftItem['measure'] })
                      }
                    >
                      <SelectTrigger aria-labelledby={`${item.key}-measure`}>
                        <SelectValue>
                          {(value: DraftItem['measure']) => i18n._(ITEM_MEASURES[value])}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ITEM_MEASURES) as DraftItem['measure'][]).map((measure) => (
                          <SelectItem key={measure} value={measure}>
                            {i18n._(ITEM_MEASURES[measure])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {item.kind === 'likert' ? (
                <div className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr]">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${item.key}-points`}>{t`Points`}</Label>
                    <Input
                      id={`${item.key}-points`}
                      type="number"
                      min={5}
                      max={7}
                      step={2}
                      value={item.points}
                      onChange={(e) =>
                        setItem(si, ii, { points: Number(e.target.value) === 5 ? 5 : 7 })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${item.key}-low`}>{t`Label of the lowest point`}</Label>
                    <Input
                      id={`${item.key}-low`}
                      value={item.lowLabel}
                      maxLength={120}
                      onChange={(e) => setItem(si, ii, { lowLabel: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${item.key}-high`}>{t`Label of the highest point`}</Label>
                    <Input
                      id={`${item.key}-high`}
                      value={item.highLabel}
                      maxLength={120}
                      onChange={(e) => setItem(si, ii, { highLabel: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
              {item.kind === 'single-choice' || item.kind === 'multiple-choice' ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${item.key}-options`}>{t`Options (one per line)`}</Label>
                    <Textarea
                      id={`${item.key}-options`}
                      value={item.options}
                      rows={3}
                      onChange={(e) => setItem(si, ii, { options: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${item.key}-ordered`}
                      checked={item.ordered}
                      onCheckedChange={(checked) => setItem(si, ii, { ordered: checked === true })}
                    />
                    <Label htmlFor={`${item.key}-ordered`}>
                      {t`These options have an order: never shuffle them`}
                    </Label>
                  </div>
                </>
              ) : null}
              {s.kind === 'theme' ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${item.key}-sub`}>{t`Sub-theme (optional)`}</Label>
                  <Input
                    id={`${item.key}-sub`}
                    value={item.subTheme}
                    maxLength={120}
                    onChange={(e) => setItem(si, ii, { subTheme: e.target.value })}
                  />
                </div>
              ) : null}
              {item.contact ? null : (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${item.key}-required`}
                    checked={item.required}
                    onCheckedChange={(checked) => setItem(si, ii, { required: checked === true })}
                  />
                  <Label htmlFor={`${item.key}-required`}>{t`Required`}</Label>
                </div>
              )}
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Move item ${ii + 1} up`}
                  disabled={ii === 0}
                  onClick={() => setSection(si, { items: move(s.items, ii, ii - 1) })}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Move item ${ii + 1} down`}
                  disabled={ii === s.items.length - 1}
                  onClick={() => setSection(si, { items: move(s.items, ii, ii + 1) })}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t`Remove item ${ii + 1}`}
                  onClick={() => setSection(si, { items: s.items.filter((_, j) => j !== ii) })}
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
              onClick={() => setSection(si, { items: [...s.items, newItem()] })}
            >
              <PlusIcon aria-hidden />
              {t`Add an item`}
            </Button>
            {s.kind === 'closing' && !hasContact ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSection(si, {
                    items: [
                      ...s.items,
                      newItem({
                        kind: 'open',
                        measure: 'factual',
                        required: false,
                        contact: true,
                        text: t`If you wish to receive the results, leave your address here. It is used only to send them, then deleted.`,
                      }),
                    ],
                  })
                }
              >
                <PlusIcon aria-hidden />
                {t`Add the contact item`}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={si === 0}
              onClick={() => set({ sections: move(draft.sections, si, si - 1) })}
            >
              <ArrowUpIcon aria-hidden />
              {t`Move section up`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={si === draft.sections.length - 1}
              onClick={() => set({ sections: move(draft.sections, si, si + 1) })}
            >
              <ArrowDownIcon aria-hidden />
              {t`Move section down`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set({ sections: draft.sections.filter((_, i) => i !== si) })}
            >
              <Trash2Icon aria-hidden />
              {t`Remove section`}
            </Button>
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={draft.sections.length >= 12}
          onClick={() =>
            set({
              sections: [
                ...draft.sections,
                { key: key(), kind: 'theme', title: t`New theme`, items: [] },
              ],
            })
          }
        >
          <PlusIcon aria-hidden />
          {t`Add a theme section`}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={draft.sections.length >= 12 || draft.sections.some((s) => s.kind === 'closing')}
          onClick={() =>
            set({
              sections: [
                ...draft.sections,
                { key: key(), kind: 'closing', title: t`To finish`, items: [] },
              ],
            })
          }
        >
          <PlusIcon aria-hidden />
          {t`Add a closing section`}
        </Button>
      </div>

      {problems.form ? problem('form') : null}
      {Object.keys(problems).length && !problems.form ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {t`Some fields need attention: see above.`}
        </p>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, save.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t`Save the questionnaire`}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t`Cancel`}
        </Button>
      </div>
    </form>
  )
}
