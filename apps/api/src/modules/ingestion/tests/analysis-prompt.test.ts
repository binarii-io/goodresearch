import { describe, expect, it } from 'vitest'
import { createAiAnalyzer } from '../infrastructure/prompts/analysis.ts'

describe('the AI of the analyses', () => {
  it('gives a long transcript more time than the default limit of a call', async () => {
    const seen: { ref?: string; timeoutMs?: number }[] = []
    const analyzer = createAiAnalyzer({
      gateway: () =>
        ({
          generateObject: async (
            _account: string,
            _task: string,
            _request: unknown,
            options: { ref?: string; timeoutMs?: number },
          ) => {
            seen.push(options)
            return { object: { interviewees: [], interviewers: [], date: null } }
          },
        }) as never,
      estimateCost: async () => null,
      studyCosts: async () => new Map(),
    })
    await analyzer.analyze('ada', 'session-analysis:s1', 'A long transcript')
    expect(seen).toEqual([{ ref: 'session-analysis:s1', timeoutMs: 120_000 }])
  })
})
