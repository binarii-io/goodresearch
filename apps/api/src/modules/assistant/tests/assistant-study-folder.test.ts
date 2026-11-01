import { beforeEach, describe, expect, it } from 'vitest'
import type { StreamEvent } from '../application/commands/send-message.ts'
import { assistantWorld } from './fakes/assistant-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const onStudy = { kind: 'study' as const, id: 's1' }
const GUIDE = { version: 1, content: {} }
const LINK = 'https://drive.google.com/drive/folders/some-folder-id'
let world: ReturnType<typeof assistantWorld>
let conversationId: string

const collect = async (events: AsyncIterable<StreamEvent>) => {
  const out: StreamEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
const send = (text: string) =>
  collect(world.send.send({ actor: ada, conversationId, text, page: onStudy, language: 'en' }))
const goOn = () =>
  collect(world.send.send({ actor: ada, conversationId, page: onStudy, language: 'en' }))
const call = (input: unknown = { studyId: 's1', link: LINK }, id = 'card') =>
  ({ type: 'tool-call', call: { id, name: 'attach_folder', input } }) as const
const propose = async (input?: unknown, id?: string) => {
  world.model.answer([call(input, id)])
  return send('Here is the link')
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const canContinue = (page: { kind: 'study'; id: string } = onStudy) =>
  world.send.openContinue({ actor: ada, conversationId, page })
const lastRequest = () => world.model.requests.at(-1)
const toolNames = () => lastRequest()?.tools?.map((t) => t.name) ?? []

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 022 US1 — attach a folder from the conversation', () => {
  it.each([
    ['NOT_A_DRIVE_FOLDER_LINK', 'not a link to a folder'],
    ['FOLDER_NOT_FOUND', 'does not exist'],
    ['FOLDER_ALREADY_ATTACHED', 'Fieldwork'],
    ['FOLDER_ACCESS_REQUIRED', 'no access'],
    ['DRIVE_NOT_CONFIGURED', 'no file source is configured'],
    ['DRIVE_UNAVAILABLE', 'Try again'],
  ])('refuses on %s, with its reason and no card', async (error, reason) => {
    world.research.folder.check = { ok: false, error }
    expect(cards(await propose())).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain(reason)
    expect(world.research.actionsLog).toEqual([])
  })

  it('refuses a study out of reach', async () => {
    expect(cards(await propose({ studyId: 'secret', link: LINK }))).toEqual([])
    expect(world.research.actionsLog).toEqual([])
  })

  it('shows the folder and its owner, and attaches nothing before Apply', async () => {
    expect(cards(await propose())[0]).toMatchObject({
      proposal: {
        kind: 'attach_folder',
        state: 'proposed',
        preview: { folderName: 'Interviews Q4', folderOwner: 'Sam' },
      },
    })
    expect(world.research.actionsLog).toEqual([])
  })

  it.each([
    ['no guide', { guide: null, schedule: { done: 1 } }, 'preparation'],
    ['no planned interview', { guide: GUIDE, schedule: {} }, 'preparation'],
    [
      'a guide and a planned interview',
      { guide: GUIDE, schedule: { 'to-contact': 1 } },
      'fieldwork',
    ],
  ])('opens the right tab with %s', async (_case, preparation, tab) => {
    world.research.preparation.guide = preparation as never
    expect(cards(await propose())[0]).toMatchObject({ proposal: { preview: { opensOn: tab } } })
  })

  it('replaces the open card with the next link', async () => {
    await propose(undefined, 'first')
    await propose(undefined, 'second')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('first') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
  })

  it('applies through the command, then goes on with the counts and no tool to change', async () => {
    await propose()
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).toMatchObject({ ok: true, value: { result: { kind: 'study', id: 's1' } } })
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'attachFolder',
      input: { studyId: 's1', link: LINK },
    })
    expect(await canContinue()).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Found.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('your folder proposal')
    expect(lastRequest()?.system).toContain('3 transcripts, 2 recordings, 1 other files')
    expect(toolNames()).not.toContain('attach_folder')
  })

  it('tells the model when the card is dismissed', async () => {
    await propose()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('card') })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Dismissed by the person')
    expect(world.research.actionsLog).toEqual([])
  })
})

