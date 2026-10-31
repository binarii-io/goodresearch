import type { QualityAi } from '../../application/ports.ts'
import { checkAnswer } from '../../domain/remarks.ts'
import { cutSentences } from '../../domain/sentences.ts'
import type { Excerpt } from './excerpts.ts'

export const REFERENCE_REF = 'quality-reference'

/** One excerpt as a part of an interview, and whether the app ends up keeping a remark on it. */
const isFlagged = async (ai: QualityAi['review'], accountId: string, e: Excerpt) => {
  const sentences = cutSentences('t2', e.sentence)
  const answers = await ai(accountId, REFERENCE_REF, {
    goal: 'Understand how people do this part of their work.',
    guide: [],
    turns: [
      { id: 't1', speaker: 'interviewee P01', text: e.said, context: false, sentences: [] },
      {
        id: 't2',
        speaker: 'interviewer',
        text: e.sentence,
        context: false,
        sentences: sentences.map((s) => ({ id: s.id, text: s.text })),
      },
    ],
  })
  const { remarks } = checkAnswer({ sentences, answers, earlierWords: e.said })
  return remarks.length > 0
}

export type ReferenceResult = {
  /** Simple reformulations flagged (SC-001: at most 1 in 30). */
  readonly simpleFlagged: readonly string[]
  readonly simpleTotal: number
  /** Reformulations with opinion missed (SC-002: at least 80% found). */
  readonly opinionMissed: readonly string[]
  readonly opinionTotal: number
  readonly calls: number
}

/** The two rates of the reference set, one call per excerpt, whatever the AI behind `review`. */
export const runReference = async (
  review: QualityAi['review'],
  accountId: string,
  set: { simple: readonly Excerpt[]; withOpinion: readonly Excerpt[] },
): Promise<ReferenceResult> => {
  const simpleFlagged: string[] = []
  const opinionMissed: string[] = []
  for (const e of set.simple)
    if (await isFlagged(review, accountId, e)) simpleFlagged.push(e.sentence)
  for (const e of set.withOpinion)
    if (!(await isFlagged(review, accountId, e))) opinionMissed.push(e.sentence)
  return {
    simpleFlagged,
    simpleTotal: set.simple.length,
    opinionMissed,
    opinionTotal: set.withOpinion.length,
    calls: set.simple.length + set.withOpinion.length,
  }
}

export const meetsTargets = (r: ReferenceResult) =>
  r.simpleFlagged.length <= Math.ceil(r.simpleTotal / 30) &&
  (r.opinionTotal - r.opinionMissed.length) / r.opinionTotal >= 0.8
