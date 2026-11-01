import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const onStudy = { kind: 'study' as const, id: 's1' }
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string) =>
  collect(world.send.send({ actor: ada, conversationId, text, page: onStudy, language: 'en' }))
const offer = (input: unknown) => {
  world.model.answer([{ type: 'tool-call', call: { id: 'offer', name: 'offer_choices', input } }])
  return send('What next?')
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const valid = { question: 'What next?', choices: ['The guide', 'The schedule'], multiple: true }

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 022 US4 — a list of choices', () => {
  it('shows a valid list, changes nothing, and tells the model the next message answers', async () => {
    expect(cards(await offer(valid))[0]).toMatchObject({
      proposal: { kind: 'offer_choices', preview: valid },
    })
    expect(world.research.actionsLog).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('The guide')
    expect(JSON.stringify(world.history())).toContain('their next message answers it')
  })

  it.each([
    ['one choice', { ...valid, choices: ['Only'] }],
    ['seven choices', { ...valid, choices: ['1', '2', '3', '4', '5', '6', '7'] }],
    ['the same choice twice', { ...valid, choices: ['Same', 'Same'] }],
    ['no question', { ...valid, question: '' }],
  ])('shows nothing with %s, and says why', async (_case, input) => {
    expect(cards(await offer(input))).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('2 to 6 different choices')
  })

  it('is offered on any page', async () => {
    world.model.answer([{ type: 'text', delta: 'Hi' }])
    await send('Hello')
    expect(world.model.requests.at(-1)?.tools?.map((t) => t.name)).toContain('offer_choices')
  })
})
