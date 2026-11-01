import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const onStudy = { kind: 'study' as const, id: 's1', phase: 'preparation' as const }
const GUIDE = {
  studyId: 's1',
  guide: {
    framing: { objectives: 'Goal', hypotheses: ['H1'], audience: 'People', format: '45 minutes' },
    sections: [
      {
        kind: 'theme',
        title: 'Planning',
        minutes: 30,
        questions: [{ text: 'Tell me about the last time you planned your week.', followUps: [] }],
      },
    ],
  },
}
const both = { studyId: 's1', kinds: ['guide', 'best-practices'] }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string) =>
  collect(world.send.send({ actor: ada, conversationId, text, page: onStudy, language: 'fr' }))
const goOn = () =>
  collect(world.send.send({ actor: ada, conversationId, page: onStudy, language: 'en' }))
const propose = (input: unknown = both) => {
  world.model.answer([
    { type: 'tool-call', call: { id: 'card', name: 'publish_preparation', input } },
  ])
  return send('Publish them')
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const lastRequest = () => world.model.requests.at(-1)
const toolNames = () => lastRequest()?.tools?.map((t) => t.name) ?? []
const apply = () => world.proposals.apply({ actor: ada, proposalId: world.idOf('card') })

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 023 US1 — publish from the conversation', () => {
  it.each([
    ['NO_SOURCE_FOLDER', 'add the folder'],
    ['GUIDE_MISSING', 'no interview guide'],
    ['NOTHING_TO_PUBLISH', 'Updates happen on the Preparation tab'],
    ['FOLDER_ACCESS_REQUIRED', 'no access'],
    ['DRIVE_UNAVAILABLE', 'Try again'],
  ])('refuses on %s, with its reason and no card', async (error, reason) => {
    world.research.publication.check = { ok: false, error }
    expect(cards(await propose())).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain(reason)
    expect(world.research.actionsLog).toEqual([])
  })

  it('refuses the schedule and a study out of reach', async () => {
    expect(cards(await propose({ studyId: 's1', kinds: ['schedule'] }))).toEqual([])
    expect(cards(await propose({ ...both, studyId: 'secret' }))).toEqual([])
  })

  it('shows what is left to publish and the folder, and writes nothing', async () => {
    world.research.publication.check = { ok: true, kinds: ['best-practices'] }
    expect(cards(await propose())[0]).toMatchObject({
      proposal: {
        kind: 'publish_preparation',
        preview: { documents: ['best-practices'], folderName: 'Interviews Q4' },
      },
    })
    expect(world.research.actionsLog).toEqual([])
  })

  it('applies through the command, in the language of the conversation', async () => {
    await propose()
    expect(await apply()).toMatchObject({
      ok: true,
      value: { result: { kind: 'study', id: 's1' } },
    })
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'publishPreparation',
      input: { studyId: 's1', kinds: ['guide', 'best-practices'], language: 'fr' },
    })
  })

  it('tells the model when the card is dismissed', async () => {
    await propose()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('card') })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Dismissed by the person')
  })

  it('goes on after a publication, saying what comes next, with no new card', async () => {
    await propose()
    await apply()
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({
      ok: true,
    })
    world.model.answer([{ type: 'text', delta: 'Done.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('your publication proposal')
    expect(toolNames()).toContain('offer_choices')
    expect(toolNames()).not.toContain('publish_preparation')
  })
})

describe('spec 023 US2 — the permission to edit', () => {
  it('shows the connection card, then goes on with the tool and the documents', async () => {
    world.research.publication.check = { ok: false, error: 'DRIVE_WRITE_REQUIRED' }
    world.research.folder.connected = false
    expect(cards(await propose())[0]).toMatchObject({
      proposal: { kind: 'connect_source', preview: { access: 'write', studyId: 's1' } },
    })
    expect(await apply()).toMatchObject({ ok: false, error: 'PROPOSAL_NOT_FOUND' })
    world.research.folder.connected = true
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({
      ok: true,
    })
    world.model.answer([{ type: 'text', delta: 'Going on.' }])
    await goOn()
    expect(toolNames()).toContain('publish_preparation')
    const messages = JSON.stringify(lastRequest()?.messages)
    expect(messages).toContain('"name":"publish_preparation"')
    expect(messages).toContain('best-practices')
    expect(messages).not.toContain('connect_source')
  })
})

describe('spec 023 US2 — a consent without the right to edit', () => {
  it('does not go on while only reading is allowed', async () => {
    world.research.publication.check = { ok: false, error: 'DRIVE_WRITE_REQUIRED' }
    await propose()
    world.research.folder.canEdit = false
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({ ok: false, error: 'NOTHING_TO_CONTINUE' })
    world.research.folder.canEdit = true
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({ ok: true })
  })
})

describe('spec 023 US3 — what comes next', () => {
  const askNext = async () => {
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('What is the next step?')
    return lastRequest()?.system ?? ''
  }

  it('names the step from the real state', async () => {
    world.research.preparation.guide = { guide: null, schedule: {} } as never
    expect(await askNext()).toContain('Next step of this study: write its interview guide')
    world.research.preparation.guide = { guide: { version: 1, content: {} }, schedule: {} } as never
    expect(await askNext()).toContain('publish its interview guide and the best practices')
    world.research.publication.published = ['guide', 'best-practices']
    expect(await askNext()).toContain('plan the interviews')
    world.research.preparation.guide = {
      guide: { version: 1, content: {} },
      schedule: { done: 1 },
    } as never
    expect(await askNext()).toContain('run the interviews in the Fieldwork tab')
    world.research.folder.state = null
    expect(await askNext()).toContain('add the folder')
  })

  it('goes on after a guide, offering what comes next', async () => {
    world.model.answer([
      { type: 'tool-call', call: { id: 'card', name: 'propose_interview_guide', input: GUIDE } },
    ])
    await send('Write it')
    await apply()
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({
      ok: true,
    })
    world.model.answer([{ type: 'text', delta: 'Saved.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('your interview guide')
    expect(toolNames()).toContain('offer_choices')
    expect(toolNames()).not.toContain('propose_interview_guide')
  })
})
