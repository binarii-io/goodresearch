import { describe, expect, it } from 'vitest'
import { ProviderCallError } from '../../ai-gateway/index.ts'
import { AiFailed, AiUnavailable } from '../application/ports.ts'
import { createLexiconAi } from '../infrastructure/prompts/lexicon.ts'

const failingWith = (failure: ConstructorParameters<typeof ProviderCallError>[0]) =>
  createLexiconAi({
    gateway: () =>
      ({
        generateObject: async () => {
          throw new ProviderCallError(failure)
        },
      }) as never,
    estimateCost: async () => null,
    studyCosts: async () => new Map(),
  })

const batch = { candidates: [], knownForms: [], language: 'en' } as never

describe('the AI of the lexicon readings', () => {
  it('tells apart a refused access, which stops the reading, from a passing failure', async () => {
    await expect(
      failingWith('INVALID_CREDENTIAL').propose('p1', 'r', batch),
    ).rejects.toBeInstanceOf(AiUnavailable)
    await expect(failingWith('UNREACHABLE').propose('p1', 'r', batch)).rejects.toBeInstanceOf(
      AiFailed,
    )
  })
})
