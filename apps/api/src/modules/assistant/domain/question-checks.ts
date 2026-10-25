/**
 * Writing constraints of interview questions (spec 006), checked by the app, not by the model:
 * the rules of the interview best practices, for English and French. Heuristics: they flag what to
 * review, they never block.
 */
export const QUESTION_ISSUES = [
  'closed',
  'leading',
  'hypothetical',
  'future',
  'solution',
  'double',
  'long',
] as const
export type QuestionIssue = (typeof QUESTION_ISSUES)[number]

/** Main questions longer than this are hard to follow when spoken. */
const MAX_WORDS = 30

/**
 * JavaScript's `\b` only knows ASCII letters: after "é" or "ù" it never matches. Rules are
 * written with `\b` and compiled with a Unicode letter boundary instead.
 */
const LETTER = '[\\p{L}\\p{N}_]'
const BOUNDARY = `(?:(?<!${LETTER})(?=${LETTER})|(?<=${LETTER})(?!${LETTER}))`
const unicode = (rule: RegExp): RegExp => new RegExp(rule.source.replaceAll('\\b', BOUNDARY), 'u')

const SOURCES: Record<Exclude<QuestionIssue, 'double' | 'long'>, readonly RegExp[]> = {
  // Answered by yes or no: auxiliary first, "est-ce que", or an inverted verb first.
  closed: [
    /^(do|does|did|is|are|was|were|can|could|have|has|had|will|would|should|shall)(n't)?\b/,
    /^est-ce qu/,
    /^[\p{L}]+-(vous|tu|ils?|elles?|on)\b/u,
  ],
  // Suggests the expected answer.
  leading: [
    /\b(don't|doesn't|isn't|aren't|wasn't|didn't|won't|wouldn't) (you|it|they|we)\b.*\?$/,
    /^(don't|doesn't|isn't|aren't|wouldn't|didn't|won't)\b/,
    /,\s*right\s*\?$/,
    /\bwouldn't you agree\b/,
    /n'est-ce pas/,
    /,\s*non\s*\?$/,
    /\bvous ne trouvez pas\b/,
  ],
  hypothetical: [
    /\bif you (had|could|were|was)\b/,
    /\b(imagine|suppose|pretend)\b/,
    /\bsi vous (aviez|pouviez|étiez|deviez)\b/,
    /\b(imaginez|imaginons|supposons)\b/,
  ],
  // Asks to predict one's own behaviour.
  future: [
    /\bwould you (use|pay|buy|like|want|try|prefer|recommend)\b/,
    /\bwill you\b/,
    /\bare you going to\b/,
    /\b[\p{L}]+(riez|rais|rait)-(vous|tu)\b/u,
    /\bseriez-vous prêt/,
  ],
  // Asks the participant to design the product.
  solution: [
    /\bwhat (feature|features|functionality)\b/,
    /\bshould we (build|add|make|develop)\b/,
    /\bwhat would you (want|like) us to\b/,
    /\bque faudrait-il\b/,
    /\bquelles? fonctionnalités?\b/,
    /\bque devrions-nous\b/,
  ],
}

const RULES = Object.fromEntries(
  Object.entries(SOURCES).map(([issue, rules]) => [issue, rules.map(unicode)]),
) as Record<keyof typeof SOURCES, RegExp[]>

const DOUBLE = unicode(/\b(and|et) (how|why|what|who|when|where|comment|pourquoi|qui|quand|où)\b/)

/**
 * A polite way to open an open question ("Could you tell me about…", "Pourriez-vous me
 * raconter…"): not a yes/no question, nor one about the future (PR #6 review).
 */
const POLITE = [
  unicode(
    /^(could|can|would|will) you (please )?(tell|describe|walk|explain|share|talk|give|show|introduce)\b/,
  ),
  unicode(
    /^(pouvez|pourriez|voudriez)-vous (me |nous )?(raconter|décrire|expliquer|parler|dire|présenter|montrer|partager)\b/,
  ),
]

export const checkQuestion = (question: string): QuestionIssue[] => {
  const text = question.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase()
  const polite = POLITE.some((rule) => rule.test(text))
  const found: QuestionIssue[] = (Object.keys(RULES) as (keyof typeof RULES)[]).filter(
    (issue) =>
      !(polite && (issue === 'closed' || issue === 'future')) &&
      RULES[issue].some((rule) => rule.test(text)),
  )
  const marks = text.match(/\?/g)?.length ?? 0
  if (marks > 1 || DOUBLE.test(text)) found.push('double')
  if (text.split(' ').length > MAX_WORDS) found.push('long')
  return found
}
