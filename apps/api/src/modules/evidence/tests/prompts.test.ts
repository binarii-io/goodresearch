import { REGISTERS, WRITING_STYLE } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { createFactsAi } from '../infrastructure/prompts/facts.ts'

/** Facts and their translations ask for a human voice; verbatims stay exact quotes. */
describe('the writing style of the facts prompts', () => {
  const systems = new Map<string, string>()
  const answers: Record<string, object> = {
    'fact-verbatims': { verbatims: [] },
    facts: { facts: [] },
    'fact-translation': { statement: 'x' },
  }
  const ai = createFactsAi({
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

  it('sends the style guide to the fact pass and the translation, not to the verbatim pass', async () => {
    await ai.verbatims('a', 'r', { goal: '', themes: [], turns: [] })
    await ai.facts('a', 'r', { goal: '', themes: [], existing: [], verbatims: [] })
    await ai.translate('a', 'r', { text: 'x', from: 'en', to: 'fr' })
    expect(systems.get('facts')).toContain(WRITING_STYLE)
    expect(systems.get('facts')).toContain(REGISTERS.fact)
    expect(systems.get('fact-translation')).toContain(REGISTERS.translation)
    expect(systems.get('fact-verbatims')).not.toContain(WRITING_STYLE)
  })
})
