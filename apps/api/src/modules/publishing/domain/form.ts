import type { Items, Language } from './model.ts'
import { same } from './three-way.ts'

/** The questionnaire as this module sees it (same shape as the research module's, by port). */
type ItemCommon = {
  readonly text: string
  readonly measure: 'factual' | 'subjective'
  readonly required: boolean
  readonly subTheme: string | null
  readonly contact: boolean
}
type ItemKind =
  | {
      readonly kind: 'likert'
      readonly points: 5 | 7
      readonly lowLabel: string
      readonly highLabel: string
    }
  | {
      readonly kind: 'single-choice' | 'multiple-choice'
      readonly options: readonly string[]
      readonly ordered: boolean
    }
  | { readonly kind: 'open' }
type Item = { readonly id: string } & ItemCommon & ItemKind
type Section = {
  readonly id: string
  readonly kind: 'introduction' | 'profiling' | 'theme' | 'closing'
  readonly title: string
  readonly items: readonly Item[]
}
export type QuestionnaireContent = {
  readonly framing: {
    readonly objective: string
    readonly hypotheses: readonly string[]
    readonly audience: string
    readonly recruitment: 'targeted' | 'wide-then-filter'
    readonly administration: string
    readonly targetResponses: number | null
    readonly targetReason: string
    readonly language: Language
    readonly consent: string
    readonly thanks: string
    readonly shuffle: boolean
  }
  readonly sections: readonly Section[]
}
export type QuestionnaireInput = Omit<QuestionnaireContent, 'sections'> & {
  readonly sections: readonly (Omit<Section, 'items'> & {
    readonly items: readonly ({ readonly id?: string | undefined } & ItemCommon & ItemKind)[]
  })[]
}

/** A form as neutral blocks (research R2): adapters translate them for a form service. */
type BlockBody =
  | { readonly kind: 'section' }
  | { readonly kind: 'text' }
  | { readonly kind: 'unsupported' }
  | {
      readonly kind: 'choice'
      readonly required: boolean
      readonly multiple: boolean
      readonly shuffle: boolean
      readonly options: readonly { readonly value: string; readonly exit: boolean }[]
    }
  | {
      readonly kind: 'scale'
      readonly required: boolean
      readonly points: number
      readonly lowLabel: string
      readonly highLabel: string
    }
  | { readonly kind: 'open'; readonly required: boolean }

type GridBody<Row> = {
  readonly kind: 'grid'
  readonly required: boolean
  readonly shuffle: boolean
  readonly columns: readonly string[]
  readonly rows: readonly Row[]
}

type Texts = { readonly title: string; readonly description: string }

export type FormBlock = { readonly key: string } & Texts &
  (BlockBody | GridBody<{ readonly key: string; readonly title: string }>)

export type FormModel = { readonly title: string; readonly blocks: readonly FormBlock[] }

/** A block read at the source, with its identity there. */
export type FormReadBlock = {
  readonly formItemId: string
  readonly questionId: string | null
} & Texts &
  (BlockBody | GridBody<{ readonly questionId: string; readonly title: string }>)

/** What a write sends: rows and questions keep their identity; `null` gets a new one. */
export type FormWriteBlock = { readonly questionId: string | null } & Texts &
  (BlockBody | GridBody<{ readonly questionId: string | null; readonly title: string }>)

export type FormOperation =
  | { readonly type: 'create'; readonly index: number; readonly block: FormWriteBlock }
  | {
      readonly type: 'update'
      readonly index: number
      readonly formItemId: string
      readonly block: FormWriteBlock
    }
  | { readonly type: 'move'; readonly from: number; readonly to: number }
  | { readonly type: 'delete'; readonly index: number; readonly formItemId: string }

/** App key (`item:<id>`, `section:<id>`, `consent`, `thanks`) → identity at the source. */
export type FormItemMap = Readonly<
  Record<string, { readonly formItemId: string; readonly questionId: string | null }>
>

/** Texts written into the form, in the questionnaire's language. */
const FORM_LABELS = {
  en: {
    consent: 'Your consent',
    agree: 'I agree to take part',
    refuse: 'I do not wish to take part',
    thanks: 'Thank you',
    grid: 'Rate each statement',
  },
  fr: {
    consent: 'Votre consentement',
    agree: "J'accepte de participer",
    refuse: 'Je ne souhaite pas participer',
    thanks: 'Merci',
    grid: 'Évaluez chaque affirmation',
  },
} as const

