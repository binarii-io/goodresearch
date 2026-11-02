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
const toolOutput = async () => {
  world.model.answer([{ type: 'text', delta: 'ok' }])
  await send('Next')
  return JSON.stringify(lastRequest()?.messages)
}
const consent = () => world.research.folderWork.consents.add('ada:s1:anthropic')

beforeEach(async () => {
  world = assistantWorld()
  const created = await world.conversations.create({ actor: ada })
  conversationId = created.ok ? created.value.id : ''
})

describe('spec 025 US1 — where interviews stand', () => {
  it('counts without consent, card or name', async () => {
    const events = await tool('count_interviews', { studyId: 's1' })
    expect(cards(events)[0]).toMatchObject({ proposal: { kind: 'count_interviews' } })
    expect(world.model.outputs.at(-1) ?? '').toContain('"to-decide":2')
    expect(world.model.outputs.at(-1) ?? '').not.toContain('Nadia')
  })

  it('asks for consent before any name', async () => {
    const shown = cards(await tool('list_interviews', { studyId: 's1' }))
    expect(shown[0]).toMatchObject({ proposal: { kind: 'folder_consent' } })
    expect(world.model.outputs.at(-1) ?? '').not.toContain('Nadia')
  })

  it('lists what the filters select, and keeps nothing of it', async () => {
    consent()
    const events = await tool('list_interviews', {
      studyId: 's1',
      filters: ['to-decide', 'no-recording'],
      name: 'nadia',
      page: 2,
    })
    expect(world.research.folderWork.lastSearch).toEqual({
      filters: ['to-decide', 'no-recording'],
      name: 'nadia',
      page: 2,
    })
    expect(world.model.outputs.at(-1) ?? '').toContain('Nadia')
    expect(JSON.stringify(cards(events))).not.toContain('Nadia')
    expect(await toolOutput()).not.toContain('Nadia')
  })

  it('takes no filter, and refuses an unknown one', async () => {
    consent()
    expect(cards(await tool('list_interviews', { studyId: 's1' }))).toHaveLength(1)
    expect(
      cards(await tool('list_interviews', { studyId: 's1', filters: ['nope'] }, 'bad')),
    ).toEqual([])
  })

  it('refuses a list on a study set to anonymise names, and still counts', async () => {
    world.research.folderWork.available = { ok: false, error: 'STUDY_ANONYMISED' }
    expect(cards(await tool('list_interviews', { studyId: 's1' }))).toEqual([])
    expect(world.model.outputs.at(-1) ?? '').toContain('anonymise names')
    expect(cards(await tool('count_interviews', { studyId: 's1' }, 'count'))).toHaveLength(1)
  })

  it('gives the reason when the interviews are out of reach', async () => {
    world.research.folderWork.counts = { ok: false, error: 'FOLDER_ACCESS_REQUIRED' }
    expect(cards(await tool('count_interviews', { studyId: 's1' }))).toEqual([])
    expect(world.model.outputs.at(-1) ?? '').toContain('no access')
  })
})

describe('spec 025 US2 — start the analysis', () => {
  it('shows the number and cost, and starts nothing', async () => {
    expect(cards(await tool('propose_analysis', { studyId: 's1' }))[0]).toMatchObject({
      proposal: {
        kind: 'propose_analysis',
        preview: { interviews: 3, estimatedCost: 0.02, consentNeeded: true },
      },
    })
    expect(world.research.actionsLog).toEqual([])
  })

  it.each([
    [
      { count: 0, estimatedCost: 0, consentNeeded: false, aiConnected: true, running: false },
      'nothing left',
    ],
    [
      { count: 3, estimatedCost: 0, consentNeeded: false, aiConnected: false, running: false },
      'AI provider',
    ],
  ])('refuses when it cannot start', async (estimate, reason) => {
    world.research.folderWork.estimate = { ok: true, ...estimate }
    expect(cards(await tool('propose_analysis', { studyId: 's1' }))).toEqual([])
    expect(world.model.outputs.at(-1) ?? '').toContain(reason)
  })

  it('starts on Apply with the consent the card states, then goes on', async () => {
    await tool('propose_analysis', { studyId: 's1' })
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('call') }),
    ).toMatchObject({ ok: true, value: { result: { kind: 'study', id: 's1' } } })
    expect(world.research.actionsLog.at(-1)).toMatchObject({
      action: 'startAnalysis',
      input: { studyId: 's1', consent: true },
    })
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Done.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('just applied your analysis')
    const names = lastRequest()?.tools?.map((t) => t.name) ?? []
    expect(names).toContain('count_interviews')
    expect(names).not.toContain('propose_analysis')
  })

  it('tells the model when a run is already going', async () => {
    world.research.folderWork.estimate = {
      ok: true,
      count: 3,
      estimatedCost: 0.02,
      consentNeeded: false,
      aiConnected: true,
      running: true,
    }
    expect(cards(await tool('propose_analysis', { studyId: 's1' }))).toEqual([])
    expect(world.model.outputs.at(-1) ?? '').toContain('already running')
  })

  it('gives no consent the card did not ask, and none to another provider', async () => {
    world.research.folderWork.estimate = {
      ok: true,
      count: 3,
      estimatedCost: 0.02,
      consentNeeded: false,
      aiConnected: true,
      running: false,
    }
    await tool('propose_analysis', { studyId: 's1' }, 'first')
    await world.proposals.apply({ actor: ada, proposalId: world.idOf('first') })
    expect(world.research.actionsLog.at(-1)).toMatchObject({ input: { consent: false } })
    const before = world.research.actionsLog.length
    await tool('propose_analysis', { studyId: 's1' }, 'second')
    world.research.folderWork.provider = 'openai'
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('second') }),
    ).toMatchObject({ ok: true, value: { state: 'failed', error: 'AI_PROVIDER_REQUIRED' } })
    expect(world.research.actionsLog).toHaveLength(before)
  })
})

