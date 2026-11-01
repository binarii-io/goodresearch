import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }
const home = { kind: 'home' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string, actor = ada) =>
  collect(world.send.send({ actor, conversationId, text, page: home, language: 'en' }))
const toolNames = () => world.model.requests.at(-1)?.tools?.map((t) => t.name) ?? []
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')

const done = {
  question: 'done',
  audience: 'done',
  decision: 'done',
  hypotheses: 'done',
  team: 'done',
}
const project = {
  name: 'Drop-off',
  teamId: 't1',
  question: 'Why?',
  objectives: 'Fix',
  hypotheses: '',
}

const frame = async (states: Record<string, string> = done) => {
  world.model.answer([call('report_project_progress', states, `report-${Math.random()}`)])
  await send('Framing')
  world.clock.advance(1000)
}
const propose = async (input: unknown = project, id = 'call-create') => {
  world.model.answer([call('create_project', input, id)])
  return send('Propose it')
}
const applied = async () => {
  await frame()
  await propose()
  world.clock.advance(1000)
  return world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') })
}

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 018 US1 — frame a project in a dialogue', () => {
  it('offers the framing skill and tools on every page, and the guide skill only on a study', async () => {
    await send('Hello')
    expect(toolNames()).toEqual(
      expect.arrayContaining(['create_project', 'load_skill', 'report_project_progress']),
    )
    expect(toolNames()).not.toContain('check_guide_questions')
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('project-framing (')
    expect(system).not.toContain('interview-guide-design (')
  })

  it('loads the framing skill, and refuses the guide skill away from a study', async () => {
    world.model.answer([call('load_skill', { name: 'project-framing' })])
    await send('Help me create a project')
    expect(world.model.outputs[0]).toContain('# Skill: frame a research project')
    world.model.answer([call('load_skill', { name: 'interview-guide-design' }, 'guide')])
    await send('Design a guide')
    expect(world.model.outputs[1]).toContain('Unknown skill')
  })

  it('records the progress with the percentage computed by the app, without a card to decide', async () => {
    world.model.answer([
      call('report_project_progress', { ...done, team: 'partial', hypotheses: 'missing' }),
    ])
    const events = await send('Framing')
    expect(cards(events)[0]).toMatchObject({
      proposal: {
        kind: 'report_project_progress',
        state: 'applied',
        preview: { progress: { percent: 80 } },
      },
    })
  })

  it('keeps the previous progress when a report is malformed', async () => {
    await frame()
    world.model.answer([call('report_project_progress', { question: 'nearly' }, 'bad')])
    expect(cards(await send('Framing'))).toEqual([])
    const shown = await propose()
    expect(cards(shown)).toHaveLength(1)
  })

  it('shows a card with the composed goal once every point is done', async () => {
    await frame()
    const events = await propose({ ...project, hypotheses: 'Too long' })
    expect(cards(events)[0]).toMatchObject({
      proposal: {
        kind: 'create_project',
        state: 'proposed',
        preview: {
          name: 'Drop-off',
          teamName: 'Growth',
          goal: 'Research question\nWhy?\n\nObjectives\nFix\n\nHypotheses\nToo long',
        },
      },
    })
    expect(world.model.outputs.at(-1)).toContain('Card shown')
  })

  it('composes the goal in the language of the interface', async () => {
    await frame()
    world.model.answer([call('create_project', project)])
    const events = await collect(
      world.send.send({ actor: ada, conversationId, text: 'Go', page: home, language: 'fr' }),
    )
    expect(JSON.stringify(cards(events)[0])).toContain('Question de recherche')
  })

  it('replaces an open card: the earlier one can no longer be applied', async () => {
    await frame()
    await propose(project, 'first')
    await propose({ ...project, name: 'Better name' }, 'second')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('first') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('second') }),
    ).toMatchObject({ ok: true, value: { state: 'applied' } })
    expect(world.research.actionsLog.filter((a) => a.action === 'createProject')).toHaveLength(1)
    // The model is told it was replaced, not that the person dismissed it.
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Replaced by your newer card.')
  })

  it('keeps one open card when a step proposes twice', async () => {
    await frame()
    world.model.answer([
      call('create_project', project, 'one'),
      call('create_project', { ...project, name: 'Other' }, 'two'),
    ])
    await send('Propose it')
    const open = [...world.proposalRows.values()].filter(
      (p) => p.kind === 'create_project' && p.state === 'proposed',
    )
    expect(open.map((p) => p.callId)).toEqual(['two'])
  })
})

