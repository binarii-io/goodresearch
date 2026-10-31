import {
  err,
  fold,
  fromPlaceholders,
  ok,
  type Person,
  type Result,
  sharedWords,
  withPlaceholders,
} from '@goodresearch/shared'
import type { RemarkKind, Stance } from './figures.ts'
import type { Sentence } from './sentences.ts'

/** Words shorter than this say too little about what a reformulation adds (research R4). */
const CONTENT_WORD_MIN = 4

export type SentAnswer = {
  readonly id: string
  readonly kind: 'question' | 'simple-reformulation' | 'other'
  readonly flag?:
    | {
        readonly kind: RemarkKind
        readonly reason: { readonly en: string; readonly fr: string }
        readonly recommendation: string | null
        readonly addedElement: string | null
        readonly excerpt: string | null
      }
    | undefined
}

export type FoundRemark = {
  readonly sentence: Sentence
  readonly kind: RemarkKind
  /** The turn's own words: the whole sentence, or the excerpt found in it. */
  readonly text: string
  /** Where it starts in the turn's text given to `cutSentences`. */
  readonly offset: number
  readonly length: number
  readonly reason: { readonly en: string; readonly fr: string }
  readonly recommendation: string | null
  readonly addedElement: string | null
}

const contentWords = (text: string) =>
  // A placeholder is one word: "[Person 2]" is not "[Person 1]".
  [...fold(text).matchAll(/\[person \d+\]|\p{L}+/gu)]
    .map((m) => m[0])
    .filter((w) => w.length >= CONTENT_WORD_MIN)

/**
 * Research R4: a reformulation adds something only if it names it, and it was not said. This
 * catches words, not meaning: a paraphrase passes (hence the reference set and the opinions).
 */
const addsSomething = (element: string | null, earlierWords: string) => {
  const wanted = contentWords(element ?? '')
  if (wanted.length === 0) return false
  const said = new Set(contentWords(earlierWords))
  return !wanted.every((w) => said.has(w))
}

/** Each place of `wanted` in `text`, ignoring case, spaces and apostrophe style. */
const places = (text: string, wanted: string) => {
  const parts = wanted.trim().split(/\s+/)
  const pattern = parts
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’ʼ`´]/g, "['’ʼ`´]"))
    .join('\\s+')
  return pattern ? [...text.matchAll(new RegExp(pattern, 'giu'))] : []
}

/** The excerpt in the sentence, ignoring case, spaces and apostrophe style; null when absent. */
const locate = (sentence: string, excerpt: string) => {
  const found = places(sentence, excerpt)[0]
  return found ? { at: found.index, text: found[0] } : null
}

/**
 * The excerpt the AI quotes with placeholders, as the sentence writes it: found in the text it was
 * sent, then read at the same place in the sentence, so "Sam Example" and "Sam" each stay what they
 * are. As it came when not there: the check then leaves it out.
 */
export const excerptAsWritten = (
  sentence: string,
  sent: {
    readonly text: string
    readonly cuts: readonly {
      readonly start: number
      readonly end: number
      readonly placeholder: string
    }[]
  },
  excerpt: string,
): string => {
  const found = locate(sent.text, excerpt)
  if (!found) return excerpt
  const inSentence = (at: number) => {
    let shift = 0
    for (const c of sent.cuts) {
      if (at <= c.start + shift) break
      shift += c.placeholder.length - (c.end - c.start)
    }
    return at - shift
  }
  return sentence.slice(inSentence(found.at), inSentence(found.at + found.text.length))
}

/**
 * FR-003, FR-004: what the app keeps of the AI's answer on a part. Only sentences it cut were sent,
 * all from interviewers' turns, so a remark's text is exact by construction.
 */
