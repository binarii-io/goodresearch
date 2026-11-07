import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { buildContext } from '../application/context.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string, page: object) =>
  collect(
    world.send.send({ actor: ada, conversationId, text, page: page as never, language: 'en' }),
  )
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const
const studyPage = { kind: 'study' as const, id: 's1', phase: 'preparation' as const }
const toolNames = () => world.model.requests.at(-1)?.tools?.map((t) => t.name) ?? []

const protocol = {
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: [],
    participants: 'Analysts',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: { introduction: '', thinkAloud: 'Think aloud.', warmUp: [], debrief: [], closing: '' },
  scenario: 'You prepare the weekly review.',
  tasks: [
    {
      instruction: 'Click on Export',
      criterion: 'The file is saved',
      startUrl: null,
      minutes: null,
    },
  ],
  questionnaire: 'sus-v1',
  easeQuestion: 'none',
}

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 036 - creating a usability test study', () => {
  it('keeps the type on the card and when applying it', async () => {
    world.model.answer([
      call('report_study_progress', { reuse: 'done', goal: 'done', place: 'done' }),
    ])
    await send('A usability test please', { kind: 'project', id: 'p1' })
    world.model.answer([
      call('create_study', {
        name: 'Test of the export',
        goal: 'Learn',
        projectId: 'p1',
        type: 'usability-test',
      }),
    ])
    await send('Yes', { kind: 'project', id: 'p1' })
    const applied = await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-create_study'),
    })
    expect(applied.ok).toBe(true)
    expect(world.research.actionsLog).toMatchObject([
      { action: 'createStudy', input: { type: 'usability-test' } },
    ])
  })
})

describe('spec 036 - test protocol design', () => {
  beforeEach(() => {
    world.research.study.type = 'usability-test'
    world.research.preparation.guide = null
    world.research.protocol.value = { version: null, content: null, checksDone: false }
  })
  const sendHere = (text: string) => send(text, studyPage)

  it('offers the skill and tools on a usability test study, not the guide or questionnaire ones', async () => {
    await sendHere('Hello')
    const system = world.model.requests.at(-1)?.system ?? ''
    expect(system).toContain('test-protocol-design (')
    expect(system).not.toContain('interview-guide-design (')
    expect(system).toContain('Next step of this study: write its test protocol.')
    expect(toolNames()).toEqual(
      expect.arrayContaining([
        'check_protocol_tasks',
        'report_protocol_progress',
        'propose_protocol',
      ]),
    )
    expect(toolNames()).not.toContain('propose_interview_guide')
    expect(toolNames()).not.toContain('propose_questionnaire')
  })

  it('offers nothing of it elsewhere, and refuses the skill', async () => {
    world.research.protocol.value = null
    world.model.answer([call('load_skill', { name: 'test-protocol-design' })])
    await sendHere('Help')
    expect(toolNames()).not.toContain('propose_protocol')
    expect(world.model.outputs[0]).toContain('Unknown skill')
  })

  it('loads the skill during the answer', async () => {
    world.model.answer([call('load_skill', { name: 'test-protocol-design' })])
    await sendHere('Help me design the protocol')
    expect(world.model.outputs[0]).toContain('# Skill: design a usability test protocol')
  })

  it('checks the tasks with the rules of the app, planned length included', async () => {
    world.model.answer([call('check_protocol_tasks', { studyId: 's1', protocol })])
    await sendHere('Check it')
    expect(world.model.outputs[0]).toContain('"Click on Export": gives-the-way')
    expect(world.model.outputs[0]).toContain('Planned length computed by the app: 20 minutes.')
  })

  it('records the progress, percentage computed by the app', async () => {
    world.model.answer([
      call('report_protocol_progress', {
        studyId: 's1',
        objectiveHypotheses: 'done',
        interface: 'done',
        participants: 'missing',
        formatConsent: 'missing',
        scenario: 'missing',
        tasks: 'partial',
        criteria: 'missing',
        questionnaireDebrief: 'missing',
        biasReview: 'missing',
      }),
    ])
    const events = await sendHere('Go on')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: { kind: 'report_protocol_progress', preview: { progress: { percent: 38 } } },
    })
  })

  it('shows a card with its checks, saves only on Apply, with the version seen', async () => {
    world.research.protocol.value = { version: 2, content: protocol as never, checksDone: false }
    world.model.answer([call('propose_protocol', { studyId: 's1', protocol })])
    const events = await sendHere('Write it')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'propose_protocol',
        state: 'proposed',
        preview: { replacesProtocol: true, taskChecks: { plannedMinutes: 20 } },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    const applied = await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-propose_protocol'),
    })
    expect(applied.ok).toBe(true)
    expect(world.research.actionsLog).toMatchObject([
      { action: 'saveTestProtocol', input: { studyId: 's1', version: 2 } },
    ])
    const again = await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-propose_protocol'),
    })
    expect(again.ok).toBe(false)
    expect(world.research.actionsLog).toHaveLength(1)
  })

  it('does not show a proposal for another study, or breaking the limits', async () => {
    world.model.answer([
      call('propose_protocol', { studyId: 'other', protocol }, 'a'),
      call('propose_protocol', { studyId: 's1', protocol: { ...protocol, tasks: [] } }, 'b'),
      call(
        'propose_protocol',
        {
          studyId: 's1',
          protocol: {
            ...protocol,
            framing: {
              ...protocol.framing,
              interface: { url: 'nope', kind: 'prototype', description: null },
            },
          },
        },
        'c',
      ),
    ])
    const events = await sendHere('Write it')
    expect(events.filter((e) => e.type === 'proposal')).toEqual([])
  })

  it('totals what the design cost across people, and only for who can open the study', async () => {
    world.model.answer([call('load_skill', { name: 'test-protocol-design' })])
    await sendHere('Help')
    await sendHere('Go on')
    expect((await world.queries.protocolDesignCost('ada', 's1'))?.total).toBeCloseTo(0.02)
    expect(await world.queries.protocolDesignCost('eve', 's1')).toBeNull()
  })

  it('offers the protocol and the best practices to publish (spec 036 US8)', async () => {
    world.research.publication.check = { ok: true, kinds: ['protocol', 'best-practices'] }
    world.model.answer([
      call('publish_preparation', { studyId: 's1', kinds: ['protocol', 'best-practices'] }),
    ])
    const events = await sendHere('Publish it')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'publish_preparation',
        preview: { documents: ['protocol', 'best-practices'] },
      },
    })
  })

  it('says the protocol is saved after Apply, and offers the protocol after a new study', async () => {
    const after = await buildContext(world.research.reads, ada, studyPage, 'en', [], 'study')
    expect(after.system).toContain('designing its test protocol')
    expect(after.system).not.toContain('preparing its interview guide')
    expect(after.system).toContain('only preparation and fieldwork are built so far')
  })

  it('after the folder, speaks of the protocol, never of interviews (PR #51)', async () => {
    const after = await buildContext(world.research.reads, ada, studyPage, 'en', [], 'folder')
    expect(after.system).toContain('it will hold the test protocol and its participant sheet')
    expect(after.system).not.toContain('give the number of transcripts')
  })
})
