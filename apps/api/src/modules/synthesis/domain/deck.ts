import { withPlaceholders } from '@goodresearch/shared'
import type { Bilingual, InsightStatus } from './insights.ts'

type Level = 'high' | 'medium' | 'low'
type Rating = 'high' | 'medium' | 'low'
type Kind = 'build' | 'test' | 'investigate'
type Polarity = 'positive' | 'negative' | 'neutral' | 'mixed'

/** What the deck is built from (spec 015 FR-002), read from the project at the moment. */
export type DeckInput = {
  readonly language: 'en' | 'fr'
  readonly withProposed: boolean
  /** Names the app knows: replaced inside verbatims (FR-004). */
  readonly names: readonly string[]
  readonly project: {
    readonly name: string
    readonly goal: string
    readonly team: string | null
  }
  readonly studies: readonly {
    readonly name: string
    readonly type: string
    readonly interviews: number
    readonly first: string | null
    readonly last: string | null
    readonly themes: readonly string[]
    readonly questions: number
    /** Participants with accepted facts in the study. */
    readonly participants: number
    /** Participants whose facts in the study are all still to decide. */
    readonly toValidate?: number | undefined
  }[]
  readonly takeaways: {
    readonly text: Bilingual
    readonly toValidate: number
    /** The AI draft not used yet: shown, as such, with what is still to decide (FR-003). */
    readonly draft?: Bilingual | null | undefined
  } | null
  readonly insights: readonly {
    readonly id: string
    readonly status: InsightStatus
    readonly theme: { readonly key: string; readonly title: string | null }
    readonly statement: Bilingual
    readonly description?: Bilingual | undefined
    readonly level: Level
    readonly polarity: Polarity
    readonly support: number
    readonly counter: number
    readonly panel: number
    /** Supporting facts counted. */
    readonly facts?: number | undefined
    readonly counterEvidence: Bilingual
    readonly minorityView: Bilingual
    /** The verbatims of its counted supporting facts the viewer may see. */
    readonly verbatims: readonly { readonly participant: string; readonly text: string }[]
  }[]
  readonly recommendations: readonly {
    readonly id: string
    readonly status: InsightStatus
    readonly action: Bilingual
    readonly successMeasure?: Bilingual | undefined
    readonly kind: Kind
    readonly impact: Rating
    readonly effort: Rating
    readonly priority: number
    readonly owner: string | null
    /** The lowest confidence of its counted insights: how well it is supported. */
    readonly evidence?: Level | null | undefined
  }[]
}

type Quote = { readonly participant: string; readonly text: string }

export type InsightGroup = 'works' | 'blocks' | 'findings'

/** One slide of the deck, typed by its kind; texts already in the deck's language. */
// Plain arrays: a slide is built afresh and sent as is (contracts).
export type Slide =
  | {
      readonly kind: 'title'
      readonly title: string
      readonly interviews: number
      readonly first: string | null
      readonly last: string | null
      readonly participants: number
      readonly team: string | null
    }
  | {
      readonly kind: 'takeaways'
      readonly text: string
      /** The text is the AI draft, not validated by a person. */
      readonly draft: boolean
      readonly toValidate: number
      readonly recommendations: { readonly action: string; readonly toValidate: boolean }[]
    }
  | {
      readonly kind: 'context'
      readonly goal: string
      readonly studies: { readonly name: string; readonly type: string }[]
    }
  | {
      readonly kind: 'method'
      readonly studies: {
        readonly name: string
        readonly type: string
        readonly interviews: number
        readonly themes: string[]
        readonly questions: number
      }[]
    }
  | {
      readonly kind: 'numbers'
      readonly interviews: number
      readonly participants: number
      /** Of the participants, those known only from facts still to decide (FR-003). */
      readonly toValidate: number
      readonly studies: number
      readonly themes: number
      readonly first: string | null
      readonly last: string | null
    }
  | {
      readonly kind: 'insightsTable'
      readonly group: InsightGroup
      readonly page: number
      readonly pages: number
      readonly rows: {
        readonly number: number
        readonly statement: string
        readonly theme: string | null
        readonly level: Level
        readonly support: number
        readonly panel: number
        readonly toValidate: boolean
      }[]
    }
  | {
      readonly kind: 'insight'
      readonly number: number
      readonly theme: string | null
      readonly statement: string
      readonly description: string
      readonly level: Level
      readonly polarity: Polarity
      readonly support: number
      readonly counter: number
      readonly panel: number
      readonly facts: number
      readonly counterEvidence: string | null
      readonly minorityView: string | null
      readonly quote: Quote | null
      readonly toValidate: boolean
    }
  | {
      readonly kind: 'nuances'
      readonly page: number
      readonly pages: number
      readonly items: {
        readonly statement: string
        readonly counterEvidence: string | null
        readonly minorityView: string | null
        readonly toValidate: boolean
      }[]
    }
  | {
      readonly kind: 'recommendations'
      readonly page: number
      readonly pages: number
      readonly rows: {
        readonly number: number
        readonly action: string
        readonly kind: Kind
        readonly impact: Rating
        readonly effort: Rating
        readonly priority: number
        readonly evidence: Level | null
        readonly toValidate: boolean
      }[]
    }
  | {
      readonly kind: 'matrix'
      readonly items: {
        readonly number: number
        readonly action: string
        readonly kind: Kind
        readonly impact: Rating
        readonly effort: Rating
        readonly toValidate: boolean
      }[]
    }
  | {
      readonly kind: 'nextSteps'
      readonly page: number
      readonly pages: number
      readonly rows: {
        readonly action: string
        readonly owner: string | null
        readonly measure: string | null
        readonly toValidate: boolean
      }[]
    }
  | { readonly kind: 'thanks'; readonly title: string }

