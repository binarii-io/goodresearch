import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ProviderCallError, requestText } from '../application/ports.ts'
import { makeEstimateCost } from '../application/queries/usage-costs.ts'
import { createAiSdkRunner, withVideoOffsets } from '../infrastructure/ai-sdk.model-runner.ts'
import { aiWorld } from './fakes/in-memory-ai.ts'

const sharedVertex = {
  credential: {
    provider: 'vertex' as const,
    serviceAccount: 'instance' as const,
    project: 'example-shared',
    region: 'eu',
  },
  model: 'v-model',
  teams: null,
}

describe('spec 038 — video and images through the gateway', () => {
  it('uses the strong model for a strong call, and records it', async () => {
    const world = aiWorld({ shared: sharedVertex })
    await world.gateway.generateObject(
      'ada',
      'usability-task',
      { prompt: 'x', schema: z.object({ answer: z.string() }) },
      { tier: 'strong', ref: 'usability-analysis:s1' },
    )
    expect(world.model.calls.at(-1)?.model).toBe('v-strong')
    expect(world.usage.at(-1)).toMatchObject({ model: 'v-strong', ref: 'usability-analysis:s1' })
    await world.gateway.generateObject('ada', 'usability-judge', {
      prompt: 'x',
      schema: z.object({ answer: z.string() }),
    })
    expect(world.model.calls.at(-1)?.model).toBe('v-model')
  })

  it('gives the Google access of the Vertex AI serving the person, none otherwise', async () => {
    const world = aiWorld({ shared: sharedVertex })
    expect(await world.gateway.googleAccessFor('ada')).toEqual({
      project: 'example-shared',
      region: 'eu',
      accessToken: 'service-access',
    })
    expect(await aiWorld().gateway.googleAccessFor('ada')).toBeNull()
  })

  it('tells the kind of the provider serving the person (usability tests need Vertex AI)', async () => {
    expect(await aiWorld({ shared: sharedVertex }).queries.gate('ada')).toMatchObject({
      kind: 'vertex',
    })
    expect(await aiWorld().queries.gate('ada')).toMatchObject({ kind: null })
  })

  it('prices an estimate with the tier asked', async () => {
    const world = aiWorld({ shared: sharedVertex })
    const estimate = makeEstimateCost({
      ...world.deps,
      config: {
        ...world.deps.config,
        prices: [
          { model: 'v-model', from: '2026-01-01', inputPerMillion: 1, outputPerMillion: 0 },
          { model: 'v-strong', from: '2026-01-01', inputPerMillion: 2, outputPerMillion: 0 },
        ],
      },
    })
    expect(await estimate('ada', 4_000_000, 0)).toBe(1)
    expect(await estimate('ada', 4_000_000, 0, 'strong')).toBe(2)
  })

  it('reads the text of a request made of parts', () => {
    expect(
      requestText({
        parts: [
          { type: 'text', text: '<usability:judge>' },
          { type: 'image', data: new Uint8Array([1]), mimeType: 'image/jpeg' },
          { type: 'text', text: 'rest' },
        ],
      }),
    ).toBe('<usability:judge>\nrest')
  })

  it('refuses a video for a provider that cannot read it', async () => {
    const runner = createAiSdkRunner({ google: null })
    await expect(
      runner.generateObject(
        { provider: 'anthropic', apiKey: 'sk-made-up' },
        'a-model',
        {
          parts: [{ type: 'file', uri: 'gs://bucket/video.mp4', mimeType: 'video/mp4' }],
          schema: z.object({ answer: z.string() }),
        },
        1000,
      ),
    ).rejects.toEqual(new ProviderCallError('MEDIA_NOT_SUPPORTED'))
  })

  it('moves the part of a video to read into the request to Vertex AI', async () => {
    let sent = ''
    const fetch = withVideoOffsets(async (_input, init) => {
      sent = String(init?.body)
      return new Response('{}')
    })
    await fetch('https://example.test', {
      method: 'POST',
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'read it' },
              {
                fileData: {
                  fileUri: 'gs://bucket/v.mp4#goodresearch-offsets=12.5,40',
                  mimeType: 'video/mp4',
                },
              },
            ],
          },
        ],
      }),
    })
    expect(JSON.parse(sent).contents[0].parts[1]).toEqual({
      fileData: { fileUri: 'gs://bucket/v.mp4', mimeType: 'video/mp4' },
      videoMetadata: { startOffset: '12.5s', endOffset: '40s' },
    })
  })
})