const legendOf = (item: Item) =>
  item.kind === 'likert'
    ? `${item.points}|${item.lowLabel}|${item.highLabel}|${item.required}`
    : null

const columnsOf = (points: number, low: string, high: string) =>
  Array.from({ length: points }, (_, i) =>
    i === 0 ? `1 – ${low}` : i === points - 1 ? `${points} – ${high}` : String(i + 1),
  )

const END_LABEL = /^\d+\s*[–-]\s*/

/** Consecutive scales of a theme sharing a legend and whether they are required. */
const groupsOf = (section: Section, shuffle: boolean): Item[][] => {
  const groups: Item[][] = []
  for (const item of section.items) {
    const last = groups.at(-1)
    const first = last?.[0]
    if (
      shuffle &&
      section.kind === 'theme' &&
      last &&
      first &&
      legendOf(item) !== null &&
      legendOf(item) === legendOf(first)
    )
      last.push(item)
    else groups.push([item])
  }
  return groups
}

const itemBlock = (item: Item): FormBlock => {
  const base = { key: `item:${item.id}`, title: item.text, description: '' }
  if (item.kind === 'open') return { ...base, kind: 'open', required: item.required }
  if (item.kind === 'likert')
    return {
      ...base,
      kind: 'scale',
      required: item.required,
      points: item.points,
      lowLabel: item.lowLabel,
      highLabel: item.highLabel,
    }
  return {
    ...base,
    kind: 'choice',
    required: item.required,
    multiple: item.kind === 'multiple-choice',
    shuffle: !item.ordered,
    options: item.options.map((value) => ({ value, exit: false })),
  }
}

/** The form of a questionnaire: consent first, its refusal ends the form; thanks last. */
export const renderForm = (content: QuestionnaireContent, title: string): FormModel => {
  const { framing } = content
  const labels = FORM_LABELS[framing.language]
  const blocks: FormBlock[] = [
    {
      key: 'consent',
      kind: 'choice',
      title: labels.consent,
      description: framing.consent,
      required: true,
      multiple: false,
      shuffle: false,
      options: [
        { value: labels.agree, exit: false },
        { value: labels.refuse, exit: true },
      ],
    },
  ]
  for (const section of content.sections) {
    blocks.push({
      key: `section:${section.id}`,
      kind: 'section',
      title: section.title,
      description: '',
    })
    for (const group of groupsOf(section, framing.shuffle)) {
      const first = group[0]
      if (!first) continue
      if (group.length > 1 && first.kind === 'likert')
        blocks.push({
          key: `grid:${first.id}`,
          kind: 'grid',
          title: labels.grid,
          description: '',
          required: first.required,
          shuffle: true,
          columns: columnsOf(first.points, first.lowLabel, first.highLabel),
          rows: group.map((i) => ({ key: `item:${i.id}`, title: i.text })),
        })
      else blocks.push(itemBlock(first))
    }
  }
  blocks.push({ key: 'thanks', kind: 'text', title: labels.thanks, description: framing.thanks })
  return { title, blocks }
}

const itemValue = (item: Item): Record<string, unknown> => {
  const base = { type: 'item', kind: item.kind, text: item.text, required: item.required }
  if (item.kind === 'open') return base
  if (item.kind === 'likert')
    return {
      ...base,
      points: item.points,
      lowLabel: item.lowLabel,
      highLabel: item.highLabel,
    }
  return { ...base, options: [...item.options] }
}

/** The comparable items of a questionnaire (research R8). */
export const questionnaireItems = (content: QuestionnaireContent): Items => {
  const items = new Map<string, unknown>()
  const { framing, sections } = content
  items.set('consent', { type: 'consent', text: framing.consent, exits: true })
  items.set('thanks', { type: 'thanks', text: framing.thanks })
  items.set('order:sections', { type: 'order', ids: sections.map((s) => s.id) })
  const grids: string[][] = []
  for (const section of sections) {
    items.set(`section:${section.id}`, { type: 'section', title: section.title })
    items.set(`order:section:${section.id}`, { type: 'order', ids: section.items.map((i) => i.id) })
    for (const item of section.items) items.set(`item:${item.id}`, itemValue(item))
    for (const group of groupsOf(section, framing.shuffle))
      if (group.length > 1) grids.push(group.map((i) => i.id))
  }
  items.set('layout', { type: 'layout', grids })
  return items
}

