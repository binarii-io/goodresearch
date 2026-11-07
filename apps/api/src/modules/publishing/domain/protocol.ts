import { STANDARD_QUESTIONS } from '@goodresearch/shared'
import { contentKeys } from './keys.ts'
import { LABELS } from './labels.ts'
import type { DocBlock, DocModel, Items, Language } from './model.ts'

/** The test protocol as the research module stores it (spec 036). */
export type ProtocolContent = {
  readonly framing: {
    readonly objective: string
    readonly hypotheses: readonly string[]
    readonly participants: string
    readonly format: 'moderated-remote' | 'moderated-in-person'
    readonly sessionMinutes: number
    readonly language: Language
    readonly consent: string
    readonly interface: {
      readonly url: string
      readonly kind: 'prototype' | 'live-application' | 'other'
      readonly description: string | null
    }
  }
  readonly script: {
    readonly introduction: string
    readonly thinkAloud: string
    readonly warmUp: readonly string[]
    readonly debrief: readonly string[]
    readonly closing: string
  }
  readonly scenario: string
  readonly tasks: readonly {
    readonly id: string
    readonly instruction: string
    readonly criterion: string
    readonly startUrl: string | null
    readonly minutes: number | null
  }[]
  readonly questionnaire: 'none' | 'sus-v1'
  readonly easeQuestion: 'none' | 'seq-v1'
  readonly retiredTaskIds: readonly string[]
}

/** What the research module accepts to save a protocol (task ids optional: new tasks get one). */
export type ProtocolInput = Omit<ProtocolContent, 'tasks' | 'retiredTaskIds'> & {
  tasks: {
    id?: string
    instruction: string
    criterion: string
    startUrl: string | null
    minutes: number | null
  }[]
}

/** Texts a person may change in the document, and how they read back. */
const TEXTS = [
  ['framing:objective', 'objective'],
  ['framing:participants', 'participants'],
  ['framing:consent', 'consent'],
  ['script:introduction', 'introduction'],
  ['script:thinkAloud', 'thinkAloud'],
  ['scenario', 'scenario'],
  ['script:closing', 'closing'],
] as const
const LISTS = [
  ['framing:hypotheses', 'hypotheses'],
  ['script:warmUp', 'warmUp'],
  ['script:debrief', 'debrief'],
] as const
/** Limits of FR-002 carried by each value, so a Drive value is judged against its own field. */
const LIST_MAX: Record<(typeof LISTS)[number][0], number> = {
  'framing:hypotheses': 15,
  'script:warmUp': 10,
  'script:debrief': 10,
}
const REQUIRED_TEXTS: readonly string[] = ['framing:consent']
type TextKey = (typeof TEXTS)[number][0]
type ListKey = (typeof LISTS)[number][0]

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const textOf = (p: ProtocolContent, key: TextKey): string => {
  switch (key) {
    case 'framing:objective':
      return p.framing.objective
    case 'framing:participants':
      return p.framing.participants
    case 'framing:consent':
      return p.framing.consent
    case 'script:introduction':
      return p.script.introduction
    case 'script:thinkAloud':
      return p.script.thinkAloud
    case 'script:closing':
      return p.script.closing
    case 'scenario':
      return p.scenario
  }
}
const listOf = (p: ProtocolContent, key: ListKey): readonly string[] =>
  key === 'framing:hypotheses'
    ? p.framing.hypotheses
    : key === 'script:warmUp'
      ? p.script.warmUp
      : p.script.debrief

/** The session settings, written for people, read back only to tell they changed (not editable). */
const settingsLines = (p: ProtocolContent, language: Language): string[] => {
  const l = LABELS[language]
  const f = p.framing
  return [
    `${l.testedInterface}: ${oneLine(f.interface.url)} (${l.kinds[f.interface.kind]})`,
    ...(f.interface.description ? lines(f.interface.description) : []),
    `${l.format}: ${l.formats[f.format]}`,
    `${l.sessionLength}: ${f.sessionMinutes} ${l.minutes}`,
  ]
}

const seqLine = (p: ProtocolContent) => {
  if (p.easeQuestion !== 'seq-v1') return null
  const q = STANDARD_QUESTIONS[p.framing.language]['seq-v1']
  return `${LABELS[p.framing.language].thenAsk}: ${q.question} (1 ${q.scale.low} … ${q.scale.points} ${q.scale.high})`
}

