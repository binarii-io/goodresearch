import type { ModelRequest, ModelRunner, StreamPart } from '../application/ports.ts'
import { ProviderCallError } from '../application/ports.ts'
import type { Credential } from '../domain/provider.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let calls = 0

/**
 * Scripted conversation of the test provider (spec 005 research R7): "propose goal" and "propose
 * study" call the matching tool for the project named in the context, "long answer" streams slowly
 * (to test Stop), anything else echoes the message.
 */
const script = (request: ModelRequest): { parts: StreamPart[]; delayMs: number } => {
  const last = [...(request.messages ?? [])].reverse().find((m) => m.role === 'user')
  // The assistant starts each message with where it was sent from (spec 005): not part of the text.
  const text = (last?.role === 'user' ? last.content : (request.prompt ?? '')).replace(
    /^\[[^\]]*\]\n/,
    '',
  )
  const projectId = /Project id: (\S+)/.exec(request.system ?? '')?.[1]
  const offered = (name: string) => request.tools?.some((t) => t.name === name) ?? false
  const call = (name: string, input: unknown): StreamPart => {
    calls += 1
    return { type: 'tool-call', call: { id: `fake-call-${Date.now()}-${calls}`, name, input } }
  }
  if (/propose goal/i.test(text) && projectId && offered('update_project_goal'))
    return {
      parts: [
        { type: 'text', delta: 'Here is a proposal for the research goal.' },
        call('update_project_goal', {
          projectId,
          goal: 'Understand why new users drop off during their first week.',
        }),
      ],
      delayMs: 0,
    }
  const anyProject = /project id (\S+?)\)/.exec(request.system ?? '')?.[1]
  const studyId = /Study id: (\S+?)[),;\s]/.exec(`${request.system ?? ''} `)?.[1]
  if (/open project/i.test(text) && anyProject && offered('open_project'))
    return {
      parts: [
        { type: 'text', delta: 'Opening it.' },
        call('open_project', { projectId: anyProject }),
      ],
      delayMs: 0,
    }
  const tab = /open (preparation|fieldwork|analysis)/i.exec(text)?.[1]?.toLowerCase()
  if (tab && studyId && offered('open_study'))
    return {
      parts: [
        { type: 'text', delta: 'Switching tab.' },
        call('open_study', { studyId, phase: tab }),
      ],
      delayMs: 0,
    }
  if (/open study/i.test(text) && studyId && offered('open_study'))
    return {
      parts: [{ type: 'text', delta: 'Opening it.' }, call('open_study', { studyId })],
      delayMs: 0,
    }
  if (/propose study/i.test(text) && projectId && offered('create_study'))
    return {
      parts: [
        { type: 'text', delta: 'I suggest this study.' },
        call('create_study', { projectId, name: 'Interviews with new users' }),
      ],
      delayMs: 0,
    }
  const slow = /long answer/i.test(text)
  const words = slow
    ? Array.from({ length: 300 }, (_, i) => `word${i} `)
    : `You said: ${text}`.split(/(?<= )/)
  return { parts: words.map((delta) => ({ type: 'text', delta })), delayMs: slow ? 30 : 0 }
}

/**
 * Test provider (dev stack and tests only, `AI_FAKE_PROVIDER`, research R8): keys starting with
 * `test-ok` work, `test-quota` has no credit, anything else is invalid. Answers "OK", or follows
 * the conversation script when streaming.
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
    // Like the AI SDK: `done` settles only once the stream has been read to its end.
    stream: (credential, _model, request) => {
      let settle: { resolve: (u: typeof usage) => void; reject: (e: unknown) => void } | undefined
      const done = new Promise<typeof usage>((resolve, reject) => {
        settle = { resolve, reject }
      })
      async function* parts(): AsyncGenerator<StreamPart> {
        try {
          check(credential)
        } catch (error) {
          settle?.reject(error)
          throw error
        }
        const { parts: scripted, delayMs } = script(request)
        for (const part of scripted) {
          if (delayMs) await sleep(delayMs)
          yield part
        }
        settle?.resolve(usage)
      }
      return { parts: parts(), done }
    },
  }
}
