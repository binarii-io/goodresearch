import { beforeEach, describe, expect, it } from 'vitest'
import { ProviderCallError } from '../../ai-gateway/index.ts'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string, page = { kind: 'project' as const, id: 'p1' }, actor = ada) =>
  collect(world.send.send({ actor, conversationId, text, page, language: 'en' }))

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('US1 — chat', () => {
  it('streams the answer, stores both messages and titles the conversation', async () => {
    world.model.answer([
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'there' },
    ])
    const events = await send('Help me plan interviews\nplease')
    expect(events.map((e) => e.type)).toEqual(['start', 'text', 'text', 'done'])
    const view = await world.queries.get('ada', conversationId)
    expect(view?.title).toBe('Help me plan interviews')
    expect(view?.messages.map((m) => [m.role, m.text, m.status])).toEqual([
      ['person', 'Help me plan interviews\nplease', 'complete'],
      ['assistant', 'Hello there', 'complete'],
    ])
  })

  it('keeps what was written when the person stops the answer', async () => {
    world.model.answer([
      { type: 'text', delta: 'First part. ' },
      { type: 'text', delta: 'Second part.' },
    ])
    const events = world.send.send({
      actor: ada,
      conversationId,
      text: 'Go',
      page: { kind: 'home' },
      language: 'en',
    })
    for await (const e of events) if (e.type === 'text') break
    const view = await world.queries.get('ada', conversationId)
    expect(view?.messages.at(-1)).toMatchObject({ text: 'First part. ', status: 'stopped' })
  })

  it('shows an answer cut off by a server restart as stopped, not as still writing', async () => {
    world.model.answer([{ type: 'text', delta: 'Never saved.' }])
    const events = world.send.send({
      actor: ada,
      conversationId,
      text: 'Go',
      page: { kind: 'home' },
      language: 'en',
    })
    // The process stops after the answer was opened: nothing closes it.
    await events.next()
    expect((await world.queries.get('ada', conversationId))?.messages.at(-1)?.status).toBe(
      'streaming',
    )
    await world.clock.advance(31 * 60_000)
    expect((await world.queries.get('ada', conversationId))?.messages.at(-1)?.status).toBe(
      'stopped',
    )
  })

  it('stores a provider failure with its reason', async () => {
    world.model.failWith(new ProviderCallError('NO_CREDIT_OR_QUOTA'))
    const events = await send('Hi')
    expect(events.filter((e) => e.type === 'error')).toEqual([
      { type: 'error', failure: 'NO_CREDIT_OR_QUOTA' },
    ])
    expect((await world.queries.get('ada', conversationId))?.messages.at(-1)).toMatchObject({
      status: 'failed',
      failure: 'NO_CREDIT_OR_QUOTA',
    })
  })

  it('never lets someone else write in or read a conversation', async () => {
    expect(await world.send.open({ actor: bob, conversationId })).toMatchObject({
      ok: false,
      error: 'CONVERSATION_NOT_FOUND',
    })
    expect(await world.queries.get('bob', conversationId)).toBeNull()
    expect(await world.queries.list('bob')).toEqual([])
  })
})

describe('US2 — page context', () => {
  it('gives the project, its goal and studies, and the folder name only with access', async () => {
    await send('What is this project about?')
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('Project: Onboarding')
    expect(system).toContain('Research goal: Old goal')
    expect(system).toContain('First interviews')
    expect(system).toContain('Team id: t1')
    await send('And this study?', { kind: 'study', id: 's1' } as never)
    expect(world.model.requests.at(-1)?.system).toContain('Source folder: Interviews Q4')
  })

  it('sends nothing from a page the person cannot open', async () => {
    const created = await world.conversations.create({ actor: bob })
    conversationId = created.ok ? created.value.id : ''
    await send('Tell me about it', { kind: 'project', id: 'p1' }, bob)
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).not.toContain('Onboarding')
    expect(system).not.toContain('Old goal')
    expect(system).toContain('cannot open')
  })
})