/**
 * The System Usability Scale as the participant fills it, one statement per line with its boxes
 * (spec 036 FR-006): fixed text, the same on the protocol and on the participant sheet.
 */
export const susForm = (p: Pick<ProtocolContent, 'framing' | 'questionnaire'>): string[] => {
  if (p.questionnaire !== 'sus-v1') return []
  const sus = STANDARD_QUESTIONS[p.framing.language]['sus-v1']
  const boxes = Array.from({ length: sus.scale.points }, (_, i) => `☐ ${i + 1}`).join('   ')
  return [
    sus.instructions,
    `1 = ${sus.scale.low} … ${sus.scale.points} = ${sus.scale.high}`,
    ...sus.items.map((item, i) => `${i + 1}. ${item}   ${boxes}`),
  ]
}

const susLines = (p: ProtocolContent): string[] => {
  if (p.questionnaire !== 'sus-v1') return []
  const sus = STANDARD_QUESTIONS[p.framing.language]['sus-v1']
  return [`${LABELS[p.framing.language].facilitatorOnly}: ${sus.facilitatorNote}`, ...susForm(p)]
}

const prefixed = (prefix: string, text: string) => `${prefix}: ${oneLine(text)}`
const PREFIXES = (['en', 'fr'] as const).flatMap((l) => [
  LABELS[l].readAloud,
  LABELS[l].facilitatorOnly,
  LABELS[l].startsAt,
  LABELS[l].about,
])
const PREFIXES_EASE = (['en', 'fr'] as const).map((l) => LABELS[l].thenAsk)
/** The value without its label: only a label the app writes is removed, never real content. */
const unprefixed = (text: string) => {
  const line = oneLine(text)
  const label = PREFIXES.find((x) => line.startsWith(`${x}:`))
  return label ? oneLine(line.slice(label.length + 1)) : line
}

/**
 * The protocol as a document (spec 036 FR-014, research R6): anchors on every editable block and on
 * each task's fields; each instruction is set apart to be read aloud, each criterion marked as for
 * the facilitator only. The settings and the standard questions are plain text, never read back.
 */
export const renderProtocol = (
  p: ProtocolContent,
  studyName: string,
  language: Language,
): DocModel => {
  const l = LABELS[language]
  const blocks: DocBlock[] = [
    { kind: 'heading', level: 1, text: `${l.protocol} · ${oneLine(studyName)}` },
  ]
  const text = (key: TextKey, title: string, level: 2 | 3 = 3) => {
    blocks.push({ kind: 'heading', level, text: title, anchor: key })
    for (const line of lines(textOf(p, key))) blocks.push({ kind: 'paragraph', text: line })
  }
  const list = (key: ListKey, title: string) => {
    blocks.push({ kind: 'heading', level: 3, text: title, anchor: key })
    for (const item of listOf(p, key))
      blocks.push({ kind: 'listItem', level: 0, text: oneLine(item) })
  }
  blocks.push({ kind: 'heading', level: 2, text: l.settings, anchor: 'settings' })
  for (const line of settingsLines(p, language)) blocks.push({ kind: 'paragraph', text: line })
  blocks.push({ kind: 'heading', level: 2, text: l.framing, anchor: 'framing' })
  text('framing:objective', l.objective)
  list('framing:hypotheses', l.hypotheses)
  text('framing:participants', l.participants)
  text('framing:consent', l.consent)
  blocks.push({ kind: 'heading', level: 2, text: l.script, anchor: 'script' })
  text('script:introduction', l.introduction)
  text('script:thinkAloud', l.thinkAloud)
  list('script:warmUp', l.warmUp)
  text('scenario', l.scenario)
  blocks.push({ kind: 'heading', level: 2, text: l.tasks, anchor: 'tasks' })
  const seq = seqLine(p)
  p.tasks.forEach((t, i) => {
    blocks.push({ kind: 'heading', level: 3, text: `${l.task} ${i + 1}`, anchor: `task:${t.id}` })
    blocks.push({
      kind: 'paragraph',
      text: prefixed(l.readAloud, t.instruction),
      anchor: `task:${t.id}:instruction`,
    })
    blocks.push({
      kind: 'paragraph',
      text: prefixed(l.facilitatorOnly, t.criterion),
      anchor: `task:${t.id}:criterion`,
    })
    if (t.startUrl)
      blocks.push({
        kind: 'paragraph',
        text: prefixed(l.startsAt, t.startUrl),
        anchor: `task:${t.id}:start`,
      })
    if (t.minutes !== null)
      blocks.push({
        kind: 'paragraph',
        text: `${l.about}: ${t.minutes} ${l.minutes}`,
        anchor: `task:${t.id}:minutes`,
      })
    if (seq) blocks.push({ kind: 'paragraph', text: seq })
  })
  if (p.questionnaire === 'sus-v1') {
    blocks.push({
      kind: 'heading',
      level: 2,
      text: STANDARD_QUESTIONS[p.framing.language]['sus-v1'].title,
      anchor: 'standard',
    })
    for (const line of susLines(p)) blocks.push({ kind: 'paragraph', text: line })
  }
  blocks.push({ kind: 'heading', level: 2, text: l.debriefTitle, anchor: 'debrief' })
  list('script:debrief', l.debrief)
  text('script:closing', l.closing)
  return { blocks }
}

