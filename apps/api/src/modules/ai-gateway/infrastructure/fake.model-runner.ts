import type { ChatMessage, ModelRequest, ModelRunner, StreamPart } from '../application/ports.ts'
import { MAX_STEPS, ProviderCallError } from '../application/ports.ts'
import type { Credential } from '../domain/provider.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let calls = 0

/** A fixed interview guide, as the assistant writes it (spec 006 research R8). */
const FAKE_GUIDE = {
  framing: {
    objectives: 'Understand how people plan their week.',
    hypotheses: ['People plan on Sunday evening.'],
    audience: 'Eight people who plan for a household.',
    format: '45 minutes by video call, recorded with consent.',
  },
  sections: [
    {
      kind: 'introduction',
      title: 'Introduction',
      minutes: 5,
      questions: [{ text: 'Could you introduce yourself in a few words?', followUps: [] }],
    },
    {
      kind: 'warm-up',
      title: 'About you',
      minutes: 5,
      questions: [{ text: 'How is a usual week organised for you?', followUps: ['For example?'] }],
    },
    {
      kind: 'theme',
      title: 'Planning the week',
      minutes: 30,
      questions: [
        {
          text: 'Tell me about the last time you planned your week.',
          followUps: ['What happened next?', 'Why that way?'],
        },
        { text: 'How do you keep track of changes during the week?', followUps: [] },
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Wrap-up',
      minutes: 5,
      questions: [{ text: 'Is there anything you would like to add?', followUps: [] }],
    },
  ],
}

/**
 * Scripted conversation of the test provider (spec 005 research R7, spec 006 R8): "propose goal"
 * and "propose study" call the matching tool for the project named in the context, "design the
 * interview guide" loads the skill then reports progress, "write the guide" checks the questions
 * then proposes a guide, "long answer" streams slowly (to test Stop), anything else echoes.
 */
const script = (request: ModelRequest): { parts: StreamPart[]; delayMs: number } => {
  const messages = request.messages ?? []
  const lastMessage = messages.at(-1)
  const ranTool = lastMessage?.role === 'tool' ? lastMessage.results[0]?.name : undefined
  const last = [...messages].reverse().find((m) => m.role === 'user')
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
  const guideStudy = /Study id: (\S+?)[),;\s]/.exec(`${request.system ?? ''} `)?.[1]
  if (ranTool === 'load_skill' && guideStudy)
    return {
      parts: [
        { type: 'text', delta: 'Let us design the guide. What are the main research themes?' },
        call('report_guide_progress', {
          studyId: guideStudy,
          objectives: 'partial',
          hypotheses: 'missing',
          audience: 'missing',
          format: 'missing',
          intro: 'missing',
          themes: 'missing',
          followUps: 'missing',
          biasReview: 'missing',
        }),
      ],
      delayMs: 0,
    }
  if (ranTool === 'check_guide_questions' && guideStudy)
    return {
      parts: [
        { type: 'text', delta: 'Here is the interview guide.' },
        call('propose_interview_guide', { studyId: guideStudy, guide: FAKE_GUIDE }),
      ],
      delayMs: 0,
    }
  // After any other tool run, the answer is over.
  if (ranTool) return { parts: [], delayMs: 0 }
  if (/design the interview guide/i.test(text) && offered('load_skill'))
    return { parts: [call('load_skill', { name: 'interview-guide-design' })], delayMs: 0 }
  if (/write the guide/i.test(text) && offered('check_guide_questions'))
    return {
      parts: [
        call('check_guide_questions', {
          questions: FAKE_GUIDE.sections.flatMap((s) => s.questions.map((q) => q.text)),
        }),
      ],
      delayMs: 0,
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
      // Spec 009: an interview analysis is answered from the speakers of the transcript, with one
      // quote that is not in it (the app must drop it).
      if (request.prompt?.startsWith('<transcript>')) {
        // Like a real model, an analysis takes a moment: the queue and spinners can be seen.
        await sleep(1500)
        const text = request.prompt.slice('<transcript>'.length)
        const lines = [...text.matchAll(/^([^:\n]{1,60}?)\s*:\s+(.{1,200})$/gm)]
        const speakers = [
          ...new Map(
            lines
              .filter((m) => !/^(participants?|attendees|invit)/i.test(m[1] ?? ''))
              .map((m) => [m[1]?.trim() ?? '', m[2] ?? '']),
          ).entries(),
        ]
        const [first, second] = speakers
        const answer = {
          interviewers: first ? [{ name: first[0], quote: first[1].slice(0, 120) }] : [],
          interviewees: [
            ...(second ? [{ name: second[0], quote: second[1].slice(0, 120) }] : []),
            { name: 'Nobody Here', quote: 'This sentence is not in the transcript.' },
          ],
          date: null,
        }
        const parsed = request.schema.safeParse(answer)
        if (!parsed.success) throw new ProviderCallError('UNKNOWN')
        return { object: parsed.data, usage: { inputTokens: 1200, outputTokens: 80 } }
      }
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
        // Like the AI SDK's steps: tools the app runs feed the next step, until none ran.
        let messages: ChatMessage[] = [...(request.messages ?? [])]
        let written = ''
        for (let step = 0; step < MAX_STEPS; step++) {
          const { parts: scripted, delayMs } = script({ ...request, messages })
          const ran: { id: string; name: string; output: string }[] = []
          const calls: { id: string; name: string; input: unknown }[] = []
          let text = ''
          for (const part of scripted) {
            if (delayMs) await sleep(delayMs)
            // A new step's text is a new paragraph, as with the AI SDK runner.
            if (part.type === 'text' && step > 0 && written && !text && !written.endsWith('\n\n')) {
              written += '\n\n'
              yield { type: 'text', delta: '\n\n' }
            }
            yield part
            if (part.type === 'text') {
              text += part.delta
              written += part.delta
            } else {
              calls.push(part.call)
              const tool = request.tools?.find((t) => t.name === part.call.name)
              if (tool?.run)
                ran.push({ ...part.call, output: await tool.run(part.call.input, part.call) })
            }
          }
          if (ran.length === 0) break
          messages = [
            ...messages,
            { role: 'assistant', content: text, toolCalls: calls },
            { role: 'tool', results: ran },
          ]
        }
        settle?.resolve(usage)
      }
      return { parts: parts(), done }
    },
  }
}
