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
const goOn = () =>
  collect(world.send.send({ actor: ada, conversationId, page: onStudy, language: 'en' }))
const tool = (name: string, input: unknown, id = 'call') => {
  world.model.answer([{ type: 'tool-call', call: { id, name, input } }])
  return send('Go')
}
const cards = (events: StreamEvent[]) => events.filter((e) => e.type === 'proposal')
const lastRequest = () => world.model.requests.at(-1)
const toolNames = () => lastRequest()?.tools?.map((t) => t.name) ?? []
const canContinue = () => world.send.openContinue({ actor: ada, conversationId, page: onStudy })
const consent = async () => {
  await world.research.reads.aiProvider('ada')
  world.research.folderWork.consents.add('ada:s1:anthropic')
}
const lines = [
  { kind: 'new-folder', key: 'sort', name: 'To sort', parent: 'root' },
  { kind: 'move', fileId: 'f1', to: 'sort' },
]

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 024 US1 — see the folder', () => {
  it('asks for consent first, and sends no name', async () => {
    const shown = cards(await tool('browse_folder', { studyId: 's1' }))
    expect(shown[0]).toMatchObject({
      proposal: { kind: 'folder_consent', preview: { provider: 'anthropic', studyId: 's1' } },
    })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest())).not.toContain('Interview Sam')
  })

  it('goes on by itself once agreed, with the same call in the history', async () => {
    await tool('browse_folder', { studyId: 's1' })
    expect(await canContinue()).toMatchObject({ ok: false })
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('call') })
    expect(await canContinue()).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Looking.' }])
    await goOn()
    const request = lastRequest()
    expect(request?.system).toContain('just agreed')
    expect(toolNames()).toContain('browse_folder')
    expect(JSON.stringify(request?.messages)).toContain('"name":"browse_folder"')
    expect(JSON.stringify(request?.messages)).not.toContain('folder_consent')
  })

  it('tells the model when the person refuses', async () => {
    await tool('browse_folder', { studyId: 's1' })
    await world.proposals.dismiss({ actor: ada, proposalId: world.idOf('call') })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest())).toContain('only counts are available')
  })

  it('records the consent for the provider of the card only', async () => {
    await tool('browse_folder', { studyId: 's1' })
    world.research.folderWork.provider = 'openai'
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call') }),
    ).toMatchObject({ ok: true, value: { state: 'failed' } })
    expect(world.research.folderWork.consents.size).toBe(0)
  })

  it('asks no consent for what cannot happen', async () => {
    world.research.folderWork.available = { ok: false, error: 'STUDY_ANONYMISED' }
    expect(cards(await tool('browse_folder', { studyId: 's1' }))).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest()?.messages)).toContain('anonymise names')
  })

  it('replays its calls with their study', async () => {
    await consent()
    await tool('read_file', { studyId: 's1', fileId: 'f1' })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest()?.messages)).toContain('"studyId":"s1"')
  })

  it('asks again for another provider', async () => {
    await consent()
    world.research.folderWork.provider = 'openai'
    expect(cards(await tool('browse_folder', { studyId: 's1' }))[0]).toMatchObject({
      proposal: { kind: 'folder_consent' },
    })
  })

  it('gives the items at once, and keeps none of them', async () => {
    await consent()
    const stored = await tool('browse_folder', { studyId: 's1' })
    expect(cards(stored)[0]).toMatchObject({ proposal: { kind: 'browse_folder' } })
    expect(JSON.stringify(cards(stored))).not.toContain('Interview Sam')
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    const history = JSON.stringify(lastRequest()?.messages)
    expect(history).toContain('call it again')
    expect(history).not.toContain('Interview Sam')
  })

  it.each([
    ['STUDY_ANONYMISED', 'anonymise names'],
    ['OUTSIDE_FOLDER', "study's folder"],
    ['NO_SOURCE_FOLDER', 'add it first'],
  ])('gives the reason on %s', async (error, reason) => {
    await consent()
    world.research.folderWork.browse = { ok: false, error }
    await tool('browse_folder', { studyId: 's1' })
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest()?.messages)).toContain(reason)
  })

  it('lets it open sub-folders when the list was cut', async () => {
    await consent()
    world.research.folderWork.browse = { ok: true, items: [], cut: false }
    world.model.answer([
      {
        type: 'tool-call',
        call: { id: 'a', name: 'browse_folder', input: { studyId: 's1', folderId: 'sub1' } },
      },
      {
        type: 'tool-call',
        call: { id: 'b', name: 'browse_folder', input: { studyId: 's1', folderId: 'sub2' } },
      },
    ])
    expect(cards(await send('Go on'))).toHaveLength(2)
  })

  it('does not open the folder twice in one answer', async () => {
    await consent()
    world.model.answer([
      { type: 'tool-call', call: { id: 'one', name: 'browse_folder', input: { studyId: 's1' } } },
      {
        type: 'tool-call',
        call: { id: 'two', name: 'browse_folder', input: { studyId: 's1', folderId: 'sub' } },
      },
    ])
    expect(cards(await send('What is there?'))).toHaveLength(1)
  })

  it('tells the model when a tool fails, instead of failing the answer', async () => {
    world.research.reads.aiProvider = async () => {
      throw new Error('relation does not exist')
    }
    const events = await tool('browse_folder', { studyId: 's1' })
    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'complete' })
    expect(cards(events)).toEqual([])
  })

  it('refuses a study out of reach, without any consent card', async () => {
    expect(cards(await tool('browse_folder', { studyId: 'secret' }))).toEqual([])
  })
})