export type ProtocolItemValue =
  | { readonly type: 'text'; readonly text: string; readonly min?: 1 }
  | { readonly type: 'list'; readonly items: readonly string[]; readonly max: number }
  | {
      readonly type: 'task'
      readonly instruction: string
      readonly criterion: string
      readonly startUrl: string | null
      readonly minutes: number | null
    }
  | { readonly type: 'order'; readonly ids: readonly string[] }
  | { readonly type: 'unread'; readonly text: string }

const textValue = (key: string, text: string): ProtocolItemValue =>
  REQUIRED_TEXTS.includes(key) ? { type: 'text', text, min: 1 } : { type: 'text', text }
const listValue = (
  key: (typeof LISTS)[number][0],
  items: readonly string[],
): ProtocolItemValue => ({
  type: 'list',
  items,
  max: LIST_MAX[key],
})

/** A protocol read from a document: values by key, tasks in their order, what could not be read. */
export type ReadProtocol = {
  readonly items: Items
}

const MINUTES = /(\d+)/

/** Which field a task paragraph holds, from its prefix in either language. */
const fieldOf = (text: string): 'instruction' | 'criterion' | 'start' | 'minutes' | null => {
  const starts = (label: string) => text.startsWith(`${label}:`)
  const any = (pick: (l: (typeof LABELS)['en' | 'fr']) => string) =>
    starts(pick(LABELS.en)) || starts(pick(LABELS.fr))
  if (any((l) => l.readAloud)) return 'instruction'
  if (any((l) => l.facilitatorOnly)) return 'criterion'
  if (any((l) => l.startsAt)) return 'start'
  if (any((l) => l.about)) return 'minutes'
  return null
}

