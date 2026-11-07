import {
  getGetTestProtocolQueryKey,
  type TestProtocol,
  useSaveTestProtocol,
} from '@goodresearch/api-client'
import { STANDARD_QUESTIONS } from '@goodresearch/shared'
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
import { INTERFACE_KINDS, SESSION_FORMATS } from './labels.ts'
import type { ProtocolLike } from './protocol-view.tsx'

type Framing = ProtocolLike['framing']
type InterfaceKind = Framing['interface']['kind']
type Format = Framing['format']
type DraftTask = {
  key: string
  id?: string
  instruction: string
  criterion: string
  startUrl: string
  minutes: string
}
type Draft = {
  objective: string
  hypotheses: string
  participants: string
  format: Format
  sessionMinutes: string
  language: 'en' | 'fr'
  consent: string
  url: string
  kind: InterfaceKind
  description: string
  introduction: string
  thinkAloud: string
  warmUp: string
  debrief: string
  closing: string
  scenario: string
  tasks: DraftTask[]
  sus: boolean
  seq: boolean
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

/** Only `http(s)`: what a participant opens; the app never opens it (FR-022). */
const isWebAddress = (value: string) => {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

const toDraft = (p: ProtocolLike): Draft => ({
  objective: p.framing.objective,
  hypotheses: p.framing.hypotheses.join('\n'),
  participants: p.framing.participants,
  format: p.framing.format,
  sessionMinutes: String(p.framing.sessionMinutes),
  language: p.framing.language,
  consent: p.framing.consent,
  url: p.framing.interface.url,
  kind: p.framing.interface.kind,
  description: p.framing.interface.description ?? '',
  introduction: p.script.introduction,
  thinkAloud: p.script.thinkAloud,
  warmUp: p.script.warmUp.join('\n'),
  debrief: p.script.debrief.join('\n'),
  closing: p.script.closing,
  scenario: p.scenario,
  tasks: p.tasks.map((task) => ({
    key: key(),
    ...(task.id ? { id: task.id } : {}),
    instruction: task.instruction,
    criterion: task.criterion,
    startUrl: task.startUrl ?? '',
    minutes: task.minutes === null ? '' : String(task.minutes),
  })),
  sus: p.questionnaire === 'sus-v1',
  seq: p.easeQuestion === 'seq-v1',
})

const fromDraft = (d: Draft) => ({
  framing: {
    objective: d.objective.trim(),
    hypotheses: lines(d.hypotheses),
    participants: d.participants.trim(),
    format: d.format,
    sessionMinutes: Number(d.sessionMinutes),
    language: d.language,
    consent: d.consent.trim(),
    interface: { url: d.url.trim(), kind: d.kind, description: d.description.trim() || null },
  },
  script: {
    introduction: d.introduction.trim(),
    thinkAloud: d.thinkAloud.trim(),
    warmUp: lines(d.warmUp),
    debrief: lines(d.debrief),
    closing: d.closing.trim(),
  },
  scenario: d.scenario.trim(),
  tasks: d.tasks.map((task) => ({
    ...(task.id ? { id: task.id } : {}),
    instruction: task.instruction.trim(),
    criterion: task.criterion.trim(),
    startUrl: task.startUrl.trim() || null,
    minutes: task.minutes.trim() ? Number(task.minutes) : null,
  })),
  questionnaire: d.sus ? ('sus-v1' as const) : ('none' as const),
  easeQuestion: d.seq ? ('seq-v1' as const) : ('none' as const),
})

/** "Write it myself" (US3): the default consent and think-aloud in the interface language, one task. */
export const useEmptyProtocol = (): ProtocolLike => {
  const { t, i18n } = useLingui()
  const language = normalise(i18n.locale)
  const defaults = STANDARD_QUESTIONS[language].defaults
  return {
    framing: {
      objective: '',
      hypotheses: [],
      participants: '',
      format: 'moderated-remote',
      sessionMinutes: 45,
      language,
      consent: defaults.consent,
      interface: { url: '', kind: 'prototype', description: null },
    },
    script: {
      introduction: t`Thank you for your time. We will ask you to do a few tasks with an interface we are working on.`,
      thinkAloud: defaults.thinkAloud,
      warmUp: [],
      debrief: [t`What was the hardest for you?`, t`What would you change first?`],
      closing: t`Thank you for taking part.`,
    },
    scenario: '',
    tasks: [{ instruction: '', criterion: '', startUrl: null, minutes: null }],
    questionnaire: 'none',
    easeQuestion: 'none',
  }
}

/** Edits the whole protocol by hand (US3), against the version seen; known task ids are kept. */
export function ProtocolEditor({
  studyId,
  protocol,
  start,
  onDone,
}: {
  studyId: string
  protocol: TestProtocol | null
  start: ProtocolLike
  onDone: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const save = useSaveTestProtocol()
  const [draft, setDraft] = useState<Draft>(() => toDraft(protocol?.content ?? start))
  // Problems next to their field (US3 scenario 4), by the key of the field.
  const [problems, setProblems] = useState<Record<string, string>>({})
  const id = useId()
  const standard = STANDARD_QUESTIONS[draft.language]

  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }))
  const setTask = (index: number, change: Partial<DraftTask>) =>
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((task, i) => (i === index ? { ...task, ...change } : task)),
    }))

  const check = (): Record<string, string> => {
    const found: Record<string, string> = {}
    if (!isWebAddress(draft.url))
      found.url = t`Enter a web address starting with http:// or https://.`
    if (!draft.consent.trim()) found.consent = t`The consent text cannot be empty.`
    const session = Number(draft.sessionMinutes)
    if (!Number.isInteger(session) || session < 10 || session > 240)
      found.sessionMinutes = t`Enter a length from 10 to 240 minutes.`
    if (lines(draft.hypotheses).length > 15) found.hypotheses = t`At most 15 hypotheses.`
    if (lines(draft.warmUp).length > 10) found.warmUp = t`At most 10 warm-up questions.`
    if (lines(draft.debrief).length > 10) found.debrief = t`At most 10 debrief questions.`
    if (draft.tasks.length === 0) found.form = t`Add at least one task.`
    for (const task of draft.tasks) {
      const minutes = Number(task.minutes)
      if (!task.instruction.trim()) found[task.key] = t`Write the instruction, or remove the task.`
      else if (!task.criterion.trim())
        found[task.key] = t`Write how you will know the task is reached.`
      else if (task.startUrl.trim() && !isWebAddress(task.startUrl))
        found[task.key] = t`The start link must start with http:// or https://.`
      else if (task.minutes.trim() && (!Number.isInteger(minutes) || minutes < 1 || minutes > 60))
        found[task.key] = t`Enter a duration from 1 to 60 minutes, or leave it empty.`
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
      data: { content: fromDraft(draft), version: protocol?.version ?? null },
    })
    await queryClient.invalidateQueries({ queryKey: getGetTestProtocolQueryKey(studyId) })
    onDone()
  }

  const problem = (name: string) =>
    problems[name] ? (
      <p id={`${id}-${name}-error`} role="alert" className="text-destructive text-sm">
        {problems[name]}
      </p>
    ) : null
  const area = (name: keyof Draft, label: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${name}`}>{label}</Label>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <Textarea
        id={`${id}-${name}`}
        value={draft[name] as string}
        maxLength={4000}
        aria-invalid={problems[name] ? true : undefined}
        aria-describedby={problems[name] ? `${id}-${name}-error` : undefined}
        onChange={(e) => set({ [name]: e.target.value } as Partial<Draft>)}
      />
      {problem(name)}
    </div>
  )

  return (
    <form
      className="grid gap-5"
      noValidate
      aria-label={t`Edit the test protocol`}
      onSubmit={(e) => void submit(e).catch(() => undefined)}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Tested interface`}</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-url`}>{t`Link`}</Label>
            <Input
              id={`${id}-url`}
              type="url"
              value={draft.url}
              maxLength={2000}
              placeholder="https://"
              aria-invalid={problems.url ? true : undefined}
              aria-describedby={problems.url ? `${id}-url-error` : undefined}
              onChange={(e) => set({ url: e.target.value })}
            />
            {problem('url')}
          </div>
          <div className="grid gap-1.5">
            <Label id={`${id}-kind`}>{t`Kind`}</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) => v && set({ kind: v as InterfaceKind })}
            >
              <SelectTrigger aria-labelledby={`${id}-kind`}>
                <SelectValue>{(v: InterfaceKind) => i18n._(INTERFACE_KINDS[v])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(INTERFACE_KINDS) as InterfaceKind[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {i18n._(INTERFACE_KINDS[v])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {area(
          'description',
          t`What participants will use (optional)`,
          t`For example the test account to use, or the version.`,
        )}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Framing`}</legend>
        {area('objective', t`Objective`)}
        {area('hypotheses', t`Hypotheses (one per line)`)}
        {area('participants', t`Participants`)}
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
          <div className="grid gap-1.5">
            <Label id={`${id}-format`}>{t`Format`}</Label>
            <Select value={draft.format} onValueChange={(v) => v && set({ format: v as Format })}>
              <SelectTrigger aria-labelledby={`${id}-format`}>
                <SelectValue>{(v: Format) => i18n._(SESSION_FORMATS[v])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SESSION_FORMATS) as Format[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {i18n._(SESSION_FORMATS[v])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-sessionMinutes`}>{t`Session (min)`}</Label>
            <Input
              id={`${id}-sessionMinutes`}
              type="number"
              min={10}
              max={240}
              value={draft.sessionMinutes}
              aria-invalid={problems.sessionMinutes ? true : undefined}
              aria-describedby={problems.sessionMinutes ? `${id}-sessionMinutes-error` : undefined}
              onChange={(e) => set({ sessionMinutes: e.target.value })}
            />
            {problem('sessionMinutes')}
          </div>
          <div className="grid gap-1.5">
            <Label id={`${id}-language`}>{t`Language`}</Label>
            <Select
              value={draft.language}
              onValueChange={(v) => v && set({ language: v as 'en' | 'fr' })}
            >
              <SelectTrigger aria-labelledby={`${id}-language`}>
                <SelectValue>
                  {(v: 'en' | 'fr') => (v === 'fr' ? 'Français' : 'English')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {area(
          'consent',
          t`Consent text`,
          t`Read before recording. It must say that the session is recorded and read by an AI service.`,
        )}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Script`}</legend>
        {area('introduction', t`Introduction`)}
        {area('thinkAloud', t`Think-aloud instructions`)}
        {area('warmUp', t`Warm-up questions (one per line)`)}
        {area('scenario', t`Scenario given to participants`)}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Tasks`}</legend>
        <p className="text-muted-foreground text-sm">{t`One goal per task, worded as the participant's goal. Never name a button, a menu or the steps.`}</p>
        {draft.tasks.map((task, ti) => (
          <div key={task.key} className="grid gap-2 rounded-md bg-muted/50 p-2.5">
            <div className="grid gap-1.5">
              <Label
                htmlFor={`${task.key}-instruction`}
              >{t`Task ${ti + 1}: instruction read aloud`}</Label>
              <Textarea
                id={`${task.key}-instruction`}
                value={task.instruction}
                maxLength={600}
                rows={2}
                aria-invalid={problems[task.key] ? true : undefined}
                aria-describedby={problems[task.key] ? `${id}-${task.key}-error` : undefined}
                onChange={(e) => setTask(ti, { instruction: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor={`${task.key}-criterion`}
              >{t`Success criterion (for the facilitator)`}</Label>
              <Input
                id={`${task.key}-criterion`}
                value={task.criterion}
                maxLength={600}
                onChange={(e) => setTask(ti, { criterion: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
              <div className="grid gap-1.5">
                <Label htmlFor={`${task.key}-start`}>{t`Start link (optional)`}</Label>
                <Input
                  id={`${task.key}-start`}
                  type="url"
                  value={task.startUrl}
                  maxLength={2000}
                  placeholder="https://"
                  onChange={(e) => setTask(ti, { startUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${task.key}-minutes`}>{t`Minutes (optional)`}</Label>
                <Input
                  id={`${task.key}-minutes`}
                  type="number"
                  min={1}
                  max={60}
                  value={task.minutes}
                  onChange={(e) => setTask(ti, { minutes: e.target.value })}
                />
              </div>
            </div>
            {problem(task.key)}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ti === 0}
                aria-label={t`Move task ${ti + 1} up`}
                onClick={() => set({ tasks: move(draft.tasks, ti, ti - 1) })}
              >
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ti === draft.tasks.length - 1}
                aria-label={t`Move task ${ti + 1} down`}
                onClick={() => set({ tasks: move(draft.tasks, ti, ti + 1) })}
              >
                <ArrowDownIcon aria-hidden />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => set({ tasks: draft.tasks.filter((_, i) => i !== ti) })}
              >
                <Trash2Icon aria-hidden />
                {t`Remove task ${ti + 1}`}
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={draft.tasks.length >= 15}
            onClick={() =>
              set({
                tasks: [
                  ...draft.tasks,
                  { key: key(), instruction: '', criterion: '', startUrl: '', minutes: '' },
                ],
              })
            }
          >
            <PlusIcon aria-hidden />
            {t`Add a task`}
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Standard questions`}</legend>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-seq`}
              checked={draft.seq}
              onCheckedChange={(checked) => set({ seq: checked === true })}
            />
            <Label htmlFor={`${id}-seq`}>{t`Ask the ease question after each task`}</Label>
          </div>
          <p className="text-muted-foreground text-sm">
            {standard['seq-v1'].question} (1 {standard['seq-v1'].scale.low} …{' '}
            {standard['seq-v1'].scale.points} {standard['seq-v1'].scale.high})
          </p>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-sus`}
              checked={draft.sus}
              onCheckedChange={(checked) => set({ sus: checked === true })}
            />
            <Label htmlFor={`${id}-sus`}>{t`End with the System Usability Scale`}</Label>
          </div>
          <p className="text-muted-foreground text-sm">{t`Ten fixed statements rated from 1 to 5, in the protocol's language. The texts cannot be changed, so scores compare across sessions.`}</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t`Debrief`}</legend>
        {area('debrief', t`Debrief questions (one per line)`)}
        {area('closing', t`Closing`)}
      </fieldset>

      {problems.form ? problem('form') : null}
      {Object.keys(problems).length && !problems.form ? (
        <p role="alert" className="text-destructive text-sm">
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
          {t`Save the protocol`}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t`Cancel`}
        </Button>
      </div>
    </form>
  )
}