/** Rows of a table slide: a table never runs over its slide (prototype). */
export const ROWS_PER_SLIDE = 6
const NUANCES_PER_SLIDE = 4
const QUOTE_MIN = 40
const QUOTE_MAX = 320
const QUOTE_IDEAL = 140
const LEVEL_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 }
/** What an AI writes for "nothing": no nuance to show. */
const NONE = /^(none|aucune?|n\/a|-|—)?\.?$/i

/**
 * French typography: the space before `: ; ! ? »` and after `«` never breaks, so a colon never
 * starts a line on a slide.
 */
export const unbreakable = (text: string) =>
  text.replace(/[ \u00a0]+([:;!?»])/g, '\u202f$1').replace(/«[ \u00a0]+/g, '«\u202f')

const shown = (status: InsightStatus, withProposed: boolean) =>
  status === 'validated' || status === 'edited' || (withProposed && status === 'proposed')

const pagesOf = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** A verbatim as the deck shows it: names the app knows replaced, cut at a word (FR-004). */
const quoteOf = (text: string, names: readonly string[]): string => {
  const hidden = withPlaceholders(text, names)
    .text.replace(/\[Person \d+\]/g, '[…]')
    .trim()
  if (hidden.length <= QUOTE_MAX) return hidden
  const cut = hidden.slice(0, QUOTE_MAX)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), QUOTE_MAX / 2)).trimEnd()}…`
}

/** The emblematic verbatim: of a readable length, the closest to about 140 characters. */
const pickQuote = (verbatims: readonly Quote[], names: readonly string[]): Quote | null => {
  const readable = verbatims.filter((v) => v.text.length >= QUOTE_MIN && v.text.length <= QUOTE_MAX)
  const candidates = readable.length > 0 ? readable : verbatims
  const best = [...candidates].sort(
    (a, b) => Math.abs(a.text.length - QUOTE_IDEAL) - Math.abs(b.text.length - QUOTE_IDEAL),
  )[0]
  return best ? { participant: best.participant, text: quoteOf(best.text, names) } : null
}

const GROUPS: readonly { group: InsightGroup; polarities: readonly Polarity[] }[] = [
  { group: 'works', polarities: ['positive'] },
  { group: 'blocks', polarities: ['negative'] },
  { group: 'findings', polarities: ['neutral', 'mixed'] },
]

/**
 * Spec 015 FR-002, FR-003, FR-006: the debrief deck, built on the fly in one language, as the
 * prototype's. Only what is validated, or also what is still to decide when asked (marked "to
 * validate"); a section without content is left out, except the title and the thanks.
 */
export const buildDeck = (input: DeckInput): Slide[] => {
  const lang = input.language
  const text = (b: Bilingual | undefined) =>
    b ? unbreakable((b[lang] || b[lang === 'en' ? 'fr' : 'en']).trim()) : ''
  const nuance = (b: Bilingual) => {
    const t = text(b)
    return t && !NONE.test(t) ? t : null
  }

  // With what is still to decide, the panel counts the people of those facts too (FR-003).
  const extra = (s: DeckInput['studies'][number]) => (input.withProposed ? (s.toValidate ?? 0) : 0)
  const participants = input.studies.reduce((n, s) => n + s.participants + extra(s), 0)
  const interviews = input.studies.reduce((n, s) => n + s.interviews, 0)
  const first = input.studies.flatMap((s) => (s.first ? [s.first] : [])).sort()[0] ?? null
  const last =
    input.studies
      .flatMap((s) => (s.last ? [s.last] : []))
      .sort()
      .at(-1) ?? null

  // Most solid first: confidence, then participants, then facts (prototype).
  const insights = input.insights
    .filter((i) => shown(i.status, input.withProposed))
    .map((i, n) => ({ i, n }))
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.i.level] - LEVEL_ORDER[b.i.level] ||
        b.i.support - a.i.support ||
        (b.i.facts ?? 0) - (a.i.facts ?? 0) ||
        a.n - b.n,
    )
    .map(({ i }, n) => ({ ...i, number: n + 1, toValidate: i.status === 'proposed' }))
  const recommendations = input.recommendations
    .filter((r) => shown(r.status, input.withProposed))
    .map((r, n) => ({ ...r, number: n + 1, toValidate: r.status === 'proposed' }))

  const slides: Slide[] = [
    {
      kind: 'title',
      title: input.project.name,
      interviews,
      first,
      last,
      participants,
      team: input.project.team,
    },
  ]

  // With what is still to decide, the AI draft not used yet stands in for the saved text.
  const draft = input.withProposed ? text(input.takeaways?.draft ?? undefined) : ''
  const saved = input.takeaways ? text(input.takeaways.text) : ''
  const fromDraft = draft !== '' && draft !== saved
  const takeaways = fromDraft ? draft : saved
  if (takeaways || recommendations.length > 0)
    slides.push({
      kind: 'takeaways',
      text: takeaways,
      draft: fromDraft,
      // What the saved text rests on; the draft is flagged as a whole.
      toValidate: fromDraft ? 0 : (input.takeaways?.toValidate ?? 0),
      recommendations: recommendations
        .slice(0, 3)
        .map((r) => ({ action: text(r.action), toValidate: r.toValidate })),
    })

  if (input.project.goal.trim() || input.studies.length > 0)
    slides.push({
      kind: 'context',
      goal: unbreakable(input.project.goal.trim()),
      studies: input.studies.map((s) => ({ name: s.name, type: s.type })),
    })

  if (input.studies.length > 0)
    slides.push({
      kind: 'method',
      studies: input.studies.map((s) => ({
        name: s.name,
        type: s.type,
        interviews: s.interviews,
        themes: [...s.themes],
        questions: s.questions,
      })),
    })

  if (interviews > 0)
    slides.push({
      kind: 'numbers',
      interviews,
      participants,
      toValidate: input.studies.reduce((n, s) => n + extra(s), 0),
      studies: input.studies.length,
      themes: new Set(input.studies.flatMap((s) => s.themes)).size,
      first,
      last,
    })

  // At a glance: what works, what holds back, the other findings (prototype).
  for (const { group, polarities } of GROUPS) {
    const of = insights.filter((i) => polarities.includes(i.polarity))
    const pages = pagesOf(of, ROWS_PER_SLIDE)
    pages.forEach((rows, n) => {
      slides.push({
        kind: 'insightsTable',
        group,
        page: n + 1,
        pages: pages.length,
        rows: rows.map((i) => ({
          number: i.number,
          statement: text(i.statement),
          theme: i.theme.title,
          level: i.level,
          support: i.support,
          panel: i.panel,
          toValidate: i.toValidate,
        })),
      })
    })
  }

  for (const i of insights)
    slides.push({
      kind: 'insight',
      number: i.number,
      theme: i.theme.title,
      statement: text(i.statement),
      description: text(i.description),
      level: i.level,
      polarity: i.polarity,
      support: i.support,
      counter: i.counter,
      panel: i.panel,
      facts: i.facts ?? 0,
      counterEvidence: nuance(i.counterEvidence),
      minorityView: nuance(i.minorityView),
      quote: pickQuote(i.verbatims, input.names),
      toValidate: i.toValidate,
    })

  const nuances = insights
    .map((i) => ({
      statement: text(i.statement),
      counterEvidence: nuance(i.counterEvidence),
      minorityView: nuance(i.minorityView),
      toValidate: i.toValidate,
    }))
    .filter((n) => n.counterEvidence || n.minorityView)
  const nuancePages = pagesOf(nuances, NUANCES_PER_SLIDE)
  nuancePages.forEach((items, n) => {
    slides.push({ kind: 'nuances', page: n + 1, pages: nuancePages.length, items })
  })

  if (recommendations.length > 0) {
    const pages = pagesOf(recommendations, ROWS_PER_SLIDE)
    pages.forEach((rows, n) => {
      slides.push({
        kind: 'recommendations',
        page: n + 1,
        pages: pages.length,
        rows: rows.map((r) => ({
          number: r.number,
          action: text(r.action),
          kind: r.kind,
          impact: r.impact,
          effort: r.effort,
          priority: r.priority,
          evidence: r.evidence ?? null,
          toValidate: r.toValidate,
        })),
      })
    })
    slides.push({
      kind: 'matrix',
      items: recommendations.map((r) => ({
        number: r.number,
        action: text(r.action),
        kind: r.kind,
        impact: r.impact,
        effort: r.effort,
        toValidate: r.toValidate,
      })),
    })
  }

  // Who does what: the validated recommendations, else those shown (prototype).
  const validated = recommendations.filter((r) => !r.toValidate)
  const steps = validated.length > 0 ? validated : recommendations
  const stepPages = pagesOf(steps, ROWS_PER_SLIDE)
  stepPages.forEach((rows, n) => {
    slides.push({
      kind: 'nextSteps',
      page: n + 1,
      pages: stepPages.length,
      rows: rows.map((r) => ({
        action: text(r.action),
        owner: r.owner?.trim() || null,
        measure: text(r.successMeasure) || null,
        toValidate: r.toValidate,
      })),
    })
  })

  slides.push({ kind: 'thanks', title: input.project.name })
  return slides
}

/** cyrb53 of the deck: tells a published deck out of date; not a security hash. */
export const fingerprintOf = (deck: unknown): string => {
  const str = JSON.stringify(deck)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