describe('spec 018 US2 — a project is never proposed unframed', () => {
  it.each([
    ['no report', null, project, 'question, audience, decision, hypotheses, team not done'],
    ['a point open', { ...done, team: 'partial' }, project, 'team not done'],
    ['empty question', done, { ...project, question: ' ' }, 'must not be empty'],
    ['empty objectives', done, { ...project, objectives: '' }, 'must not be empty'],
    ['unknown team', done, { ...project, teamId: 'other' }, 'use a team id'],
    ['missing fields', done, { name: 'Drop-off', teamId: 't1', goal: 'Old way' }, 'send name'],
    ['a goal too long', done, { ...project, question: 'x'.repeat(9_990) }, 'too long'],
  ])(
    'refuses with %s: no card, and the reason reaches the model',
    async (_, states, input, reason) => {
      if (states) await frame(states)
      const events = await propose(input)
      expect(cards(events)).toEqual([])
      expect(world.model.outputs.at(-1)).toContain('Refused')
      expect(world.model.outputs.at(-1)).toContain(reason)
      expect(world.research.actionsLog).toEqual([])
      // In the history of the next message too, with only points and fields named.
      world.model.answer([{ type: 'text', delta: 'ok' }])
      await send('Next')
      const history = JSON.stringify(world.history())
      expect(history).toContain(reason)
      expect(world.model.outputs.at(-1)).not.toContain('Why?')
      expect(
        await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') }),
      ).toMatchObject({ ok: false, error: 'PROPOSAL_NOT_FOUND' })
    },
  )

  it('starts the framing again for a second project', async () => {
    expect(await applied()).toMatchObject({ ok: true })
    world.clock.advance(1000)
    expect(cards(await propose(project, 'again'))).toEqual([])
    expect(world.model.outputs.at(-1)).toContain('Refused')
    await frame()
    expect(cards(await propose(project, 'framed'))).toHaveLength(1)
  })

  it('still applies a card stored before the framing, with its goal', async () => {
    await send('Hello')
    const message = world.messages.at(-1)
    world.proposalRows.set('old', {
      id: 'old',
      callId: 'old-call',
      messageId: message?.id ?? '',
      kind: 'create_project',
      targetId: null,
      targetVersion: null,
      values: { name: 'Old', teamId: 't1', goal: 'Old goal' },
      preview: { name: 'Old', teamName: 'Growth', goal: 'Old goal' },
      state: 'proposed',
      resultKind: null,
      resultId: null,
      error: null,
      decidedAt: null,
    })
    expect(await world.proposals.apply({ actor: ada, proposalId: 'old' })).toMatchObject({
      ok: true,
      value: { result: { kind: 'project', id: 'p-new' } },
    })
    expect(world.research.actionsLog[0]?.input).toMatchObject({ goal: 'Old goal', name: 'Old' })
  })

  it('applies a framed card through the same action, once', async () => {
    expect(await applied()).toMatchObject({
      ok: true,
      value: { state: 'applied', result: { kind: 'project', id: 'p-new' } },
    })
    expect(world.research.actionsLog).toMatchObject([
      {
        action: 'createProject',
        input: { name: 'Drop-off', teamId: 't1', goal: expect.stringContaining('Why?') },
      },
    ])
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
  })

  it('replays the model call without the composed goal', async () => {
    await frame()
    await propose()
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    const assistant = world
      .history()
      .find((m) => m.role === 'assistant' && m.toolCalls?.[0]?.name === 'create_project')
    expect(assistant).toMatchObject({
      toolCalls: [{ input: { question: 'Why?' } }],
    })
    expect(JSON.stringify(assistant)).not.toContain('Research question')
  })
})