/** Reads a protocol document back (research R6): structure and anchors only, no guessing. */
export const readProtocol = (doc: DocModel): ReadProtocol => {
  const texts = new Map<string, string[]>()
  const lists = new Map<string, string[]>()
  const settings: string[] = []
  const standard: string[] = []
  const ease: string[] = []
  const unread: string[] = []
  type Task = {
    id: string | null
    instruction: string
    criterion: string
    startUrl: string | null
    minutes: number | null
  }
  const tasks: Task[] = []
  let place: string | null = null
  let lastField: 'instruction' | 'criterion' = 'instruction'
  // The headings found with their anchor; after one that lost it, nothing is attributed.
  const headings = new Set<string>()
  const seen = new Set<string>()
  const own = (anchor: string | undefined) => {
    if (!anchor || seen.has(anchor)) return undefined
    seen.add(anchor)
    return anchor
  }
  const isText = (key: string): key is TextKey => TEXTS.some(([k]) => k === key)
  const isList = (key: string): key is ListKey => LISTS.some(([k]) => k === key)

  for (const block of doc.blocks) {
    const anchor = own(block.anchor)
    if (block.kind === 'heading') {
      if (block.level === 1 && place === null) continue
      if (
        anchor &&
        (isText(anchor) ||
          isList(anchor) ||
          ['settings', 'standard', 'framing', 'script', 'tasks', 'debrief'].includes(anchor))
      ) {
        headings.add(anchor)
        place = anchor
        continue
      }
      if (anchor?.startsWith('task:') && anchor.split(':').length === 2) {
        tasks.push({
          id: anchor.slice(5),
          instruction: '',
          criterion: '',
          startUrl: null,
          minutes: null,
        })
        place = 'task'
        lastField = 'instruction'
        continue
      }
      if (block.level === 3 && (place === 'task' || place === 'tasks')) {
        place = 'task'
        lastField = 'instruction'
        // A task heading that lost its anchor: a task added in the document.
        tasks.push({ id: null, instruction: '', criterion: '', startUrl: null, minutes: null })
        continue
      }
      unread.push(block.text)
      place = 'lost'
      continue
    }
    if (place === 'task' && tasks.length) {
      const task = tasks.at(-1) as Task
      // The anchor says which field it is; a task added in the document has its prefixes only.
      const field = anchor?.split(':')[2] ?? fieldOf(block.text)
      const isEase = PREFIXES_EASE.some((x) => block.text.startsWith(`${x}:`))
      if (field === 'instruction') task.instruction = unprefixed(block.text)
      else if (field === 'criterion') task.criterion = unprefixed(block.text)
      else if (field === 'start') task.startUrl = unprefixed(block.text) || null
      else if (field === 'minutes') {
        const m = MINUTES.exec(block.text)
        task.minutes = m ? Number(m[1]) : null
      } else if (isEase) ease.push(block.text)
      // A paragraph split from the one before (Enter in the middle of a text) belongs to it: it
      // is joined back, never dropped (PR #51 review).
      else if (lastField === 'criterion')
        task.criterion = oneLine(`${task.criterion} ${block.text}`)
      else task.instruction = oneLine(`${task.instruction} ${block.text}`)
      if (field === 'instruction' || field === 'criterion') lastField = field
      continue
    }
    if (place === 'settings') settings.push(block.text)
    else if (place === 'standard') standard.push(block.text)
    else if (place && isText(place)) texts.set(place, [...(texts.get(place) ?? []), block.text])
    else if (place && isList(place))
      lists.set(place, [...(lists.get(place) ?? []), oneLine(block.text)])
    else unread.push(block.text)
  }

  const items = new Map<string, ProtocolItemValue>()
  // A block whose heading lost its anchor is not understood, never read as emptied (PR #51 review).
  for (const [key] of TEXTS) {
    const text = (texts.get(key) ?? []).join('\n')
    items.set(key, headings.has(key) ? textValue(key, text) : { type: 'unread', text })
  }
  for (const [key] of LISTS) {
    const list = lists.get(key) ?? []
    items.set(
      key,
      headings.has(key) ? listValue(key, list) : { type: 'unread', text: list.join('\n') },
    )
  }
  items.set('settings', { type: 'unread', text: settings.join('\n') })
  items.set('standard:questionnaire', { type: 'unread', text: standard.join('\n') })
  // The ease question is the same after every task: one text, however many tasks there are.
  items.set('standard:ease', { type: 'unread', text: ease[0] ?? '' })
  const newKey = contentKeys('new')
  const order: string[] = []
  for (const t of tasks) {
    const value: ProtocolItemValue = {
      type: 'task',
      instruction: t.instruction,
      criterion: t.criterion,
      startUrl: t.startUrl,
      minutes: t.minutes,
    }
    if (t.id && !items.has(`task:${t.id}`)) {
      order.push(t.id)
      items.set(`task:${t.id}`, value)
    } else items.set(newKey(value), value)
  }
  items.set('order:tasks', { type: 'order', ids: order })
  unread.forEach((text, i) => {
    items.set(`unread:${i + 1}`, { type: 'unread', text })
  })
  return { items }
}

/** Comparable items of the app's protocol, as `readProtocol` gives them for its document. */
export const protocolItems = (p: ProtocolContent): Items => {
  const items = new Map<string, ProtocolItemValue>()
  for (const [key] of TEXTS) items.set(key, textValue(key, lines(textOf(p, key)).join('\n')))
  for (const [key] of LISTS) items.set(key, listValue(key, listOf(p, key).map(oneLine)))
  items.set('settings', { type: 'unread', text: settingsLines(p, p.framing.language).join('\n') })
  items.set('standard:questionnaire', { type: 'unread', text: susLines(p).join('\n') })
  items.set('standard:ease', { type: 'unread', text: seqLine(p) ?? '' })
  for (const t of p.tasks)
    items.set(`task:${t.id}`, {
      type: 'task',
      instruction: oneLine(t.instruction),
      criterion: oneLine(t.criterion),
      startUrl: t.startUrl ? oneLine(t.startUrl) : null,
      minutes: t.minutes,
    })
  items.set('order:tasks', { type: 'order', ids: p.tasks.map((t) => t.id) })
  return items
}

const isWebAddress = (value: unknown) => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

