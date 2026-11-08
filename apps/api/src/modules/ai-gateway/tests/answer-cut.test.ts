import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isInvalidAnswer, ProviderCallError, type Usage } from '../application/ports.ts'
import { askAgainIfCut, outputLimitFor } from '../infrastructure/ai-sdk.model-runner.ts'
import { aiWorld } from './fakes/in-memory-ai.ts'

const cut = (outputTokens: number) =>
  new ProviderCallError('ANSWER_INCOMPLETE', { inputTokens: 10, outputTokens }, null, true)

describe('an answer cut by the output limit', () => {
  it('is asked once more with twice the room, its cost added to the call', async () => {
    const limits: (number | undefined)[] = []
    const result = await askAgainIfCut(24_000, 65_536, async (limit) => {
      limits.push(limit)
      if (limits.length === 1) throw cut(24_000)
      return { object: 'ok', usage: { inputTokens: 10, outputTokens: 30_000 } as Usage }
    })
    expect(limits).toEqual([24_000, 48_000])
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 54_000 })
  })

  it('cut twice: an incomplete answer with the cost of both calls', async () => {
    const error = await askAgainIfCut(24_000, 65_536, async (limit) => {
      throw cut(limit ?? 0)
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({
      failure: 'ANSWER_INCOMPLETE',
      usage: { inputTokens: 20, outputTokens: 72_000 },
    })
    expect(isInvalidAnswer(error as ProviderCallError)).toBe(true)
  })

  it('is not asked again at the maximum, nor when it was not cut', async () => {
    let calls = 0
    await askAgainIfCut(65_536, 65_536, async () => {
      calls++
      throw cut(65_536)
    }).catch(() => undefined)
    await askAgainIfCut(8_000, 65_536, async () => {
      calls++
      throw new ProviderCallError('ANSWER_INCOMPLETE', null)
    }).catch(() => undefined)
    expect(calls).toBe(2)
  })

  it('leaves Gemini room to think within its maximum, other providers as asked', () => {
    expect(outputLimitFor('vertex', 8000)).toBe(24_000)
    expect(outputLimitFor('vertex', 60_000)).toBe(65_536)
    expect(outputLimitFor('anthropic', 8000)).toBe(8000)
  })

  it('is logged as a failed call of the shared provider, not as it refusing', async () => {
    const world = aiWorld({
      shared: {
        credential: {
          provider: 'vertex' as const,
          serviceAccount: 'instance' as const,
          project: 'example-shared',
          region: 'eu',
        },
        model: 'v-model',
        teams: null,
      },
    })
    world.model.failNext('ANSWER_INCOMPLETE', { inputTokens: 10, outputTokens: 24_000 })
    await expect(
      world.gateway.generateObject('ada', 'cleaning', {
        prompt: 'x',
        schema: z.object({ answer: z.string() }),
      }),
    ).rejects.toMatchObject({ failure: 'ANSWER_INCOMPLETE' })
    expect(world.warnings.at(-1)?.message).toBe('a call to the shared AI provider failed')
    world.model.failNext('INVALID_CREDENTIAL')
    await world.gateway
      .generateObject('ada', 'cleaning', { prompt: 'x', schema: z.object({ answer: z.string() }) })
      .catch(() => undefined)
    expect(world.warnings.at(-1)?.message).toBe('the shared AI provider refused a call')
  })
})