describe('US2 — where the person is, all along', () => {
  it('tells the model which page each message was sent from', async () => {
    await send('About this project', { kind: 'project', id: 'p1' })
    await send('And this study?', { kind: 'study', id: 's1' } as never)
    const users = world.history().filter((m) => m.role === 'user')
    expect(users.map((m) => (m.role === 'user' ? m.content.split('\n')[0] : ''))).toEqual([
      '[Sent from the page of project id p1]',
      '[Sent from the page of study id s1]',
    ])
    expect(world.model.requests.at(-1)?.system).toContain('The person is on a study page.')
  })
})

describe('US3 — proposals the person confirms', () => {
  const proposeGoal = async () => {
    world.model.answer([
      { type: 'text', delta: 'Here is a goal.' },
      {
        type: 'tool-call',
        call: {
          id: 'call-1',
          name: 'update_project_goal',
          input: { projectId: 'p1', goal: 'New goal' },
        },
      },
    ])
    return send('Write a goal')
  }

  it('shows a card with every value and changes nothing until Apply', async () => {
    const events = await proposeGoal()
    const card = events.find((e) => e.type === 'proposal')
    expect(card).toMatchObject({
      proposal: {
        kind: 'update_project_goal',
        state: 'proposed',
        preview: { projectName: 'Onboarding', goal: 'New goal', previousGoal: 'Old goal' },
      },
    })
    expect(world.research.actionsLog).toEqual([])
  })

  it('applies exactly what was shown, once, with the version seen at proposal time', async () => {
    await proposeGoal()
    const applied = await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-1') })
    expect(applied).toMatchObject({
      ok: true,
      value: { state: 'applied', result: { kind: 'project', id: 'p1' } },
    })
    expect(world.research.actionsLog).toEqual([
      {
        action: 'updateProjectGoal',
        input: { actor: ada, projectId: 'p1', goal: 'New goal', version: 3 },
      },
    ])
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-1') }),
    ).toMatchObject({
      ok: false,
      error: 'PROPOSAL_DECIDED',
    })
    expect(world.research.actionsLog).toHaveLength(1)
  })

  it('shows the app error when applying fails, and changes nothing', async () => {
    await proposeGoal()
    world.research.failNext('VERSION_CONFLICT')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-1') }),
    ).toMatchObject({
      ok: true,
      value: { state: 'failed', error: 'VERSION_CONFLICT' },
    })
  })

  it('tells the model what the person decided', async () => {
    await proposeGoal()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('call-1') })
    world.model.answer([{ type: 'text', delta: 'Understood.' }])
    await send('Never mind')
    const history = world.history()
    expect(history).toContainEqual({
      role: 'assistant',
      content: 'Here is a goal.',
      toolCalls: [
        { id: 'call-1', name: 'update_project_goal', input: { goal: 'New goal', projectId: 'p1' } },
      ],
    })
    expect(history).toContainEqual({
      role: 'tool',
      results: [
        {
          id: 'call-1',
          name: 'update_project_goal',
          output: 'Dismissed by the person: do not propose it again unchanged.',
        },
      ],
    })
  })

  it('hides proposals with invalid values or out-of-reach objects, and tells the model', async () => {
    world.model.answer([
      {
        type: 'tool-call',
        call: { id: 'bad-1', name: 'rename_project', input: { projectId: 'secret', name: 'x' } },
      },
      {
        type: 'tool-call',
        call: { id: 'bad-2', name: 'create_study', input: { projectId: 'p1', name: '' } },
      },
    ])
    const events = await send('Do things')
    expect(events.filter((e) => e.type === 'proposal')).toEqual([])
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('bad-1') }),
    ).toMatchObject({
      ok: false,
      error: 'PROPOSAL_NOT_FOUND',
    })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Not shown: the values were invalid')
  })

  it('never lets someone else decide a proposal', async () => {
    await proposeGoal()
    expect(
      await world.proposals.apply({ actor: bob, proposalId: world.idOf('call-1') }),
    ).toMatchObject({
      ok: false,
      error: 'PROPOSAL_NOT_FOUND',
    })
    expect(world.research.actionsLog).toEqual([])
  })

  it('creates a study in the project shown, with a link to it', async () => {
    world.model.answer([
      {
        type: 'tool-call',
        call: {
          id: 'call-s',
          name: 'create_study',
          input: { projectId: 'p1', name: 'Diary study' },
        },
      },
    ])
    await send('Add a study')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-s') }),
    ).toMatchObject({
      ok: true,
      value: { state: 'applied', result: { kind: 'study', id: 's-new' } },
    })
  })
})