/** The identity of each block just written: known blocks come first, in the model's order. */
export const mapFromRead = (model: FormModel, read: readonly FormReadBlock[]): FormItemMap => {
  const map: Record<string, { formItemId: string; questionId: string | null }> = {}
  model.blocks.forEach((block, i) => {
    const found = read[i]
    if (!found || found.kind !== block.kind) return
    if (block.kind === 'grid' && found.kind === 'grid')
      block.rows.forEach((row, j) => {
        const r = found.rows[j]
        if (r) map[row.key] = { formItemId: found.formItemId, questionId: r.questionId }
      })
    else map[block.key] = { formItemId: found.formItemId, questionId: found.questionId }
  })
  return map
}

const readValue = (block: FormReadBlock): Record<string, unknown> | null => {
  const base = { type: 'item', text: block.title }
  if (block.kind === 'open') return { ...base, kind: 'open', required: block.required }
  if (block.kind === 'scale')
    return {
      ...base,
      kind: 'likert',
      required: block.required,
      points: block.points,
      lowLabel: block.lowLabel,
      highLabel: block.highLabel,
    }
  if (block.kind === 'choice')
    return {
      ...base,
      kind: block.multiple ? 'multiple-choice' : 'single-choice',
      required: block.required,
      options: block.options.map((o) => o.value),
    }
  return null
}

/** The comparable items of a form as read; what the map does not know comes out new or unread. */
export const formItems = (read: readonly FormReadBlock[], map: FormItemMap): Items => {
  const keyOf = new Map<string, string>()
  for (const [key, id] of Object.entries(map))
    keyOf.set(id.questionId ? `q:${id.questionId}` : `f:${id.formItemId}`, key)
  const items = new Map<string, unknown>()
  const sectionIds: string[] = []
  const grids: string[][] = []
  const orders = new Map<string, string[]>()
  let current: string[] | null = null
  const place = (key: string) => {
    if (key.startsWith('item:')) current?.push(key.slice(5))
  }
  for (const block of read) {
    if (block.kind === 'section') {
      const key = keyOf.get(`f:${block.formItemId}`)
      if (!key) {
        items.set(`unread:section:${block.formItemId}`, { type: 'unread', text: block.title })
        continue
      }
      const id = key.slice('section:'.length)
      sectionIds.push(id)
      current = []
      orders.set(id, current)
      items.set(key, { type: 'section', title: block.title })
      continue
    }
    if (block.kind === 'grid') {
      const low = block.columns[0]?.replace(END_LABEL, '') ?? ''
      const high = block.columns.at(-1)?.replace(END_LABEL, '') ?? ''
      const rows: string[] = []
      for (const row of block.rows) {
        const known = keyOf.get(`q:${row.questionId}`)
        const key = known ?? `new:${block.formItemId}:${row.questionId}`
        items.set(key, {
          type: 'item',
          kind: 'likert',
          text: row.title,
          required: block.required,
          points: block.columns.length,
          lowLabel: low,
          highLabel: high,
        })
        place(key)
        if (known) rows.push(known.slice(5))
      }
      if (rows.length > 1) grids.push(rows)
      continue
    }
    if (block.kind === 'text') {
      const key = keyOf.get(`f:${block.formItemId}`)
      if (key === 'thanks') items.set(key, { type: 'thanks', text: block.description })
      else items.set(`unread:${block.formItemId}`, { type: 'unread', text: block.title })
      continue
    }
    const key = block.questionId ? keyOf.get(`q:${block.questionId}`) : undefined
    if (key === 'consent' && block.kind === 'choice') {
      items.set(key, {
        type: 'consent',
        text: block.description,
        exits: block.options.some((o) => o.exit),
      })
      continue
    }
    const value = readValue(block)
    if (!value) {
      items.set(`unread:${block.formItemId}`, { type: 'unread', text: block.title })
      continue
    }
    const itemKey = key ?? `new:${block.formItemId}:${block.questionId}`
    items.set(itemKey, value)
    place(itemKey)
  }
  items.set('order:sections', { type: 'order', ids: sectionIds })
  for (const [id, ids] of orders) items.set(`order:section:${id}`, { type: 'order', ids })
  items.set('layout', { type: 'layout', grids })
  return items
}

