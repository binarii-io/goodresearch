import type {
  QuestionnaireContent,
  QuestionnaireItem,
  QuestionnaireSection,
} from './questionnaire.ts'

/**
 * Writing rules of a questionnaire (spec 027 FR-007), checked by the app, not by the model, for
 * English and French. Heuristics: they flag what to review, they never block.
 */
export type ItemFlag =
  | 'double'
  | 'negation'
  | 'leading'
  | 'absolute'
  | 'too-long'
  | 'factual-on-likert'
  | 'identifying'

export type QuestionnaireFlag =
  | 'legends-differ'
  | 'closed-series'
  | 'no-profiling'
  | 'too-many-open'

const MAX_WORDS = 30
const MAX_CLOSED_SERIES = 10
const MIN_OPEN = 5

/** JavaScript's `\b` only knows ASCII letters: rules are compiled with a Unicode boundary. */
const LETTER = '[\\p{L}\\p{N}_]'
const BOUNDARY = `(?:(?<!${LETTER})(?=${LETTER})|(?<=${LETTER})(?!${LETTER}))`
const unicode = (rule: RegExp): RegExp => new RegExp(rule.source.replaceAll('\\b', BOUNDARY), 'u')

const RULES: Record<'double' | 'negation' | 'leading' | 'absolute' | 'identifying', RegExp[]> = {
  double: [/\b(and|et)\b/],
  negation: [/\b(not|never|no)\b/, /n't\b/, /\bne\b/, /\bn'/, /\bpas\b/],
  leading: [
    /\b(obviously|clearly|of course|surely)\b/,
    /\bwouldn't you agree\b/,
    /,\s*right\s*\?$/,
    /\b(évidemment|bien sûr|forcément|clairement)\b/,
    /n'est-ce pas/,
  ],
  absolute: [
    /\b(always|never|every|everyone|nobody|none)\b/,
    /\b(toujours|jamais|chaque|tous|toutes|aucun|aucune)\b/,
  ],
  identifying: [
    /\b(first name|last name|surname|full name|your name|e-?mail|phone number|home address)\b/,
    /\b(prénom|nom de famille|votre nom|e-?mail|courriel|numéro de téléphone|adresse postale)\b/,
  ],
}

const COMPILED = Object.fromEntries(
  Object.entries(RULES).map(([flag, rules]) => [flag, rules.map(unicode)]),
) as typeof RULES

const legend = (item: QuestionnaireItem) =>
  item.kind === 'likert' ? `${item.points}|${item.lowLabel}|${item.highLabel}` : null

export const checkItem = (item: QuestionnaireItem): ItemFlag[] => {
  const text = item.text.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase()
  const found: ItemFlag[] = (Object.keys(COMPILED) as (keyof typeof COMPILED)[]).filter(
    (flag) =>
      !(flag === 'identifying' && item.contact) && COMPILED[flag].some((rule) => rule.test(text)),
  )
  if ((text.match(/\?/g)?.length ?? 0) > 1 && !found.includes('double')) found.push('double')
  if (text.split(' ').length > MAX_WORDS) found.push('too-long')
  if (item.kind === 'likert' && item.measure === 'factual') found.push('factual-on-likert')
  return found
}

export const checkSections = (sections: readonly QuestionnaireSection[]): QuestionnaireFlag[] => {
  const items = sections.flatMap((s) => s.items).filter((i) => !i.contact)
  const flags: QuestionnaireFlag[] = []
  const legends = new Set(items.map(legend).filter((l) => l !== null))
  if (legends.size > 1) flags.push('legends-differ')
  let series = 0
  let longest = 0
  for (const item of items) {
    series = item.kind === 'open' ? 0 : series + 1
    longest = Math.max(longest, series)
  }
  if (longest > MAX_CLOSED_SERIES) flags.push('closed-series')
  if (!sections.some((s) => s.kind === 'profiling' && s.items.length > 0))
    flags.push('no-profiling')
  const open = items.filter((i) => i.kind === 'open').length
  if (open >= MIN_OPEN && open * 3 > items.length) flags.push('too-many-open')
  return flags
}

/** Common rules of thumb per kind, and reading the consent; shown as an estimate (FR-008). */
const SECONDS = { likert: 8, 'single-choice': 12, 'multiple-choice': 12, open: 45 } as const
const CONSENT_SECONDS = 30

export const estimateMinutes = (sections: readonly QuestionnaireSection[]): number =>
  Math.ceil(
    sections.flatMap((s) => s.items).reduce((sum, i) => sum + SECONDS[i.kind], CONSENT_SECONDS) /
      60,
  )

/** What the person is told is randomised (FR-015): the published form follows the same rule. */
export const randomisationOf = (content: QuestionnaireContent) => {
  const gridded = (section: QuestionnaireSection) =>
    section.kind === 'theme' &&
    section.items.some((item, i) => {
      const next = section.items[i + 1]
      return (
        item.kind === 'likert' &&
        next !== undefined &&
        legend(item) === legend(next) &&
        item.required === next.required
      )
    })
  return {
    optionsShuffled: content.sections.some((s) =>
      s.items.some(
        (i) => (i.kind === 'single-choice' || i.kind === 'multiple-choice') && !i.ordered,
      ),
    ),
    itemsShuffled: content.framing.shuffle && content.sections.some(gridded),
    themesFixed: true,
  }
}