describe('US5 — opening pages', () => {
  it('opens a project or a study at once, without a card to confirm, and tells the model', async () => {
    world.model.answer([
      { type: 'text', delta: 'Opening it.' },
      { type: 'tool-call', call: { id: 'open-1', name: 'open_study', input: { studyId: 's1' } } },
    ])
    const events = await send('Open the study', { kind: 'home' } as never)
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'open_study',
        state: 'applied',
        result: { kind: 'study', id: 's1' },
        preview: { name: 'First interviews', projectName: 'Onboarding' },
      },
    })
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('open-1') }),
    ).toMatchObject({
      ok: false,
      error: 'PROPOSAL_DECIDED',
    })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Thanks')
    expect(JSON.stringify(world.history())).toContain('The page is open for the person.')
    expect(world.model.requests.at(-1)?.system).toContain('project id p1')
  })

  it('opens a study on one of its tabs, and knows the current tab', async () => {
    world.model.answer([
      {
        type: 'tool-call',
        call: { id: 'tab-1', name: 'open_study', input: { studyId: 's1', phase: 'preparation' } },
      },
    ])
    const events = await send('Show the preparation', {
      kind: 'study',
      id: 's1',
      phase: 'fieldwork',
    } as never)
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: { kind: 'open_study', preview: { phase: 'preparation' } },
    })
    expect(world.model.requests.at(-1)?.system).toContain('Current tab: fieldwork')
  })

  it('never opens a page the person cannot see', async () => {
    const created = await world.conversations.create({ actor: bob })
    conversationId = created.ok ? created.value.id : ''
    world.model.answer([
      {
        type: 'tool-call',
        call: { id: 'open-2', name: 'open_project', input: { projectId: 'p1' } },
      },
    ])
    const events = await send('Open it', { kind: 'home' } as never, bob)
    expect(events.some((e) => e.type === 'proposal')).toBe(false)
  })
})

describe('US6 — cost', () => {
  it('gives the total cost of the conversation and of the last answer', async () => {
    await send('one')
    await send('two')
    const view = await world.queries.get('ada', conversationId)
    expect(view?.cost.currency).toBe('USD')
    expect(view?.cost.total).toBeCloseTo(0.003)
    expect(view?.cost.last).toBeCloseTo(0.002)
  })
})

describe('US4 — conversations', () => {
  it('lists, renames and deletes only the owner’s conversations', async () => {
    await world.clock.advance(1000)
    const second = await world.conversations.create({ actor: ada })
    const secondId = second.ok ? second.value.id : ''
    expect((await world.queries.list('ada')).map((c) => c.id)).toEqual([secondId, conversationId])
    expect(
      await world.conversations.rename({ actor: bob, conversationId, title: 'x' }),
    ).toMatchObject({
      ok: false,
    })
    await world.conversations.rename({ actor: ada, conversationId, title: 'Planning' })
    expect((await world.queries.get('ada', conversationId))?.title).toBe('Planning')
    expect(await world.conversations.delete({ actor: bob, conversationId })).toMatchObject({
      ok: false,
    })
    await world.conversations.delete({ actor: ada, conversationId })
    expect((await world.queries.list('ada')).map((c) => c.id)).toEqual([secondId])
    await world.conversations.forgetAccount('ada')
    expect(await world.queries.list('ada')).toEqual([])
  })
})
