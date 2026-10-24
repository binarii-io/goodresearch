import type { ModelRunner } from '../application/ports.ts'
import { ProviderCallError } from '../application/ports.ts'
import type { Credential } from '../domain/provider.ts'

/**
 * Test provider (dev stack and tests only, `AI_FAKE_PROVIDER`, research R8): keys starting with
 * `test-ok` work, `test-quota` has no credit, anything else is invalid. Answers "OK".
 */
export const createFakeRunner = (): ModelRunner => {
  const check = (credential: Credential) => {
    const key = credential.provider === 'vertex' ? '' : credential.apiKey
    if (key.startsWith('test-ok')) return
    throw new ProviderCallError(
      key.startsWith('test-quota') ? 'NO_CREDIT_OR_QUOTA' : 'INVALID_CREDENTIAL',
    )
  }
  const usage = { inputTokens: 8, outputTokens: 1 }
  return {
    generateText: async (credential) => {
      check(credential)
      return { text: 'OK', usage }
    },
    generateObject: async (credential, _model, request) => {
      check(credential)
      // Only schemas with defaults can be answered without a model.
      const parsed = request.schema.safeParse({})
      if (!parsed.success) throw new ProviderCallError('UNKNOWN')
      return { object: parsed.data, usage }
    },
    streamText: (credential) => {
      const done = (async () => {
        check(credential)
        return usage
      })()
      async function* textStream() {
        await done
        yield 'OK'
      }
      return { textStream: textStream(), done }
    },
  }
}
