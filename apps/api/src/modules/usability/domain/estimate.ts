/**
 * Tokens per video minute of the pipeline, by tier, calibrated on the trial of six sessions
 * (2026-11-07, about 0.10 USD per minute at the prices of then): the strong tier reads the audio,
 * maps the tasks, reads each task's video and arbitrates; the standard tier reads frames and judges.
 */
export const TOKENS_PER_MINUTE = {
  strong: { input: 35_000, output: 1_500 },
  standard: { input: 12_000, output: 800 },
} as const

/** Characters the gateway's estimate counts per token. */
const CHARS_PER_TOKEN = 4

/** What to ask the gateway's estimate for a number of video minutes, per tier. */
export const estimateInputs = (minutes: number) =>
  (['strong', 'standard'] as const).map((tier) => ({
    tier,
    inputChars: Math.ceil(minutes * TOKENS_PER_MINUTE[tier].input * CHARS_PER_TOKEN),
    outputTokens: Math.ceil(minutes * TOKENS_PER_MINUTE[tier].output),
  }))

/** Whole minutes of a length, at least one. */
export const minutesOf = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