export const checkAnswer = (input: {
  readonly sentences: readonly Sentence[]
  readonly answers: readonly SentAnswer[]
  /** What interviewees said before these sentences, in the whole interview. */
  readonly earlierWords: string
}) => {
  const byId = new Map(input.sentences.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const remarks: FoundRemark[] = []
  const simple: Sentence[] = []
  let questions = 0
  let leftOut = 0
  for (const answer of input.answers) {
    const sentence = byId.get(answer.id)
    if (!sentence) {
      leftOut++
      continue
    }
    if (seen.has(answer.id)) continue
    seen.add(answer.id)
    const flag = answer.flag
    if (answer.kind === 'question' || flag?.kind === 'leading-question') questions++
    if (!flag) {
      if (answer.kind === 'simple-reformulation') simple.push(sentence)
      continue
    }
    if (
      flag.kind === 'reformulation-with-opinion' &&
      !addsSomething(flag.addedElement, input.earlierWords)
    ) {
      simple.push(sentence)
      leftOut++
      continue
    }
    const place = flag.excerpt ? locate(sentence.text, flag.excerpt) : null
    if (flag.excerpt && !place) {
      leftOut++
      continue
    }
    remarks.push({
      sentence,
      kind: flag.kind,
      text: place?.text ?? sentence.text,
      offset: sentence.offset + (place?.at ?? 0),
      length: place?.text.length ?? sentence.length,
      reason: flag.reason,
      recommendation: flag.recommendation,
      addedElement: flag.addedElement,
    })
  }
  return { remarks, simple, questions, leftOut }
}

type Opinionated = {
  readonly origin: 'ai' | 'person'
  readonly stance: Stance | null
  readonly stanceBy: string | null
  readonly stanceAt: Date | null
  readonly version: number
}

/**
 * FR-007: a person agrees, disagrees or withdraws their opinion. It changes the counts and nothing
 * else. A person's own remark is agreed by nature: it can only be withdrawn.
 */
export const setStance = <R extends Opinionated>(
  remark: R,
  stance: Stance | null,
  by: string,
  at: Date,
): Result<R, 'PERSON_REMARK_STANCE'> => {
  if (remark.origin === 'person') return err('PERSON_REMARK_STANCE')
  return ok({
    ...remark,
    stance,
    stanceBy: stance ? by : null,
    stanceAt: stance ? at : null,
    version: remark.version + 1,
  })
}

/** FR-008a: a simple reformulation a person reads otherwise becomes their remark, agreed. */
export const requalified = <
  S extends {
    readonly sessionId: string
    readonly studyId: string
    readonly segmentId: string
    readonly offset: number
    readonly length: number
    readonly text: string
    readonly speakerLabel: string
  },
>(
  reformulation: S,
  input: {
    readonly id: string
    readonly reason: string
    readonly recommendation?: string | undefined
    readonly by: string
    readonly at: Date
  },
) => ({
  id: input.id,
  sessionId: reformulation.sessionId,
  studyId: reformulation.studyId,
  runId: null,
  segmentId: reformulation.segmentId,
  offset: reformulation.offset,
  length: reformulation.length,
  text: reformulation.text,
  speakerLabel: reformulation.speakerLabel,
  kind: 'reformulation-with-opinion' as const,
  reason: null,
  reasonPerson: input.reason.trim(),
  recommendation: input.recommendation?.trim() || null,
  addedElement: null,
  origin: 'person' as const,
  stance: 'agree' as const,
  stanceBy: input.by,
  stanceAt: input.at,
  version: 1,
})

type TextTurn = {
  readonly id: string
  readonly speaker: string | null
  readonly text: string
}

const normal = (text: string) => fold(text).replace(/\s+/g, ' ').trim()

type Placed = {
  readonly segmentId: string
  readonly speakerLabel: string
  readonly text: string
}

/** A corrected sentence shares this share of its words, both ways, with what it was. */
const SAME_SENTENCE = 0.8

/**
 * FR-011: what a new reading adds to what people said. A remark with an opinion or from a person
 * stays, so a sentence it covers gets no second remark, is not simple, and what someone disagreed
 * with is never raised again. Those without an opinion are replaced (they are simply not `kept`).
 * A remark no longer found in the text covers the same speaker's sentence nearly the same: a
 * corrected word does not raise again what someone disagreed with.
 */
export const mergeReview = <R extends Placed, S extends Placed>(input: {
  readonly remarks: readonly R[]
  readonly reformulations: readonly S[]
  readonly turns: readonly TextTurn[]
  readonly existing: readonly (Placed & {
    readonly offset: number
    readonly origin: 'ai' | 'person'
    readonly stance: Stance | null
  })[]
}) => {
  const kept = input.existing
    .filter((e) => e.origin === 'person' || e.stance !== null)
    .map((remark) => ({ remark, place: reanchor(remark, input.turns) }))
  const covered = (found: Placed) => {
    const text = normal(found.text)
    return kept.some(({ remark: k, place }) => {
      if (!place)
        return (
          k.speakerLabel === found.speakerLabel &&
          sharedWords(found.text, k.text) >= SAME_SENTENCE &&
          sharedWords(k.text, found.text) >= SAME_SENTENCE
        )
      if (place.segmentId !== found.segmentId) return false
      const other = normal(k.text)
      return other.includes(text) || text.includes(other)
    })
  }
  return {
    remarks: input.remarks.filter((r) => !covered(r)),
    reformulations: input.reformulations.filter((r) => !covered(r)),
  }
}

/**
 * FR-012: a remark in the current text: first in its turn, at the occurrence nearest its old place,
 * then in the other turns of the same speaker. Null when it is gone: flagged, never deleted.
 */
export const reanchor = (
  remark: {
    readonly segmentId: string
    readonly offset: number
    readonly text: string
    readonly speakerLabel: string
  },
  turns: readonly TextTurn[],
): { segmentId: string; offset: number; length: number } | null => {
  const own = turns.find((t) => t.id === remark.segmentId)
  const others = turns.filter((t) => t.id !== remark.segmentId && t.speaker === remark.speakerLabel)
  for (const turn of own ? [own, ...others] : others) {
    const found = places(turn.text, remark.text).sort(
      (a, b) => Math.abs(a.index - remark.offset) - Math.abs(b.index - remark.offset),
    )[0]
    if (found) return { segmentId: turn.id, offset: found.index, length: found[0].length }
  }
  return null
}

/** What a name reads under anonymisation: a person's code, "[Person]" for anyone else. */
const maskOf = (names: ReadonlyMap<string, string>, people: readonly Person[]) =>
  new Map(
    [...names].map(([placeholder, name]) => [
      placeholder,
      people.find((p) => p.name === name)?.code || '[Person]',
    ]),
  )

/** The names known in a text, as anonymisation shows them (spec 016 US1). */
export const nameMask =
  (people: readonly Person[], known: readonly string[]) =>
  (text: string): string => {
    const hidden = withPlaceholders(text, [...people.map((p) => p.name), ...known])
    return fromPlaceholders(hidden.text, maskOf(hidden.names, people))
  }

/** The AI's words back from placeholders: the names, or what anonymisation shows of them. */
export const namesBack = (
  placeholders: ReadonlyMap<string, string>,
  people: readonly Person[],
  anonymised: boolean,
) => {
  const names = anonymised ? maskOf(placeholders, people) : placeholders
  return (value: string) => fromPlaceholders(value, names)
}
