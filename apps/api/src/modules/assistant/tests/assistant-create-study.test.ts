import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const home = { kind: 'home' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string) =>
  collect(world.send.send({ actor: ada, conversationId, text, page: home, language: 'en' }))
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const toolNames = () => world.model.requests.at(-1)?.tools?.map((t) => t.name) ?? []

const done = { reuse: 'done', goal: 'done', place: 'done' }
const inProject = { name: 'First interviews', goal: 'Learn why', projectId: 'p1' }
const inTeam = { name: 'First interviews', goal: 'Learn why', teamId: 't1' }

const frame = async (states: Record<string, string> = done) => {
  world.model.answer([call('report_study_progress', states, `report-${Math.random()}`)])
  await send('Framing')
  world.clock.advance(1000)
}
const propose = async (input: unknown = inProject, id = 'card') => {
  world.model.answer([call('create_study', input, id)])
  return send('Propose it')
}
const applied = async (input: unknown = inProject) => {
  await frame()
  await propose(input)
  world.clock.advance(1000)
  return world.proposals.apply({ actor: ada, proposalId: world.idOf('card') })
}

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 021 US1 — frame a study in a dialogue', () => {
  it('offers the skill and its tools on every page', async () => {
    world.model.answer([{ type: 'text', delta: 'Hi' }])
    await send('Hello')
    expect(toolNames()).toEqual(expect.arrayContaining(['create_study', 'report_study_progress']))
    expect(world.model.requests.at(-1)?.system).toContain('study-framing (')
  })

  it('refuses a proposal without a framing, while a point is open, and names the points', async () => {
    expect(cards(await propose())).toEqual([])
    await frame({ reuse: 'done', goal: 'partial', place: 'missing' })
    expect(cards(await propose(inProject, 'card-2'))).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('goal, place not done')
    expect(world.research.actionsLog).toEqual([])
  })

  it.each([
    ['an empty goal', { name: 'A', goal: '', projectId: 'p1' }, 'goal must not be empty'],
    ['no place', { name: 'A', goal: 'Why' }, 'send a projectId, or a teamId'],
    ['two places', { ...inTeam, projectId: 'p1' }, 'send a projectId, or a teamId'],
    ['a project out of reach', { ...inProject, projectId: 'secret' }, 'use a project id'],
    ['a team out of reach', { ...inTeam, teamId: 'other' }, 'use a team id'],
  ])('refuses %s', async (_case, input, reason) => {
    await frame()
    expect(cards(await propose(input))).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain(reason)
  })

  it('shows a card in a project once every point is done, and creates nothing', async () => {
    await frame()
    const shown = cards(await propose())
    expect(shown[0]).toMatchObject({
      proposal: {
        kind: 'create_study',
        state: 'proposed',
        preview: { name: 'First interviews', goal: 'Learn why' },
      },
    })
    expect(JSON.stringify(shown[0])).toContain('"projectName"')
    expect(world.research.actionsLog).toEqual([])
  })

  it('replaces the open card with a newer one', async () => {
    await frame()
    await propose(inProject, 'first')
    await propose({ ...inProject, name: 'Second' }, 'second')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('first') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('second') }),
    ).toMatchObject({ ok: true, value: { result: { kind: 'study', id: 's-new' } } })
  })

  it('applies with the goal of the card, in the project', async () => {
    await applied()
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'createStudy',
      input: { projectId: 'p1', name: 'First interviews', goal: 'Learn why' },
    })
  })

  it('tells the model when the card is dismissed', async () => {
    await frame()
    await propose()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('card') })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Dismissed by the person')
    expect(world.research.actionsLog).toEqual([])
  })

  it('ends the framing once applied: another study starts again', async () => {
    await applied()
    world.clock.advance(1000)
    expect(cards(await propose(inProject, 'again'))).toEqual([])
  })

  it('continues after Apply by offering the guide, without any new card', async () => {
    await applied()
    expect(await world.send.openContinue({ actor: ada, conversationId })).toMatchObject({
      ok: true,
    })
    world.model.answer([{ type: 'text', delta: 'Ready.' }])
    await collect(
      world.send.send({
        actor: ada,
        conversationId,
        page: { kind: 'study', id: 's1' },
        language: 'en',
      }),
    )
    const request = world.model.requests.at(-1)
    expect(request?.system).toContain('offer to prepare its interview guide')
    const names = request?.tools?.map((t) => t.name) ?? []
    expect(names).not.toContain('create_study')
    expect(names).not.toContain('report_study_progress')
    expect(names).not.toContain('propose_interview_guide')
    expect(names).not.toContain('load_skill')
    expect(request?.system).not.toContain('Loaded skill')
  })

  it('marks the card failed when the creation throws, so it does not stay claimed', async () => {
    await frame()
    await propose()
    world.research.failNextCreate()
    await expect(
      world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).rejects.toThrow()
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('it failed: INTERNAL')
  })

  it('after a project, only asks whether to prepare a study', async () => {
    world.model.answer([
      call(
        'report_project_progress',
        { question: 'done', audience: 'done', decision: 'done', hypotheses: 'done', team: 'done' },
        'framed',
      ),
    ])
    await send('Framing')
    world.clock.advance(1000)
    world.model.answer([
      call(
        'create_project',
        { name: 'P', teamId: 't1', question: 'Why?', objectives: 'Fix', hypotheses: '' },
        'project',
      ),
    ])
    await send('Propose it')
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('project') })
    world.model.answer([{ type: 'text', delta: 'Ready.' }])
    await collect(
      world.send.send({
        actor: ada,
        conversationId,
        page: { kind: 'project', id: 'p1' },
        language: 'en',
      }),
    )
    const request = world.model.requests.at(-1)
    expect(request?.system).toContain('ask whether they want to prepare a first interview study')
    expect(request?.tools?.map((t) => t.name)).not.toContain('create_study')
    expect(request?.tools?.map((t) => t.name)).toContain('attach_study')
  })
})

describe('spec 021 US2 — reuse before creating', () => {
  it('gives the studies with the method, then keeps them in the context, not before', async () => {
    world.model.answer([{ type: 'text', delta: 'Hi' }])
    await send('Hello')
    expect(world.model.requests.at(-1)?.system).not.toContain("Studies of the person's teams")
    world.model.answer([call('load_skill', { name: 'study-framing' }, 'skill')])
    await send('A study please')
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(world.model.requests.at(-1)?.system).toContain("Studies of the person's teams")
  })
})

describe('spec 021 US3 — in no project', () => {
  it('shows the team on the card and creates the study in the team', async () => {
    await frame()
    const shown = cards(await propose(inTeam))
    expect(shown[0]).toMatchObject({ proposal: { preview: { teamName: 'Growth' } } })
    world.clock.advance(1000)
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') })
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'createTeamStudy',
      input: { teamId: 't1', name: 'First interviews', goal: 'Learn why' },
    })
  })
})
