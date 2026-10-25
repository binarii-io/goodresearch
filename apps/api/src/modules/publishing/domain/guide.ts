import { contentKeys } from './keys.ts'
import { LABELS } from './labels.ts'
import type { DocBlock, DocModel, Items, Language } from './model.ts'

/** The interview guide as the research module stores it (spec 006). */
export type GuideContent = {
  readonly framing: {
    readonly objectives: string
    readonly hypotheses: readonly string[]
    readonly audience: string
    readonly format: string
  }
  readonly sections: readonly {
    readonly id: string
    readonly kind: 'introduction' | 'warm-up' | 'theme' | 'wrap-up'
    readonly title: string
    readonly minutes: number
    readonly questions: readonly {
      readonly id: string
      readonly text: string
      readonly followUps: readonly string[]
    }[]
  }[]
}

/** A guide read from a document: ids where anchors were found, and what could not be read. */
export type ReadGuide = {
  readonly framing: {
    readonly objectives: string
    readonly hypotheses: readonly string[]
    readonly audience: string
    readonly format: string
  }
  readonly sections: readonly {
    readonly id: string | null
    readonly title: string
    readonly minutes: number | null
    readonly questions: readonly {
      readonly id: string | null
      readonly text: string
      readonly followUps: readonly string[]
    }[]
  }[]
  readonly unread: readonly string[]
}

const FRAMING = ['objectives', 'hypotheses', 'audience', 'format'] as const

/** Lines of a framing text as a document holds them: no blank lines, trimmed. */
const lines = (text: string) =>
  text
    .split('\n')
    // As a document paragraph reads back: single spaces (PR #7 review).
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

/** One line, single spaces: how a question reads back from a document paragraph. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const sectionHeading = (index: number, title: string, minutes: number, language: Language) =>
  `${index + 1}. ${oneLine(title)} (${minutes} ${LABELS[language].minutes})`

const HEADING = /^(?:\d+\.\s*)?(.*?)\s*\((\d+)\s*min\)\s*$/

/**
 * The guide as a document (spec 007 research R3): anchors on every heading of the framing, every
 * section and every main question; follow-ups are the nested list items under a question.
 */
export const renderGuide = (
  guide: GuideContent,
  studyName: string,
  language: Language,
): DocModel => {
  const l = LABELS[language]
  const blocks: DocBlock[] = [
    { kind: 'heading', level: 1, text: `${l.guide} · ${oneLine(studyName)}` },
    { kind: 'heading', level: 2, text: l.framing, anchor: 'framing' },
  ]
  for (const key of FRAMING) {
    blocks.push({ kind: 'heading', level: 3, text: l[key], anchor: `framing:${key}` })
    if (key === 'hypotheses')
      for (const h of guide.framing.hypotheses)
        blocks.push({ kind: 'listItem', level: 0, text: oneLine(h) })
    else
      for (const line of lines(guide.framing[key])) blocks.push({ kind: 'paragraph', text: line })
  }
  guide.sections.forEach((s, i) => {
    blocks.push({
      kind: 'heading',
      level: 2,
      text: sectionHeading(i, s.title, s.minutes, language),
      anchor: `section:${s.id}`,
    })
    for (const q of s.questions) {
      blocks.push({ kind: 'listItem', level: 0, text: oneLine(q.text), anchor: `question:${q.id}` })
      for (const f of q.followUps) blocks.push({ kind: 'listItem', level: 1, text: oneLine(f) })
    }
  })
  return { blocks }
}

type MutableSection = {
  id: string | null
  title: string
  minutes: number | null
  questions: { id: string | null; text: string; followUps: string[] }[]
}