/** Limits of spec 036 FR-002 and FR-003: a Drive value that breaks them cannot be accepted. */
export const validProtocolItem = (value: unknown): boolean => {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const text = (t: unknown, max: number, min = 1) =>
    typeof t === 'string' && t.length >= min && t.length <= max
  switch (v.type) {
    case 'text':
      return text(v.text, 4000, v.min === 1 ? 1 : 0)
    case 'list':
      return (
        typeof v.max === 'number' &&
        Array.isArray(v.items) &&
        v.items.length <= v.max &&
        v.items.every((t) => text(t, 600))
      )
    case 'task':
      return (
        text(v.instruction, 600) &&
        text(v.criterion, 600) &&
        (v.startUrl === null || isWebAddress(v.startUrl)) &&
        (v.minutes === null ||
          (typeof v.minutes === 'number' &&
            Number.isInteger(v.minutes) &&
            v.minutes >= 1 &&
            v.minutes <= 60))
      )
    case 'order':
      return Array.isArray(v.ids) && v.ids.every((id) => typeof id === 'string')
    default:
      return false
  }
}

/**
 * The app protocol with accepted Drive values: texts and lists replaced, tasks changed, removed or
 * added at the end, then reordered as accepted. The research module validates the result.
 */
export const applyToProtocol = (
  app: ProtocolContent,
  accepted: ReadonlyMap<string, unknown>,
): ProtocolInput => {
  const value = (key: string) => accepted.get(key) as ProtocolItemValue | undefined
  const framing = { ...app.framing, hypotheses: [...app.framing.hypotheses] }
  const script = { ...app.script, warmUp: [...app.script.warmUp], debrief: [...app.script.debrief] }
  let scenario = app.scenario
  const textAt = (key: TextKey, fallback: string) => {
    if (!accepted.has(key)) return fallback
    const v = value(key)
    return v?.type === 'text' ? v.text : ''
  }
  framing.objective = textAt('framing:objective', framing.objective)
  framing.participants = textAt('framing:participants', framing.participants)
  framing.consent = textAt('framing:consent', framing.consent)
  script.introduction = textAt('script:introduction', script.introduction)
  script.thinkAloud = textAt('script:thinkAloud', script.thinkAloud)
  script.closing = textAt('script:closing', script.closing)
  scenario = textAt('scenario', scenario)
  const listAt = (key: ListKey, fallback: string[]) => {
    if (!accepted.has(key)) return fallback
    const v = value(key)
    return v?.type === 'list' ? [...v.items] : []
  }
  framing.hypotheses = listAt('framing:hypotheses', framing.hypotheses)
  script.warmUp = listAt('script:warmUp', script.warmUp)
  script.debrief = listAt('script:debrief', script.debrief)

  let tasks: ProtocolInput['tasks'] = app.tasks.map((t) => ({ ...t }))
  for (const [key] of accepted) {
    if (!key.startsWith('task:')) continue
    const id = key.slice(5)
    const v = value(key)
    if (v?.type !== 'task') tasks = tasks.filter((t) => t.id !== id)
    // Removed in the app, kept in Drive and Drive's version taken: it comes back as a new task (a
    // removed id is never reused); a task is never lost (PR #51 review).
    else if (!tasks.some((t) => t.id === id))
      tasks.push({
        instruction: v.instruction,
        criterion: v.criterion,
        startUrl: v.startUrl,
        minutes: v.minutes,
      })
    else
      tasks = tasks.map((t) =>
        t.id === id
          ? {
              id,
              instruction: v.instruction,
              criterion: v.criterion,
              startUrl: v.startUrl,
              minutes: v.minutes,
            }
          : t,
      )
  }
  for (const [key] of accepted) {
    if (!key.startsWith('new:')) continue
    const v = value(key)
    if (v?.type === 'task')
      tasks.push({
        instruction: v.instruction,
        criterion: v.criterion,
        startUrl: v.startUrl,
        minutes: v.minutes,
      })
  }
  const order = value('order:tasks')
  if (order?.type === 'order') {
    const rank = (id: string | undefined) => {
      const at = id ? order.ids.indexOf(id) : -1
      return at < 0 ? Number.MAX_SAFE_INTEGER : at
    }
    tasks.sort((a, b) => rank(a.id) - rank(b.id))
  }
  return {
    framing,
    script,
    scenario,
    tasks,
    questionnaire: app.questionnaire,
    easeQuestion: app.easeQuestion,
  }
}