describe('spec 018 US3 — continue on the new project', () => {
  const continueOn = (actor = ada) =>
    collect(
      world.send.send({
        actor,
        conversationId,
        page: { kind: 'project', id: 'p1' },
        language: 'en',
      }),
    )

  it('answers without a message from the person, with the project in its context', async () => {
    await applied()
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: true,
    })
    const before = world.messages.length
    world.model.answer([
      { type: 'text', delta: 'Ready.' },
      call('create_study', { projectId: 'p1', name: 'First interviews' }, 'study'),
    ])
    const events = await continueOn()
    expect(world.messages.length).toBe(before + 1)
    expect(world.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'Ready.' })
    expect(events[0]).toMatchObject({ type: 'start' })
    expect(events[0]).not.toHaveProperty('personMessageId')
    expect(cards(events)[0]).toMatchObject({
      proposal: { kind: 'create_study', state: 'proposed' },
    })
    expect(world.research.actionsLog.filter((a) => a.action === 'createStudy')).toEqual([])
    const request = world.model.requests.at(-1)
    expect(request?.system).toContain('just applied your project proposal')
    expect(request?.system).toContain('Project id: p1')
    expect(request?.messages?.at(-1)).toMatchObject({
      role: 'tool',
      results: [{ output: expect.stringContaining('Applied by the person') }],
    })
  })

  it('continues only once, and only right after the applied project', async () => {
    await frame()
    await propose()
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: false,
      error: 'NOTHING_TO_CONTINUE',
    })
    world.clock.advance(1000)
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') })
    expect(await world.send.openContinue({ actor: bob, conversationId })).toMatchObject({
      ok: false,
      error: 'CONVERSATION_NOT_FOUND',
    })
    await continueOn()
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: false,
      error: 'NOTHING_TO_CONTINUE',
    })
  })

  it('still continues when the answer holding the card was stopped after it', async () => {
    await frame()
    world.model.answer([call('create_project', project, 'call-create')])
    world.model.failWith(new Error('down'))
    await send('Propose it')
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') })
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: true,
    })
  })

  it('offers neither the framing report nor a new project in the continuing answer', async () => {
    await applied()
    await continueOn()
    expect(toolNames()).not.toContain('report_project_progress')
    expect(toolNames()).not.toContain('create_project')
    expect(toolNames()).toContain('create_study')
  })

  it('does not continue once the conversation went on', async () => {
    await frame()
    await propose()
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('One more thing')
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-create') })
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: false,
      error: 'NOTHING_TO_CONTINUE',
    })
  })

  it('leaves the project in place when the continuing answer fails', async () => {
    await applied()
    world.model.failWith(new Error('down'))
    const events = await continueOn()
    expect(events.find((e) => e.type === 'error')).toBeDefined()
    expect(world.research.actionsLog.filter((a) => a.action === 'createProject')).toHaveLength(1)
  })

  it('counts the continuing answer in the cost of the conversation', async () => {
    await applied()
    world.model.answer([{ type: 'text', delta: 'Ready.' }])
    await continueOn()
    const detail = await world.queries.get('ada', conversationId)
    expect(detail?.cost.last).toBeGreaterThan(0)
    expect(detail?.messages.at(-1)?.text).toBe('Ready.')
  })
})

describe('spec 018 US4 — no team', () => {
  it('tells the model there is no team, and refuses any proposal', async () => {
    const empty = assistantWorld()
    const created = await empty.conversations.create({ actor: bob })
    const id = created.ok ? created.value.id : ''
    empty.model.answer([call('report_project_progress', done, 'r')])
    await collect(
      empty.send.send({ actor: bob, conversationId: id, text: 'x', page: home, language: 'en' }),
    )
    expect(empty.model.requests.at(-1)?.system).toContain('Teams of the person: none.')
    empty.model.answer([call('create_project', project, 'c')])
    const events = await collect(
      empty.send.send({ actor: bob, conversationId: id, text: 'y', page: home, language: 'en' }),
    )
    expect(events.filter((e) => e.type === 'proposal')).toEqual([])
    expect(empty.model.outputs.at(-1)).toContain('use a team id')
  })
})
