import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const studyPage = { kind: 'study' as const, id: 's1', phase: 'preparation' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string, page: object = studyPage) =>
  collect(
    world.send.send({ actor: ada, conversationId, text, page: page as never, language: 'en' }),
  )
const toolNames = () => world.model.requests.at(-1)?.tools?.map((t) => t.name) ?? []

const guide = {
  framing: { objectives: 'Goal', hypotheses: ['H1'], audience: 'Eight people', format: '45 min' },
  sections: [
    {
      kind: 'theme',
      title: 'Planning',
      minutes: 30,
      questions: [
        { text: 'Tell me about the last time you planned your week.', followUps: ['And then?'] },
        { text: 'Do you use a calendar?', followUps: [] },
      ],
    },
  ],
}
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 006 — guide design mode', () => {
  it('lists the skill and offers the guide tools only on an interview study the person can act on', async () => {
    await send('Hello')
    expect(world.model.requests.at(-1)?.system).toContain(
      'Skills you can load: interview-guide-design',
    )
    expect(toolNames()).toEqual(
      expect.arrayContaining([
        'load_skill',
        'check_guide_questions',
        'report_guide_progress',
        'propose_interview_guide',
      ]),
    )
    await send('Hello', { kind: 'project', id: 'p1' })
    expect(toolNames()).not.toContain('load_skill')
    expect(world.model.requests.at(-1)?.system).not.toContain('Skills you can load')
    world.research.preparation.guide = null
    await send('Hello')
    expect(toolNames()).not.toContain('propose_interview_guide')
  })

  it('gives the guide and the schedule counts, never names (FR-013)', async () => {
    await send('Hello')
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('Interview guide of this study: none yet.')
    expect(system).toContain('scheduled: 2, to contact: 1')
  })

  it('loads a skill during the answer: its instructions go back to the model, then stay in the context', async () => {
    world.model.answer([call('load_skill', { name: 'interview-guide-design' })])
    const events = await send('Help me design the interview guide')
    expect(world.model.outputs[0]).toContain('# Skill: design an interview guide')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'load_skill',
        state: 'applied',
        preview: { skill: 'interview-guide-design' },
      },
    })
    world.model.answer([{ type: 'text', delta: 'Next question' }])
    await send('Go on')
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('Loaded skill interview-guide-design')
    expect(system).not.toContain('Skills you can load')
    // On another page the skill is still there, and the model is told where its tools are.
    await send('And now?', { kind: 'project', id: 'p1' })
    const elsewhere = world.model.requests.at(-1)?.system ?? ''
    expect(elsewhere).toContain('Loaded skill interview-guide-design')
    expect(elsewhere).toContain('only available on the page of an interview study')
    const tool = world.history().find((m) => m.role === 'tool')
    expect(tool).toMatchObject({
      results: [{ name: 'load_skill', output: expect.stringContaining('Loaded') }],
    })
  })

  it('checks questions with the app rules (writing constraints as a tool)', async () => {
    world.model.answer([
      call('check_guide_questions', { questions: ['Do you use a calendar?', 'How do you plan?'] }),
    ])
    const events = await send('Check them')
    expect(world.model.outputs[0]).toBe(
      '1. to review (closed): Do you use a calendar?\n2. ok: How do you plan?',
    )
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'check_guide_questions',
        preview: { checks: [{ issues: ['closed'] }, { issues: [] }] },
      },
    })
  })

  it('records the progress at once, percentage computed by the app', async () => {
    world.model.answer([
      { type: 'text', delta: 'What are the themes?' },
      call('report_guide_progress', {
        studyId: 's1',
        objectives: 'done',
        hypotheses: 'partial',
        audience: 'missing',
        format: 'missing',
        intro: 'missing',
        themes: 'missing',
        followUps: 'missing',
        biasReview: 'missing',
      }),
    ])
    const events = await send('Start')
    // Recorded when called, without one more model step (PR #6 review).
    expect(world.model.outputs).toEqual([])
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'report_guide_progress',
        state: 'applied',
        preview: { studyName: 'First interviews', progress: { percent: 20 } },
      },
    })
  })

  it('refuses progress for another study and tells the model', async () => {
    world.model.answer([call('report_guide_progress', { studyId: 'other', objectives: 'done' })])
    const events = await send('Start')
    expect(events.some((e) => e.type === 'proposal')).toBe(false)
    expect([...world.proposalRows.values()].map((p) => p.state)).toEqual(['invalid'])
  })

  it('proposes the whole guide with the version seen and the flagged questions; Apply saves it once', async () => {
    world.research.preparation.guide = {
      guide: { version: 4, content: guide as never },
      schedule: {},
    }
    world.model.answer([call('propose_interview_guide', { studyId: 's1', guide })])
    const events = await send('Write the guide')
    const card = events.find((e) => e.type === 'proposal')
    expect(card).toMatchObject({
      proposal: {
        kind: 'propose_interview_guide',
        state: 'proposed',
        preview: {
          studyName: 'First interviews',
          replacesGuide: true,
          checks: [{ question: 'Do you use a calendar?', issues: ['closed'] }],
        },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    const id = card?.type === 'proposal' ? card.proposal.id : ''
    expect(await world.proposals.apply({ actor: ada, proposalId: id })).toMatchObject({
      ok: true,
      value: { state: 'applied', result: { kind: 'study', id: 's1' } },
    })
    expect(world.research.actionsLog).toEqual([
      { action: 'saveGuide', input: expect.objectContaining({ studyId: 's1', version: 4, guide }) },
    ])
    expect(await world.proposals.apply({ actor: ada, proposalId: id })).toMatchObject({
      ok: false,
      error: 'PROPOSAL_DECIDED',
    })
  })

  it('does not show a guide that breaks the limits, or for a study out of reach', async () => {
    world.model.answer([
      call('propose_interview_guide', { studyId: 's1', guide: { ...guide, sections: [] } }, 'a'),
      call('propose_interview_guide', { studyId: 'other', guide }, 'b'),
    ])
    const events = await send('Write the guide')
    expect(events.some((e) => e.type === 'proposal')).toBe(false)
  })

  it('proposes a guide only for the study of the page (FR-006)', async () => {
    world.model.answer([call('propose_interview_guide', { studyId: 's1', guide })])
    const events = await send('Write the guide', { kind: 'project', id: 'p1' })
    expect(events.some((e) => e.type === 'proposal')).toBe(false)
  })
})
