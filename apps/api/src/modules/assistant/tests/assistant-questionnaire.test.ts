import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { buildContext } from '../application/context.ts'
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
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const

const questionnaire = {
  framing: {
    objective: 'Measure',
    hypotheses: [],
    audience: 'Team leads',
    recruitment: 'targeted',
    administration: 'Online',
    targetResponses: 100,
    targetReason: 'Two teams to compare',
    language: 'en',
    consent: 'You choose.',
    thanks: 'Thank you.',
    shuffle: true,
  },
  sections: [
    {
      kind: 'theme',
      title: 'Planning',
      items: [
        {
          text: 'Planning is easy and quick',
          measure: 'subjective',
          required: true,
          subTheme: null,
          contact: false,
          kind: 'likert',
          points: 7,
          lowLabel: 'Disagree',
          highLabel: 'Agree',
        },
      ],
    },
  ],
}

beforeEach(async () => {
  world = assistantWorld()
  world.research.study.type = 'survey'
  world.research.preparation.guide = null
  world.research.questionnaire.value = { version: null, content: null, checksDone: false }
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 027 - questionnaire design', () => {
  it('offers the skill and tools on a survey study, not the guide ones', async () => {
    await send('Hello')
    expect(world.model.requests.at(-1)?.system).toContain('questionnaire-design (')
    expect(world.model.requests.at(-1)?.system).not.toContain('interview-guide-design (')
    expect(toolNames()).toEqual(
      expect.arrayContaining([
        'check_questionnaire_items',
        'report_questionnaire_progress',
        'propose_questionnaire',
      ]),
    )
    expect(toolNames()).not.toContain('propose_interview_guide')
  })

  it('offers nothing of it on an interview study, nor to a person who cannot change it', async () => {
    world.research.questionnaire.value = null
    await send('Hello')
    expect(toolNames()).not.toContain('propose_questionnaire')
    expect(world.model.requests.at(-1)?.system).not.toContain('questionnaire-design (')
  })

  it('refuses the skill on another study type', async () => {
    world.research.questionnaire.value = null
    world.model.answer([call('load_skill', { name: 'questionnaire-design' })])
    await send('Help')
    expect(world.model.outputs[0]).toContain('Unknown skill')
  })

  it('says what comes next, computed by the app', async () => {
    await send('Hello')
    expect(world.model.requests.at(-1)?.system).toContain(
      'Next step of this study: write its questionnaire.',
    )
    world.research.questionnaire.value = {
      version: 0,
      content: questionnaire as never,
      checksDone: false,
    }
    await send('Hello')
    expect(world.model.requests.at(-1)?.system).toContain('publish its questionnaire as a form')
  })

  it('loads the skill during the answer', async () => {
    world.model.answer([call('load_skill', { name: 'questionnaire-design' })])
    await send('Help me design the questionnaire')
    expect(world.model.outputs[0]).toContain('# Skill: design a questionnaire')
  })

  it('checks a questionnaire with the rules of the app', async () => {
    world.model.answer([call('check_questionnaire_items', { studyId: 's1', questionnaire })])
    await send('Check it')
    expect(world.model.outputs[0]).toContain('"Planning is easy and quick": double')
    expect(world.model.outputs[0]).toContain('Estimated time: 3 minutes.')
    expect(world.model.outputs[0]).toContain('no-profiling')
  })

  it('records the progress, percentage computed by the app', async () => {
    world.model.answer([
      call('report_questionnaire_progress', {
        studyId: 's1',
        objectiveThemes: 'done',
        hypotheses: 'missing',
        audience: 'missing',
        administration: 'missing',
        profiling: 'missing',
        thematicItems: 'partial',
        formatOrder: 'missing',
        biasReview: 'missing',
      }),
    ])
    const events = await send('Go on')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: { kind: 'report_questionnaire_progress', preview: { progress: { percent: 33 } } },
    })
  })

  it('shows a card with its checks, saves only on Apply, with the version seen', async () => {
    world.research.questionnaire.value = {
      version: 4,
      content: questionnaire as never,
      checksDone: false,
    }
    world.model.answer([call('propose_questionnaire', { studyId: 's1', questionnaire })])
    const events = await send('Write it')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        kind: 'propose_questionnaire',
        state: 'proposed',
        preview: {
          replacesQuestionnaire: true,
          itemChecks: { estimatedMinutes: 3, whole: ['no-profiling'] },
        },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    const applied = await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-propose_questionnaire'),
    })
    expect(applied.ok).toBe(true)
    expect(world.research.actionsLog).toMatchObject([
      { action: 'saveQuestionnaire', input: { studyId: 's1', version: 4 } },
    ])
  })

  it('does not show a proposal for another study, or breaking the limits', async () => {
    world.model.answer([
      call('propose_questionnaire', { studyId: 'other', questionnaire }, 'a'),
      call('propose_questionnaire', { studyId: 's1', questionnaire: { framing: {} } }, 'b'),
    ])
    const events = await send('Write it')
    expect(events.filter((e) => e.type === 'proposal')).toEqual([])
  })

  it('totals what the design cost across people, and only for who can open the study', async () => {
    world.model.answer([call('load_skill', { name: 'questionnaire-design' })])
    await send('Help')
    await send('Go on')
    const cost = await world.queries.questionnaireDesignCost('ada', 's1')
    expect(cost?.total).toBeCloseTo(0.02)
    expect(await world.queries.questionnaireDesignCost('eve', 's1')).toBeNull()
  })

  it('costs nothing without a design conversation', async () => {
    await send('Hello')
    expect((await world.queries.questionnaireDesignCost('ada', 's1'))?.total).toBe(0)
  })
})

describe('spec 027 - what comes after a card, on a survey study', () => {
  const system = async (continuation: 'study' | 'folder') =>
    (await buildContext(world.research.reads, ada, studyPage, 'en', [], continuation)).system

  it('offers the questionnaire after the study, never an interview guide', async () => {
    const text = await system('study')
    expect(text).toContain('designing its questionnaire')
    expect(text).not.toContain('preparing its interview guide')
  })

  it('counts no transcript after the folder', async () => {
    const text = await system('folder')
    expect(text).toContain('it will hold the form of the questionnaire')
    expect(text).not.toContain('give the number of transcripts')
    expect(text).not.toContain('transcripts,')
  })

  it('keeps the interview wording on an interview study', async () => {
    world.research.study.type = 'interviews'
    world.research.questionnaire.value = null
    expect(await system('study')).toContain('preparing its interview guide')
  })
})

describe('spec 027 - creating a survey study', () => {
  it('keeps the type on the card and when applying it', async () => {
    world.model.answer([
      call('report_study_progress', {
        reuse: 'done',
        goal: 'done',
        place: 'done',
      }),
    ])
    await send('A survey please', { kind: 'project', id: 'p1' })
    world.model.answer([
      call('create_study', { name: 'Survey', goal: 'Learn', projectId: 'p1', type: 'survey' }),
    ])
    await send('Yes', { kind: 'project', id: 'p1' })
    const applied = await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-create_study'),
    })
    expect(applied.ok).toBe(true)
    expect(world.research.actionsLog).toMatchObject([
      { action: 'createStudy', input: { type: 'survey' } },
    ])
  })
})