describe('spec 022 US2 — connect first', () => {
  const notConnected = async () => {
    world.research.folder.check = { ok: false, error: 'DRIVE_NOT_CONNECTED' }
    world.research.folder.connected = false
    return propose()
  }

  it('shows the connection card, which Apply cannot decide', async () => {
    expect(cards(await notConnected())[0]).toMatchObject({
      proposal: { kind: 'connect_source', state: 'proposed' },
    })
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).toMatchObject({ ok: false, error: 'PROPOSAL_NOT_FOUND' })
    expect(world.research.actionsLog).toEqual([])
  })

  it('goes on only once really connected, once, with the link and the tool', async () => {
    await notConnected()
    expect(await canContinue()).toMatchObject({ ok: false, error: 'NOTHING_TO_CONTINUE' })
    world.research.folder.connected = true
    expect(await canContinue()).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Going on.' }])
    await goOn()
    const request = lastRequest()
    expect(request?.system).toContain('just connected their file source')
    expect(toolNames()).toContain('attach_folder')
    expect(JSON.stringify(request?.messages)).toContain(LINK)
    expect(JSON.stringify(request?.messages)).not.toContain('connect_source')
    expect(await canContinue()).toMatchObject({ ok: false, error: 'NOTHING_TO_CONTINUE' })
  })

  it('does not go on from another study than the card', async () => {
    await notConnected()
    world.research.folder.connected = true
    expect(await canContinue({ kind: 'study', id: 's2' })).toMatchObject({
      ok: false,
      error: 'NOTHING_TO_CONTINUE',
    })
  })

  it('tells the model a replaced connection card was replaced, not dismissed', async () => {
    await notConnected()
    await propose(undefined, 'second')
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(world.history())).toContain('Replaced by your newer card')
    expect(JSON.stringify(world.history())).not.toContain('Dismissed by the person')
  })

  it('does not go on after the card was dismissed', async () => {
    await notConnected()
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('card') })
    world.research.folder.connected = true
    expect(await canContinue()).toMatchObject({ ok: false, error: 'NOTHING_TO_CONTINUE' })
  })
})

describe('spec 022 US3 — the right time', () => {
  it('holds the folder state on the study page, nothing when there is none', async () => {
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('What does it hold?')
    expect(lastRequest()?.system).toContain('Source folder: Interviews Q4 (inventory done')
    world.research.folder.state = null
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('And now?')
    expect(lastRequest()?.system).toContain('Source folder: (none, or no access)')
  })

  it('gives the tabs the names of the app, in French', async () => {
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await collect(
      world.send.send({ actor: ada, conversationId, text: 'Salut', page: onStudy, language: 'fr' }),
    )
    expect(lastRequest()?.system).toContain('Passation (for fieldwork, never "Terrain")')
  })

  it('offers the folder and the guide after a study is created', async () => {
    world.model.answer([
      {
        type: 'tool-call',
        call: {
          id: 'framed',
          name: 'report_study_progress',
          input: { reuse: 'done', goal: 'done', place: 'done' },
        },
      },
    ])
    await send('Framing')
    world.clock.advance(1000)
    world.model.answer([
      {
        type: 'tool-call',
        call: {
          id: 'study',
          name: 'create_study',
          input: { name: 'A', goal: 'Why', projectId: 'p1' },
        },
      },
    ])
    await send('Propose it')
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('study') })
    world.model.answer([{ type: 'text', delta: 'Ready.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('adding the folder')
    expect(toolNames()).toContain('offer_choices')
    expect(lastRequest()?.system).toContain('preparing its interview guide')
    expect(toolNames()).not.toContain('attach_folder')
  })
})