/** Reads a guide document back (research R5): structure and anchors only, no guessing. */
export const readGuide = (doc: DocModel): ReadGuide => {
  const framing = {
    objectives: [] as string[],
    hypotheses: [] as string[],
    audience: [] as string[],
    format: [] as string[],
  }
  const sections: MutableSection[] = []
  const unread: string[] = []
  let place:
    | { kind: 'none' }
    | { kind: 'framing'; key: (typeof FRAMING)[number] | null }
    | { kind: 'section'; section: MutableSection } = { kind: 'none' }
  const seen = new Set<string>()
  // An anchor copied with its text (duplicated paragraph) identifies only its first occurrence.
  const own = (anchor: string | undefined) => {
    if (!anchor || seen.has(anchor)) return undefined
    seen.add(anchor)
    return anchor
  }

  for (const block of doc.blocks) {
    const anchor = own(block.anchor)
    if (block.kind === 'heading') {
      if (anchor === 'framing') {
        place = { kind: 'framing', key: null }
        continue
      }
      const framingKey = anchor?.startsWith('framing:') ? anchor.slice(8) : null
      if (framingKey && (FRAMING as readonly string[]).includes(framingKey)) {
        place = { kind: 'framing', key: framingKey as (typeof FRAMING)[number] }
        continue
      }
      if (block.level === 1 && sections.length === 0 && place.kind === 'none') continue
      if (block.level === 2) {
        const match = HEADING.exec(block.text)
        const section: MutableSection = {
          id: anchor?.startsWith('section:') ? anchor.slice(8) : null,
          title: (match ? match[1] : block.text.replace(/^\d+\.\s*/, ''))?.trim() ?? '',
          minutes: match?.[2] ? Number(match[2]) : null,
          questions: [],
        }
        sections.push(section)
        place = { kind: 'section', section }
        continue
      }
      unread.push(block.text)
      continue
    }
    if (place.kind === 'framing' && place.key) {
      framing[place.key].push(block.text)
      continue
    }
    if (place.kind === 'section' && block.kind === 'listItem') {
      const questions = place.section.questions
      if (block.level === 0 || questions.length === 0)
        questions.push({
          id: anchor?.startsWith('question:') ? anchor.slice(9) : null,
          text: block.text,
          followUps: [],
        })
      else questions.at(-1)?.followUps.push(block.text)
      continue
    }
    unread.push(block.text)
  }
  return {
    framing: {
      objectives: framing.objectives.join('\n'),
      hypotheses: framing.hypotheses,
      audience: framing.audience.join('\n'),
      format: framing.format.join('\n'),
    },
    sections,
    unread,
  }
}

export type GuideItemValue =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'list'; readonly items: readonly string[] }
  | { readonly type: 'section'; readonly title: string; readonly minutes: number | null }
  | { readonly type: 'order'; readonly ids: readonly string[] }
  | {
      readonly type: 'question'
      readonly section: string | null
      readonly text: string
      readonly followUps: readonly string[]
    }
  | { readonly type: 'unread'; readonly text: string }

/**
 * Comparable items of a guide, by key: framing texts, hypotheses, sections, the order of sections
 * and of each section's questions, questions; questions without id are added ones (`new:`).
 */
export const guideItems = (guide: GuideContent | ReadGuide): Items => {
  const items = new Map<string, GuideItemValue>()
  for (const key of FRAMING)
    items.set(
      `framing:${key}`,
      key === 'hypotheses'
        ? { type: 'list', items: guide.framing.hypotheses.map(oneLine) }
        : { type: 'text', text: lines(guide.framing[key]).join('\n') },
    )
  const sectionIds: string[] = []
  const newKey = contentKeys('new')
  const unreadKey = contentKeys('unread:section')
  for (const s of guide.sections) {
    // A heading that lost its anchor is not understood, but the questions under it keep theirs:
    // they are still in the document (never "removed"), their section unknown (PR #7 review).
    const section = s.id
    if (!section) items.set(unreadKey(s.title), { type: 'unread', text: s.title })
    else {
      sectionIds.push(section)
      items.set(`section:${section}`, {
        type: 'section',
        title: oneLine(s.title),
        minutes: s.minutes,
      })
    }
    const order: string[] = []
    for (const q of s.questions) {
      const value: GuideItemValue = {
        type: 'question',
        section,
        text: oneLine(q.text),
        followUps: q.followUps.map(oneLine),
      }
      if (q.id && !items.has(`question:${q.id}`)) {
        order.push(q.id)
        items.set(`question:${q.id}`, value)
      } else items.set(newKey(value), value)
    }
    if (section) items.set(`order:${section}`, { type: 'order', ids: order })
  }
  items.set('order:sections', { type: 'order', ids: sectionIds })
  if ('unread' in guide)
    guide.unread.forEach((text, i) => {
      items.set(`unread:${i + 1}`, { type: 'unread', text })
    })
  return items
}

