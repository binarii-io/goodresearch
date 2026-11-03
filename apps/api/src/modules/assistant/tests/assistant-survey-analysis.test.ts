import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const studyPage = { kind: 'study' as const, id: 's1', phase: 'analysis' as const }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string) =>
  collect(world.send.send({ actor: ada, conversationId, text, page: studyPage, language: 'en' }))
const call = (name: string, input: unknown, id = `call-${name}`) =>
  ({ type: 'tool-call', call: { id, name, input } }) as const

beforeEach(async () => {
  world = assistantWorld()
  world.research.study.type = 'survey'
  world.research.preparation.guide = null
  world.research.questionnaire.value = { version: 1, content: null, checksDone: true }
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 029 - the analysis of a survey with the assistant', () => {
  it('reads counts and figures computed by the app, never an answer', async () => {
    world.model.answer([
      call('survey_analysis_state', { studyId: 's1' }),
      call('read_figures', { studyId: 's1', crossBy: null }, 'call-figures'),
    ])
    await send('Where is the analysis?')
    expect(JSON.parse(world.model.outputs[0] ?? '{}')).toMatchObject({
      counted: 6,
      openItems: [{ text: 'Tell us more', answers: 6 }],
    })
    expect(world.model.outputs[1]).toContain('agree 50 %')
    // What the model received holds figures, never the text of an answer.
    const sent = JSON.stringify(world.model.requests)
    expect(sent).not.toContain('Because')
  })

  it('proposes facts on figures the app computed, made on Apply', async () => {
    world.model.answer([
      call('propose_survey_facts', {
        studyId: 's1',
        facts: [
          { itemId: 'scale-1', measure: 'agree', polarity: 'positive' },
          { itemId: 'gone', measure: 'mean' },
        ],
      }),
    ])
    const events = await send('Make facts of the striking figures')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        preview: {
          surveyFacts: [
            { item: 'Planning is easy', figure: 'agree 50 %', base: 6, smallBase: true },
          ],
        },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call-propose_survey_facts') })
    expect(world.research.actionsLog).toMatchObject([
      {
        action: 'createSurveyFacts',
        input: { facts: [{ itemId: 'scale-1', polarity: 'positive' }] },
      },
    ])
  })

  it('starts a theme analysis only once the person applies the card with its cost', async () => {
    world.model.answer([call('propose_theme_analysis', { studyId: 's1', itemId: 'open-1' })])
    const events = await send('Find the themes')
    expect(events.find((e) => e.type === 'proposal')).toMatchObject({
      proposal: {
        preview: { openItem: { text: 'Tell us more', answers: 6 }, estimatedCost: 0.01 },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    await world.proposals.apply({
      actor: ada,
      proposalId: world.idOf('call-propose_theme_analysis'),
    })
    expect(world.research.actionsLog).toMatchObject([
      { action: 'startThemes', input: { itemId: 'open-1', onlyNew: false } },
    ])
  })

  it('refuses a theme analysis of an item that is not open', async () => {
    world.model.answer([call('propose_theme_analysis', { studyId: 's1', itemId: 'scale-1' })])
    const events = await send('Find the themes')
    expect(events.filter((e) => e.type === 'proposal')).toEqual([])
    expect(world.model.outputs[0]).toContain('not an open item')
  })
})