const within = (text: unknown, max: number) =>
  typeof text === 'string' && text.trim().length >= 1 && text.trim().length <= max

/** Whether a value read from a form may enter the app (same limits as the questionnaire). */
export const validFormItem = (value: unknown): boolean => {
  if (value === undefined) return true
  const v = value as {
    type?: string
    kind?: string
    text?: unknown
    title?: unknown
    exits?: unknown
    points?: unknown
    lowLabel?: unknown
    highLabel?: unknown
    options?: unknown
  }
  if (v.type === 'consent') return v.exits === true && within(v.text, 4000)
  if (v.type === 'thanks') return within(v.text, 4000)
  if (v.type === 'section') return within(v.title, 120)
  if (v.type === 'order' || v.type === 'layout') return true
  if (v.type !== 'item' || !within(v.text, 600)) return false
  if (v.kind === 'open') return true
  if (v.kind === 'likert')
    return (v.points === 5 || v.points === 7) && within(v.lowLabel, 120) && within(v.highLabel, 120)
  if (v.kind === 'single-choice' || v.kind === 'multiple-choice')
    return (
      Array.isArray(v.options) &&
      v.options.length >= 2 &&
      v.options.length <= 20 &&
      v.options.every((o) => within(o, 600))
    )
  return false
}

/** The block as it should be, comparable with what was read and carrying known identities. */
const toWrite = (
  block: FormBlock,
  map: FormItemMap,
  source: string | undefined,
): FormWriteBlock => {
  const { key, ...rest } = block
  // Only what stays in the same form item keeps its id: the service refuses an id still in use.
  const idOf = (k: string) => {
    const known = map[k]
    return known && known.formItemId === source ? known.questionId : null
  }
  if (block.kind === 'grid')
    return {
      ...(rest as GridBody<never> & Texts),
      questionId: null,
      rows: block.rows.map((r) => ({
        title: r.title,
        questionId: idOf(r.key),
      })),
    }
  return { ...(rest as BlockBody & Texts), questionId: idOf(key) }
}

const comparable = (block: FormWriteBlock | FormReadBlock) => {
  const { questionId: _questionId, ...rest } = block as FormWriteBlock
  const { formItemId: _formItemId, ...value } = rest as typeof rest & { formItemId?: string }
  return value.kind === 'grid' ? { ...value, rows: value.rows.map((r) => r.title) } : value
}

const sourceOf = (block: FormBlock, map: FormItemMap) =>
  block.kind === 'grid'
    ? block.rows.map((r) => map[r.key]?.formItemId).find(Boolean)
    : map[block.key]?.formItemId

/**
 * The fewest operations from what the form holds to the model (research R7), each index valid
 * after those before it. A block of another kind cannot be changed in place: it is replaced. What
 * the map does not know stays in the form, after the known blocks.
 */
export const planFormUpdate = (
  read: readonly FormReadBlock[],
  model: FormModel,
  map: FormItemMap,
): FormOperation[] => {
  const ops: FormOperation[] = []
  const known = new Set(Object.values(map).map((m) => m.formItemId))
  const claimed = new Map<string, FormBlock>()
  for (const block of model.blocks) {
    const source = sourceOf(block, map)
    const found = source ? read.find((r) => r.formItemId === source) : undefined
    if (source && found?.kind === block.kind && !claimed.has(source)) claimed.set(source, block)
  }
  const work: (string | null)[] = read.map((r) => r.formItemId)
  for (let i = read.length - 1; i >= 0; i--) {
    const r = read[i]
    if (!r || !known.has(r.formItemId) || claimed.has(r.formItemId)) continue
    ops.push({ type: 'delete', index: i, formItemId: r.formItemId })
    work.splice(i, 1)
  }
  model.blocks.forEach((block, index) => {
    const source = [...claimed].find(([, b]) => b === block)?.[0]
    const write = toWrite(block, map, source)
    if (!source) {
      ops.push({ type: 'create', index, block: write })
      work.splice(index, 0, null)
      return
    }
    const from = work.indexOf(source)
    if (from !== index) {
      ops.push({ type: 'move', from, to: index })
      work.splice(from, 1)
      work.splice(index, 0, source)
    }
    const current = read.find((r) => r.formItemId === source)
    if (current && !same(comparable(write), comparable(current)))
      ops.push({ type: 'update', index, formItemId: source, block: write })
  })
  return ops
}