describe('spec 025 US3, US4 — cards on interviews', () => {
  beforeEach(() => {
    consent()
  })

  const propose = (
    name: string,
    items: unknown[] = [{ interviewId: 'i1', reason: 'A test call' }],
  ) => tool(name, { studyId: 's1', items }, 'card')
  const applyLines = (excluded: number[] = [], reasons: { index: number; reason: string }[] = []) =>
    world.proposals.applyInterviewLines({
      actor: ada,
      proposalId: world.idOf('card'),
      excluded,
      reasons,
    })

  it.each([
    ['propose_accepting_suggestions', 'suggestions'],
    ['propose_validating_interviews', 'validate'],
    ['propose_excluding_interviews', 'exclude'],
  ])('%s shows a card, and changes nothing', async (name, kind) => {
    const shown = cards(await propose(name))
    expect(shown[0]).toMatchObject({
      proposal: { kind: name, preview: { interviewLines: [{ interview: 'Nadia' }] } },
    })
    expect(world.research.folderWork.lastCard).toBe(kind)
    expect(world.research.actionsLog).toEqual([])
  })

  it('asks for consent before a card with names', async () => {
    world.research.folderWork.consents.clear()
    expect(cards(await propose('propose_validating_interviews'))).toMatchObject([
      { proposal: { kind: 'folder_consent' } },
    ])
    expect(world.research.folderWork.lastCard).toBe('')
  })

  it('does not send the lines of a card back to the model', async () => {
    await propose('propose_validating_interviews')
    world.model.answer([{ type: 'text', delta: 'Ok.' }])
    await send('Next')
    const replayed = JSON.stringify(lastRequest()?.messages)
    expect(replayed).toContain('i1')
    expect(replayed).not.toContain('2026-10-23')
  })

  it('leaves open a card about another study', async () => {
    await propose('propose_validating_interviews')
    world.research.folderWork.consents.add('ada:s2:anthropic')
    await tool(
      'propose_validating_interviews',
      { studyId: 's2', items: [{ interviewId: 'i1' }] },
      'other',
    )
    const stored = await world.store.listProposals(conversationId)
    expect(stored.find((p) => p.id === world.idOf('card'))?.state).toBe('proposed')
  })

  it('keeps on the card the reason the person corrected', async () => {
    await propose('propose_excluding_interviews')
    expect(await applyLines([], [{ index: 0, reason: 'Withdrew' }])).toMatchObject({
      ok: true,
      value: { preview: { interviewLines: [{ reason: 'Withdrew' }] } },
    })
  })

  it('gives no tool that decides by itself', async () => {
    world.model.answer([{ type: 'text', delta: 'Hi' }])
    await send('Hello')
    const names = lastRequest()?.tools?.map((t) => t.name) ?? []
    expect(names.filter((n) => /^(accept|validate|exclude)/.test(n))).toEqual([])
  })

  it('refuses generic Apply, and runs the lines kept once', async () => {
    await propose('propose_accepting_suggestions')
    expect(
      await world.proposals.apply({ actor: ada, proposalId: world.idOf('card') }),
    ).toMatchObject({ ok: false, error: 'FOLDER_CHANGES_REQUIRED' })
    expect(await applyLines()).toMatchObject({
      ok: true,
      value: { state: 'applied', preview: { interviewLines: [{ outcome: 'done' }] } },
    })
    expect(await applyLines()).toMatchObject({ ok: false, error: 'PROPOSAL_DECIDED' })
  })

  it('tells the model each outcome, and goes on', async () => {
    await propose('propose_validating_interviews')
    await applyLines()
    expect(
      await world.send.openContinue({ actor: ada, conversationId, page: onStudy }),
    ).toMatchObject({ ok: true })
    world.model.answer([{ type: 'text', delta: 'Done.' }])
    await goOn()
    expect(lastRequest()?.system).toContain('just applied your card on interviews')
    expect(JSON.stringify(lastRequest()?.messages)).toContain('Nadia (date): done')
  })

  it.each([
    ['ANALYSIS_RUNNING', 'already running'],
    ['NOTHING_TO_DECIDE', 'nothing left to decide'],
    ['REASON_REQUIRED', 'reason'],
    ['INTERVIEW_NOT_FOUND', 'list_interviews'],
  ])('gives the reason on %s', async (error, reason) => {
    world.research.folderWork.linesResult = { ok: false, error }
    expect(cards(await propose('propose_excluding_interviews'))).toEqual([])
    expect(world.model.outputs.at(-1) ?? '').toContain(reason)
  })

  it('tells the model what an attachment is not', async () => {
    world.model.answer([{ type: 'text', delta: 'Hi' }])
    await send('Hello')
    expect(lastRequest()?.system).toContain('is not its transcript')
    expect(lastRequest()?.system).toContain('only a person validates')
  })
})
