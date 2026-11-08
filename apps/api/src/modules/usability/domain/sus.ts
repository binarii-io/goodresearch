/** The System Usability Scale's ten items, answered from 1 (strongly disagree) to 5 (strongly agree). */
export const SUS_ITEMS = 10

/**
 * Standard SUS scoring (Brooke 1986): odd items count `answer − 1`, even items `5 − answer`, the
 * sum times 2.5 gives 0 to 100. Null unless all ten answers are there and valid (spec 038 FR-014).
 */
export const susScore = (answers: ReadonlyMap<number, number>): number | null => {
  let sum = 0
  for (let item = 1; item <= SUS_ITEMS; item++) {
    const a = answers.get(item)
    if (a === undefined || !Number.isInteger(a) || a < 1 || a > 5) return null
    sum += item % 2 === 1 ? a - 1 : 5 - a
  }
  return sum * 2.5
}

/** The mean of the scores there are, with how many; null without any. */
export const susMean = (scores: readonly (number | null)[]) => {
  const known = scores.filter((s): s is number => s !== null)
  return {
    mean: known.length
      ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10
      : null,
    sessions: known.length,
  }
}