const editedItem = (
  value: Record<string, unknown>,
  before: Partial<ItemCommon> & { id?: string | undefined; ordered?: boolean },
): QuestionnaireInput['sections'][number]['items'][number] => {
  const kind = value.kind as Item['kind']
  const common = {
    id: before.id,
    text: value.text as string,
    required: value.required as boolean,
    measure: before.measure ?? (kind === 'likert' || kind === 'open' ? 'subjective' : 'factual'),
    subTheme: before.subTheme ?? null,
    contact: before.contact ?? false,
  } as const
  if (kind === 'open') return { ...common, kind }
  if (kind === 'likert')
    return {
      ...common,
      kind,
      points: value.points as 5 | 7,
      lowLabel: value.lowLabel as string,
      highLabel: value.highLabel as string,
    }
  return {
    ...common,
    kind,
    options: value.options as string[],
    ordered: before.ordered ?? false,
  }
}

/** Accepted values of a form into a questionnaire to save; what a form cannot hold is kept. */
export const applyToQuestionnaire = (
  content: QuestionnaireContent,
  accepted: ReadonlyMap<string, unknown>,
): QuestionnaireInput => {
  const value = (key: string) => accepted.get(key) as Record<string, unknown> | undefined
  const consent = value('consent')
  const thanks = value('thanks')
  // A section gone from the form leaves an order without value: nothing to apply.
  const orderOf = (key: string) => value(key)?.ids as readonly string[] | undefined
  const inOrders = new Set(content.sections.flatMap((s) => orderOf(`order:section:${s.id}`) ?? []))
  const byId = new Map(content.sections.flatMap((s) => s.items.map((i) => [i.id, i] as const)))
  const edit = (item: Item, section: Section) => {
    const key = `item:${item.id}`
    // An order never removes anything: it follows the item, in its section's kind.
    const placed = section.kind === 'theme' ? item : { ...item, subTheme: null }
    if (!accepted.has(key)) return placed
    const v = value(key)
    if (!v) return null
    // The contact item stays one: optional and open, whatever the form says; its answers are
    // never imported. The next update writes it back.
    if (item.contact) return { ...placed, text: v.text as string }
    return editedItem(v, { ...placed, ordered: 'ordered' in item ? item.ordered : false })
  }
  const added = [...accepted]
    .filter(([k, v]) => k.startsWith('new:') && v)
    .map(([, v]) => editedItem(v as Record<string, unknown>, {}))
  const lastTheme = content.sections.map((s) => s.kind).lastIndexOf('theme')
  const sections = content.sections.flatMap((section, i) => {
    const key = `section:${section.id}`
    // Its removal from the form, accepted.
    if (accepted.has(key) && !value(key)) return []
    const order = orderOf(`order:section:${section.id}`)
    const items = [
      ...(order ?? []).map((id) => byId.get(id)).filter((x) => x !== undefined),
      // What the accepted orders do not place stays where it was.
      ...section.items.filter((item) => !inOrders.has(item.id)),
    ]
      .map((item) => edit(item, section))
      .filter((x) => x !== null)
    const sectionValue = value(key)
    return [
      {
        ...section,
        ...(sectionValue ? { title: sectionValue.title as string } : {}),
        items: i === lastTheme ? [...items, ...added] : items,
      },
    ]
  })
  const sectionOrder = orderOf('order:sections')
  return {
    framing: {
      ...content.framing,
      ...(consent ? { consent: consent.text as string } : {}),
      ...(thanks ? { thanks: thanks.text as string } : {}),
    },
    sections: sectionOrder
      ? [
          ...sectionOrder.flatMap((id) => sections.filter((s) => s.id === id)),
          ...sections.filter((s) => !sectionOrder.includes(s.id)),
        ]
      : sections,
  }
}