/** Limits of spec 006 FR-002: a Drive value that breaks them cannot be accepted. */
export const validGuideItem = (value: unknown): boolean => {
  if (value === undefined) return true
  // Values can come from a request (a final text): their shape is checked first.
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const text = (t: unknown, max: number, min = 1) =>
    typeof t === 'string' && t.length >= min && t.length <= max
  const texts = (list: unknown, max: number) =>
    Array.isArray(list) && list.length <= max && list.every((t) => text(t, 600))
  switch (v.type) {
    case 'text':
      return text(v.text, 4000, 0)
    case 'list':
      return texts(v.items, 15)
    case 'section':
      return (
        text(v.title, 120) &&
        typeof v.minutes === 'number' &&
        Number.isInteger(v.minutes) &&
        v.minutes >= 1 &&
        v.minutes <= 180
      )
    case 'question':
      return (
        text(v.text, 600) &&
        texts(v.followUps, 8) &&
        (v.section === null || typeof v.section === 'string')
      )
    case 'order':
      return Array.isArray(v.ids) && v.ids.every((id) => typeof id === 'string')
    default:
      return false
  }
}

/** What the research module accepts to save a guide (ids optional: new questions get one). */
export type GuideInput = {
  framing: { objectives: string; hypotheses: string[]; audience: string; format: string }
  sections: {
    id?: string
    kind: GuideContent['sections'][number]['kind']
    title: string
    minutes: number
    questions: { id?: string; text: string; followUps: string[] }[]
  }[]
}

/**
 * The app guide with accepted Drive values (research R7): framing, sections, questions changed,
 * added (at the end of their section), removed or moved; accepted orders reorder known ids.
 */
export const applyToGuide = (
  app: GuideContent,
  accepted: ReadonlyMap<string, unknown>,
): GuideInput => {
  const value = (key: string) => accepted.get(key) as GuideItemValue | undefined
  const framing = {
    objectives: app.framing.objectives,
    hypotheses: [...app.framing.hypotheses],
    audience: app.framing.audience,
    format: app.framing.format,
  }
  for (const key of FRAMING) {
    if (!accepted.has(`framing:${key}`)) continue
    const v = value(`framing:${key}`)
    if (key === 'hypotheses') framing.hypotheses = v?.type === 'list' ? [...v.items] : []
    else framing[key] = v?.type === 'text' ? v.text : ''
  }
  const sections: GuideInput['sections'] = app.sections.map((s) => {
    const v = value(`section:${s.id}`)
    return {
      id: s.id,
      kind: s.kind,
      title: v?.type === 'section' ? v.title : s.title,
      minutes: v?.type === 'section' && v.minutes !== null ? v.minutes : s.minutes,
      questions: s.questions.map((q) => ({ id: q.id, text: q.text, followUps: [...q.followUps] })),
    }
  })
  // A section removed in Drive and accepted: gone, with what was left in it.
  const kept = sections.filter(
    (s) => !(accepted.has(`section:${s.id}`) && !value(`section:${s.id}`)),
  )
  sections.splice(0, sections.length, ...kept)
  const byId = new Map(sections.map((s) => [s.id, s]))
  for (const [key] of accepted) {
    if (!key.startsWith('question:')) continue
    const id = key.slice(9)
    const v = value(key)
    // Where it goes, found before it is taken out: its new section when known, else where it is
    // (a heading that lost its anchor gives no section); a question is never lost (PR #7 review).
    const current = sections.find((s) => s.questions.some((q) => q.id === id))
    const target =
      v?.type === 'question'
        ? ((v.section ? byId.get(v.section) : undefined) ?? current ?? sections.at(-1))
        : undefined
    for (const s of sections) s.questions = s.questions.filter((q) => q.id !== id)
    if (v?.type !== 'question') continue
    target?.questions.push({ id, text: v.text, followUps: [...v.followUps] })
  }
  // A changed question was put back at the end: restore the app order for its section.
  for (const s of app.sections) {
    const section = byId.get(s.id)
    if (!section) continue
    const appOrder = s.questions.map((q) => q.id)
    const accepted_ = value(`order:${s.id}`)
    const order = accepted_?.type === 'order' ? accepted_.ids : appOrder
    section.questions.sort((a, b) => rank(order, a.id) - rank(order, b.id))
  }
  for (const [key] of accepted) {
    if (!key.startsWith('new:')) continue
    const v = value(key)
    if (v?.type !== 'question') continue
    const target = (v.section && byId.get(v.section)) || sections.at(-1)
    target?.questions.push({ text: v.text, followUps: [...v.followUps] })
  }
  const order = value('order:sections')
  if (order?.type === 'order')
    sections.sort((a, b) => rank(order.ids, a.id) - rank(order.ids, b.id))
  return { framing, sections }
}

const rank = (order: readonly string[], id: string | undefined) => {
  const at = id ? order.indexOf(id) : -1
  return at < 0 ? Number.MAX_SAFE_INTEGER : at
}
