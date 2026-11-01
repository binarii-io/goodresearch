import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const projectPage = { kind: 'project' as const, id: 'p1' }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const propose = (name: string, input: unknown, id = `call-${name}`) => {
  world.model.answer([{ type: 'tool-call', call: { id, name, input } }])
  return collect(
    world.send.send({
      actor: ada,
      conversationId,
      text: 'Do it',
      page: projectPage,
      language: 'en',
    }),
  )
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 019 US6 — with the assistant', () => {
  it('lists the attachable studies on a project page, names and projects only', async () => {
    world.research.attachable.studies = [
      { id: 's9', name: 'Old study', projects: [{ name: 'Older' }] },
    ]
    await propose('open_project', { projectId: 'p1' })
    expect(world.model.requests.at(-1)?.system).toContain(
      'Old study (in: Older; attachable study id s9)',
    )
  })

  it('refuses each impossible change with its reason, and no card', async () => {
    const refusals: [string, unknown, string][] = [
      ['attach_study', { studyId: 'nope', projectId: 'p1' }, 'use a study id'],
      ['attach_study', { studyId: 's1', projectId: 'nope' }, 'use a project id'],
      ['attach_study', { studyId: 's1', projectId: 'p1' }, 'already in this project'],
      ['update_study_goal', { studyId: 'nope', goal: 'New' }, 'use a study id'],
      ['update_study_goal', { studyId: 's1', goal: 'x'.repeat(10_001) }, 'at most 10,000'],
    ]
    for (const [name, input, reason] of refusals) {
      expect(cards(await propose(name, input, `${name}-${reason}`))).toEqual([])
      expect(world.model.outputs.at(-1)).toContain(reason)
    }
    expect(world.research.actionsLog).toEqual([])
  })

  it('refuses to detach during a run', async () => {
    world.research.running.value = true
    expect(cards(await propose('detach_study', { studyId: 's1', projectId: 'p1' }))).toEqual([])
    expect(world.model.outputs.at(-1)).toContain('run in progress')
  })

  it('shows a detach card with where the study stays, and applies it once', async () => {
    world.research.study.projects = [
      { id: 'p1', name: 'Onboarding' },
      { id: 'p2', name: 'Pricing' },
    ]
    const [card] = cards(await propose('detach_study', { studyId: 's1', projectId: 'p1' }))
    expect(card).toMatchObject({
      proposal: {
        kind: 'detach_study',
        state: 'proposed',
        preview: { studyName: 'First interviews', otherProjects: ['Pricing'] },
      },
    })
    expect(world.model.outputs.at(-1)).toContain('Card shown')
    expect(world.research.actionsLog).toEqual([])
    const proposalId = world.idOf('call-detach_study')
    expect(await world.proposals.apply({ actor: ada, proposalId })).toMatchObject({
      ok: true,
      value: { state: 'applied', result: { kind: 'project', id: 'p1' } },
    })
    expect(world.research.actionsLog).toMatchObject([
      { action: 'detachStudy', input: { studyId: 's1', projectId: 'p1' } },
    ])
    expect((await world.proposals.apply({ actor: ada, proposalId })).ok).toBe(false)
  })

  it('applies a new goal of a study with the version seen', async () => {
    const [card] = cards(await propose('update_study_goal', { studyId: 's1', goal: 'New' }))
    expect(card).toMatchObject({
      proposal: { preview: { goal: 'New', previousGoal: 'Study goal' } },
    })
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-update_study_goal') })
    expect(world.research.actionsLog[0]).toMatchObject({
      action: 'updateStudyGoal',
      input: { studyId: 's1', goal: 'New', version: 1 },
    })
  })

  it('gives both goals on a study page, and works without a project', async () => {
    const send = () =>
      collect(
        world.send.send({
          actor: ada,
          conversationId,
          text: 'Hello',
          page: { kind: 'study', id: 's1' },
          language: 'en',
        }),
      )
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send()
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('Research goal of the study, read by its AI steps: Study goal')
    expect(system).toContain('Research goal of that project: Old goal')
    world.research.study.projects = []
    await send()
    expect(world.model.requests.at(-1)?.system).toContain('This study is in no project')
  })
})