describe('spec 024 US2 — find a file', () => {
  it('gives what matches at once, and keeps none of it', async () => {
    await consent()
    const events = await tool('find_files', { studyId: 's1', query: 'sam' })
    expect(cards(events)[0]).toMatchObject({ proposal: { kind: 'find_files' } })
    expect(JSON.stringify(cards(events))).not.toContain('Interview Sam')
  })

  it('asks for consent first, and needs a query or a kind', async () => {
    expect(cards(await tool('find_files', { studyId: 's1', query: 'sam' }))[0]).toMatchObject({
      proposal: { kind: 'folder_consent' },
    })
    await consent()
    expect(cards(await tool('find_files', { studyId: 's1' }, 'none'))).toEqual([])
  })
})

describe('spec 024 — never a silent answer', () => {
  it('says so when the model ends on a tool without a word', async () => {
    await consent()
    const events = await tool('find_files', { studyId: 's1', query: 'sam' })
    expect(events.filter((e) => e.type === 'text')).toMatchObject([
      { delta: expect.stringContaining('could not finish') },
    ])
    expect(world.messages.at(-1)?.text).toContain('could not finish')
  })

  it('adds nothing when a card waits for the person', async () => {
    const events = await tool('find_files', { studyId: 's1', query: 'sam' })
    expect(events.filter((e) => e.type === 'text')).toEqual([])
  })
})

describe('spec 024 US2 — read a file', () => {
  it('names the file on the panel, and keeps no text', async () => {
    await consent()
    const events = await tool('read_file', { studyId: 's1', fileId: 'f1' })
    expect(cards(events)[0]).toMatchObject({
      proposal: { kind: 'read_file', preview: { fileName: 'Interview Sam.txt' } },
    })
    expect(JSON.stringify(cards(events))).not.toContain('Hello')
  })

  it('stops at five reads per answer', async () => {
    await consent()
    world.model.answer(
      Array.from({ length: 6 }, (_, i) => ({
        type: 'tool-call' as const,
        call: { id: `r${i}`, name: 'read_file', input: { studyId: 's1', fileId: 'f1' } },
      })),
    )
    expect(cards(await send('Read them'))).toHaveLength(5)
  })
})

describe('spec 024 US3 — tidy with one card', () => {
  const propose = () => tool('propose_folder_changes', { studyId: 's1', lines }, 'card')
  const applyLines = (excluded: number[] = []) =>
    world.proposals.applyFolderChanges({
      actor: ada,
      proposalId: world.idOf('card'),
      excluded,
    })

  it('shows the lines, changes nothing, and has no way to delete', async () => {
    await consent()
    expect(cards(await propose())[0]).toMatchObject({
      proposal: {
        kind: 'propose_folder_changes',
        preview: { lines: [{ kind: 'new-folder' }, { kind: 'move', dependsOn: 0 }] },
      },
    })
    expect(world.research.actionsLog).toEqual([])
    const refused = await tool(
      'propose_folder_changes',
      { studyId: 's1', lines: [{ kind: 'delete', fileId: 'f1' }] },
      'gone',
    )
    expect(cards(refused)).toEqual([])
  })

  it('refuses generic Apply, and applies the lines kept once', async () => {
    await consent()
    await propose()
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).toMatchObject({ ok: false, error: 'FOLDER_CHANGES_REQUIRED' })
    expect(await applyLines([1])).toMatchObject({
      ok: true,
      value: {
        state: 'applied',
        preview: { lines: [{ outcome: 'done' }, { outcome: 'skipped' }] },
      },
    })
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'applyFolderChanges',
      input: { studyId: 's1', excluded: [1] },
    })
    expect(await applyLines()).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
  })

  it('tells the model each outcome, then goes on', async () => {
    await consent()
    await propose()
    await applyLines()
    expect(await canContinue()).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Done.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('just applied your changes')
    expect(JSON.stringify(lastRequest()?.messages)).toContain('To sort / A: skipped')
    expect(toolNames()).not.toContain('propose_folder_changes')
  })

  it.each([
    ['OUTSIDE_FOLDER', "study's folder"],
    ['NAME_CLASH', 'same name'],
    ['INVENTORY_RUNNING', 'inventory'],
  ])('gives the reason on %s', async (error, reason) => {
    await consent()
    world.research.folderWork.check = { ok: false, error }
    expect(cards(await propose())).toEqual([])
    world.model.answer([{ type: 'text', delta: 'ok' }])
    await send('Next')
    expect(JSON.stringify(lastRequest()?.messages)).toContain(reason)
  })

  it('leads to the right to edit, and goes on with the same lines', async () => {
    await consent()
    world.research.folderWork.check = { ok: false, error: 'DRIVE_WRITE_REQUIRED' }
    expect(cards(await propose())[0]).toMatchObject({
      proposal: { kind: 'connect_source', preview: { access: 'write' } },
    })
    expect(await canContinue()).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Going on.' }])
    await goOn()
    expect(toolNames()).toContain('propose_folder_changes')
    const history = JSON.stringify(lastRequest()?.messages)
    expect(history).toContain('"name":"propose_folder_changes"')
    expect(history).toContain('To sort')
  })
})
