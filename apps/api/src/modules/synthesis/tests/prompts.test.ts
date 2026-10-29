import { REGISTERS, WRITING_STYLE } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { createInsightsAi } from '../infrastructure/prompts/insights.ts'

/** Every call that writes prose a person reads asks for a human voice (style guide). */
describe('the writing style of the synthesis prompts', () => {
  const systems = new Map<string, string>()
  const answers: Record<string, object> = {
    insights: { insights: [] },
    'insight-translation': {
      statement: 'x',
      description: null,
      counterEvidence: null,
      minorityView: null,
      action: null,
      rationale: null,
      successMeasure: null,
      text: null,
    },
    recommendations: { recommendations: [] },
    takeaways: { sentences: [] },
  }
  const ai = createInsightsAi({
    gateway: () => ({
      providerOf: async () => 'anthropic',
      generateObject: (async (_a: string, task: string, request: { system?: string }) => {
        systems.set(task, request.system ?? '')
        return { object: answers[task] }
      }) as never,
    }),
    estimateCost: async () => 0,
    studyCosts: async () => new Map(),
  })

  it('sends the style guide and the register of each kind of text', async () => {
    await ai.insights('a', 'r', { goal: '', themes: [], facts: [], insights: [], avoid: [] })
    await ai.translate('a', 'r', { texts: { statement: 'x' }, from: 'en', to: 'fr' })
    await ai.recommendations('a', 'r', { goal: '', insights: [], recommendations: [], avoid: [] })
    await ai.takeaways('a', 'r', {
      goal: '',
      current: '',
      overview: [],
      insights: [],
      recommendations: [],
    })
    for (const [task, register] of [
      ['insights', REGISTERS.insight],
      ['insight-translation', REGISTERS.translation],
      ['recommendations', REGISTERS.recommendation],
      ['takeaways', REGISTERS.takeaways],
    ] as const) {
      expect(systems.get(task)).toContain(WRITING_STYLE)
      expect(systems.get(task)).toContain(register)
    }
  })
})
