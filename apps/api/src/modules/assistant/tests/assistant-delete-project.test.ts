import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { TOOL_INPUTS } from '../application/tools.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const say = (text = 'Delete it') =>
  collect(
    world.send.send({
      actor: ada,
      conversationId,
      text,
      page: { kind: 'project', id: 'p1' },
      language: 'en',
    }),
  )
const propose = (projectId = 'p1') => {
  world.model.answer([
    { type: 'tool-call', call: { id: 'del', name: 'delete_project', input: { projectId } } },
  ])
  return say()
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const deleted = () => world.research.actionsLog.filter((a) => a.action === 'deleteProject')

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 020 — deleting a project with the assistant', () => {
  it('gives the model no way to provide the name', () => {
    expect(Object.keys(TOOL_INPUTS.delete_project.shape)).toEqual(['projectId'])
  })

  it('shows a card with the volumes, and deletes nothing', async () => {
    const [card] = cards(await propose())
    expect(card).toMatchObject({
      proposal: {
        kind: 'delete_project',
        state: 'proposed',
        preview: { projectName: 'Onboarding', deletion: { insights: 3, studiesWithoutProject: 1 } },
      },
    })
    expect(world.model.outputs.at(-1)).toContain('must type')
    expect(deleted()).toEqual([])
  })

  it('refuses with its reason during the answer: unknown, not allowed, run in progress', async () => {
    expect(cards(await propose('nope'))).toEqual([])
    expect(world.model.outputs.at(-1)).toContain('use a project id')
    world.research.deletion.value = null
    expect(cards(await propose())).toEqual([])
    expect(world.model.outputs.at(-1)).toContain('only an administrator')
    world.research.deletion.value = {
      insights: 0,
      recommendations: 0,
      hasTakeaways: false,
      hasPublishedDeck: false,
      studies: 0,
      studiesWithoutProject: 0,
    }
    world.research.running.value = true
    expect(cards(await propose())).toEqual([])
    expect(world.model.outputs.at(-1)).toContain('run in progress')
  })

  it('cannot run through the usual Apply, and the card stays open', async () => {
    await propose()
    const proposalId = world.idOf('del')
    expect(await world.proposals.apply({ actor: ada, proposalId })).toEqual({
      ok: false,
      error: 'NAME_REQUIRED',
    })
    expect(world.proposalRows.get(proposalId)?.state).toBe('proposed')
    expect(deleted()).toEqual([])
  })

  it('leaves the card open on a wrong name, then deletes once with the right one', async () => {
    await propose()
    const proposalId = world.idOf('del')
    expect(
      await world.proposals.confirmDelete({ actor: ada, proposalId, name: 'onboarding' }),
    ).toEqual({ ok: false, error: 'NAME_MISMATCH' })
    expect(world.proposalRows.get(proposalId)?.state).toBe('proposed')
    expect(deleted()).toEqual([])
    expect(
      await world.proposals.confirmDelete({ actor: ada, proposalId, name: ' Onboarding ' }),
    ).toMatchObject({ ok: true, value: { state: 'applied', result: null } })
    expect(deleted()).toHaveLength(1)
    expect(
      (await world.proposals.confirmDelete({ actor: ada, proposalId, name: 'Onboarding' })).ok,
    ).toBe(false)
    expect(deleted()).toHaveLength(1)
  })

  it('never stores the name, nor sends it to the model', async () => {
    await propose()
    const proposalId = world.idOf('del')
    await world.proposals.confirmDelete({ actor: ada, proposalId, name: 'Onboarding typed' })
    await world.proposals.confirmDelete({ actor: ada, proposalId, name: 'Onboarding' })
    expect(world.proposalRows.get(proposalId)?.values).toEqual({})
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await say('Next')
    expect(JSON.stringify(world.history())).not.toContain('Onboarding typed')
    expect(JSON.stringify(world.history())).toContain('Applied by the person')
  })

  it('tells the model of a dismissal', async () => {
    await propose()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('del') })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await say('Next')
    expect(JSON.stringify(world.history())).toContain('do not propose it again')
  })

  it('cannot be confirmed by someone else', async () => {
    await propose()
    expect(
      await world.proposals.confirmDelete({
        actor: { id: 'bob', role: 'member' },
        proposalId: world.idOf('del'),
        name: 'Onboarding',
      }),
    ).toEqual({ ok: false, error: 'PROPOSAL_NOT_FOUND' })
  })

  it('ends a card whose project was renamed since, with the reason', async () => {
    await propose()
    const proposalId = world.idOf('del')
    world.research.renameProject('Renamed')
    expect(
      await world.proposals.confirmDelete({ actor: ada, proposalId, name: 'Renamed' }),
    ).toMatchObject({
      ok: true,
      value: { state: 'failed', error: 'NAME_MISMATCH' },
    })
    expect(deleted()).toEqual([])
  })

  it('does not leave the card claimed when the deletion throws', async () => {
    await propose()
    const proposalId = world.idOf('del')
    world.research.throwOnDelete()
    await expect(
      world.proposals.confirmDelete({ actor: ada, proposalId, name: 'Onboarding' }),
    ).rejects.toThrow('down')
    expect(world.proposalRows.get(proposalId)?.state).toBe('failed')
  })
})
