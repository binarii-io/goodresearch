import { AssistantStreamEvent } from '@goodresearch/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }

describe('assistant (spec 005)', () => {
  let world: World
  let ada: Who
  let bob: Who
  let projectId: string
  let conversationId: string

  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  /** Sends a message and reads the whole event stream (validated like the browser does). */
  const ask = async (who: Who, text: string, page: object) => {
    const response = await call(
      who,
      'POST',
      `/api/assistant/conversations/${conversationId}/messages`,
      {
        text,
        page,
        language: 'en',
      },
    )
    expect(response.headers['content-type']).toContain('text/event-stream')
    return response.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => AssistantStreamEvent.parse(JSON.parse(chunk.slice(6))))
  }

  beforeAll(async () => {
    world = await startWorld({
      config: {
        AI_PROVIDERS: '',
        AI_FAKE_PROVIDER: 'true',
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":1000,"outputPerMillion":1000}]',
      },
    })
    ada = await world.session('alex@example.org')
    bob = await world.session('zoe@research.example.com')
    const team = await world.team('Growth')
    await world.addMember(ada.id, team)
    for (const who of [ada, bob])
      await call(who, 'PUT', '/api/ai-provider/api-key', {
        provider: 'fake',
        apiKey: 'test-ok-key',
      })
    const created = await call(ada, 'POST', '/api/projects', {
      name: 'Onboarding',
      goal: 'Old goal',
      teamId: team,
    })
    projectId = created.json().id
    conversationId = (await call(ada, 'POST', '/api/assistant/conversations')).json().id
  })
  afterAll(async () => {
    await world?.close()
  })

  it('streams an answer and stores the conversation', async () => {
    const events = await ask(ada, 'hello there', { kind: 'home' })
    expect(events[0]?.type).toBe('start')
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => e.delta)
        .join(''),
    ).toBe('You said: hello there')
    expect(events.at(-1)).toEqual({ type: 'done', status: 'complete' })
    const detail = (await call(ada, 'GET', `/api/assistant/conversations/${conversationId}`)).json()
    expect(detail.title).toBe('hello there')
    expect(detail.messages.map((m: { role: string }) => m.role)).toEqual(['person', 'assistant'])
    // Fake usage: 8 tokens in, 1 out, at 1000 USD per million each.
    expect(detail.cost.total).toBeCloseTo(0.009)
    expect(detail.cost.last).toBeCloseTo(0.009)
  })

  it('proposes a goal for the open project and applies it only on Apply', async () => {
    const events = await ask(ada, 'propose goal', { kind: 'project', id: projectId })
    const card = events.find((e) => e.type === 'proposal')
    if (card?.type !== 'proposal') throw new Error('no proposal')
    expect(card.proposal).toMatchObject({
      kind: 'update_project_goal',
      state: 'proposed',
      preview: { projectName: 'Onboarding', previousGoal: 'Old goal' },
    })
    expect((await call(ada, 'GET', `/api/projects/${projectId}`)).json().goal).toBe('Old goal')

    // Someone else cannot decide it.
    expect(
      (await call(bob, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`)).statusCode,
    ).toBe(404)

    const applied = await call(ada, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`)
    expect(applied.json()).toMatchObject({
      state: 'applied',
      result: { kind: 'project', id: projectId },
    })
    expect((await call(ada, 'GET', `/api/projects/${projectId}`)).json().goal).toBe(
      card.proposal.preview.goal,
    )
    expect(
      (await call(ada, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`)).json().code,
    ).toBe('PROPOSAL_DECIDED')
  })

  it('creates a study from a proposal', async () => {
    await ask(ada, 'study framing answered', { kind: 'project', id: projectId })
    const events = await ask(ada, 'propose the study', { kind: 'project', id: projectId })
    const card = events.find((e) => e.type === 'proposal')
    if (card?.type !== 'proposal') throw new Error('no proposal')
    const applied = (
      await call(ada, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`)
    ).json()
    expect(applied.result.kind).toBe('study')
    const studies = (await call(ada, 'GET', `/api/projects/${projectId}/studies`)).json()
    expect(studies.map((s: { name: string }) => s.name)).toContain('Interviews with new users')
  })

  it('applies a proposal at most once, even when Apply is sent twice at the same time', async () => {
    // The study applied above ended the framing of the previous conversation.
    conversationId = (await call(ada, 'POST', '/api/assistant/conversations')).json().id
    await ask(ada, 'study framing answered', { kind: 'project', id: projectId })
    const events = await ask(ada, 'propose the study', { kind: 'project', id: projectId })
    const card = events.find((e) => e.type === 'proposal')
    if (card?.type !== 'proposal') throw new Error('no proposal')
    const before = (await call(ada, 'GET', `/api/projects/${projectId}/studies`)).json().length
    const [first, second] = await Promise.all([
      call(ada, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`),
      call(ada, 'POST', `/api/assistant/proposals/${card.proposal.id}/apply`),
    ])
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409])
    const after = (await call(ada, 'GET', `/api/projects/${projectId}/studies`)).json().length
    expect(after).toBe(before + 1)
  })

  it('keeps conversations private', async () => {
    expect(
      (await call(bob, 'GET', `/api/assistant/conversations/${conversationId}`)).statusCode,
    ).toBe(404)
    expect((await call(bob, 'GET', '/api/assistant/conversations')).json()).toEqual([])
    const refused = await call(
      bob,
      'POST',
      `/api/assistant/conversations/${conversationId}/messages`,
      {
        text: 'hi',
        page: { kind: 'home' },
        language: 'en',
      },
    )
    expect(refused.json().code).toBe('CONVERSATION_NOT_FOUND')
  })

  it('does not give another person the project context', async () => {
    const own = (await call(bob, 'POST', '/api/assistant/conversations')).json().id
    const events = await (async () => {
      conversationId = own
      return ask(bob, 'propose goal', { kind: 'project', id: projectId })
    })()
    // The script only proposes when the context names the project: Bob's context does not.
    expect(events.some((e) => e.type === 'proposal')).toBe(false)
  })

  it('renames and deletes a conversation', async () => {
    expect(
      (
        await call(bob, 'PATCH', `/api/assistant/conversations/${conversationId}`, {
          title: 'Mine',
        })
      ).statusCode,
    ).toBe(204)
    expect((await call(bob, 'GET', '/api/assistant/conversations')).json()[0].title).toBe('Mine')
    expect(
      (await call(bob, 'DELETE', `/api/assistant/conversations/${conversationId}`)).statusCode,
    ).toBe(204)
    expect((await call(bob, 'GET', '/api/assistant/conversations')).json()).toEqual([])
  })
})
