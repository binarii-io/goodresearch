import { AssistantStreamEvent } from '@goodresearch/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }

const guide = {
  framing: { objectives: 'Goal', hypotheses: ['H1'], audience: '', format: '' },
  sections: [
    {
      kind: 'theme',
      title: 'Planning',
      minutes: 20,
      questions: [{ text: 'Tell me about last week.', followUps: ['And then?'] }],
    },
  ],
}

describe('study preparation (spec 006)', () => {
  let world: World
  let ada: Who
  let bob: Who
  let studyId: string

  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  const ask = async (conversationId: string, text: string) => {
    const response = await call(
      ada,
      'POST',
      `/api/assistant/conversations/${conversationId}/messages`,
      {
        text,
        page: { kind: 'study', id: studyId, phase: 'preparation' },
        language: 'en',
      },
    )
    return response.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => AssistantStreamEvent.parse(JSON.parse(chunk.slice(6))))
  }

  beforeAll(async () => {
    world = await startWorld({ config: { AI_PROVIDERS: '', AI_FAKE_PROVIDER: 'true' } })
    ada = await world.session('alex@example.org')
    bob = await world.session('zoe@research.example.com')
    const team = await world.team('Growth')
    await world.addMember(ada.id, team)
    await call(ada, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-key' })
    const projectId = (
      await call(ada, 'POST', '/api/projects', { name: 'P', goal: 'G', teamId: team })
    ).json().id
    studyId = (
      await call(ada, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Interviews',
        type: 'interviews',
      })
    ).json().id
  })
  afterAll(async () => {
    await world?.close()
  })

  it('saves the guide, keeps question ids, refuses stale versions', async () => {
    expect((await call(ada, 'GET', `/api/studies/${studyId}/guide`)).json()).toBeNull()
    const created = await call(ada, 'PUT', `/api/studies/${studyId}/guide`, {
      content: guide,
      version: null,
    })
    expect(created.statusCode).toBe(200)
    expect(created.json()).toEqual({ version: 0 })
    const saved = (await call(ada, 'GET', `/api/studies/${studyId}/guide`)).json()
    expect(saved).toMatchObject({
      origin: 'person',
      version: 0,
      updatedBy: { name: expect.any(String) },
    })
    const questionId = saved.content.sections[0].questions[0].id
    const again = await call(ada, 'PUT', `/api/studies/${studyId}/guide`, {
      content: guide,
      version: 0,
    })
    expect(again.json()).toEqual({ version: 1 })
    expect(
      (await call(ada, 'GET', `/api/studies/${studyId}/guide`)).json().content.sections[0]
        .questions[0].id,
    ).toBe(questionId)
    const stale = await call(ada, 'PUT', `/api/studies/${studyId}/guide`, {
      content: guide,
      version: 0,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    const invalid = await call(ada, 'PUT', `/api/studies/${studyId}/guide`, {
      content: { ...guide, sections: [] },
      version: 1,
    })
    expect(invalid.statusCode).toBe(422)
  })

  it('hides the preparation outside the team', async () => {
    expect((await call(bob, 'GET', `/api/studies/${studyId}/guide`)).statusCode).toBe(404)
    expect((await call(bob, 'GET', `/api/studies/${studyId}/planned-interviews`)).statusCode).toBe(
      404,
    )
  })

  it('plans interviews: sorted by date, undated last, versioned', async () => {
    const add = (payload: object) =>
      call(ada, 'POST', `/api/studies/${studyId}/planned-interviews`, payload)
    expect((await add({ interviewee: 'Undated' })).statusCode).toBe(201)
    await add({
      interviewee: 'Later',
      scheduledAt: '2026-11-03T10:00:00.000Z',
      status: 'scheduled',
    })
    const first = (
      await add({ interviewee: 'Sooner', scheduledAt: '2026-11-02T10:00:00+01:00' })
    ).json().id
    const rows = (await call(ada, 'GET', `/api/studies/${studyId}/planned-interviews`)).json()
    expect(rows.map((r: { interviewee: string }) => r.interviewee)).toEqual([
      'Sooner',
      'Later',
      'Undated',
    ])
    expect(rows[2]).toMatchObject({ status: 'to-contact', scheduledAt: null, version: 0 })
    const put = (version: number) =>
      call(ada, 'PUT', `/api/planned-interviews/${first}`, {
        interviewee: 'Sooner',
        status: 'done',
        version,
      })
    expect((await put(0)).json()).toEqual({ version: 1 })
    expect((await put(0)).statusCode).toBe(409)
    expect((await call(bob, 'DELETE', `/api/planned-interviews/${first}`)).statusCode).toBe(404)
    expect((await call(ada, 'DELETE', `/api/planned-interviews/${first}`)).statusCode).toBe(204)
    expect((await add({ interviewee: '' })).statusCode).toBe(422)
  })

  it('designs the guide with the assistant: skill, progress, checks, proposal, apply', async () => {
    const conversationId = (await call(ada, 'POST', '/api/assistant/conversations')).json().id
    const start = await ask(conversationId, 'Help me design the interview guide for this study.')
    const kinds = start.flatMap((e) => (e.type === 'proposal' ? [e.proposal.kind] : []))
    expect(kinds).toEqual(['load_skill', 'report_guide_progress'])
    const progress = start.find(
      (e) => e.type === 'proposal' && e.proposal.kind === 'report_guide_progress',
    )
    expect(progress).toMatchObject({ proposal: { preview: { progress: { percent: 8 } } } })

    const write = await ask(conversationId, 'Yes, write the guide')
    const card = write.find(
      (e) => e.type === 'proposal' && e.proposal.kind === 'propose_interview_guide',
    )
    expect(
      write.some((e) => e.type === 'proposal' && e.proposal.kind === 'check_guide_questions'),
    ).toBe(true)
    expect(card).toMatchObject({
      proposal: { state: 'proposed', preview: { replacesGuide: true } },
    })
    // The guide changed since the first test: the proposal was made on version 1.
    const id = card?.type === 'proposal' ? card.proposal.id : ''
    const applied = await call(ada, 'POST', `/api/assistant/proposals/${id}/apply`)
    expect(applied.json()).toMatchObject({
      state: 'applied',
      result: { kind: 'study', id: studyId },
    })
    const saved = (await call(ada, 'GET', `/api/studies/${studyId}/guide`)).json()
    expect(saved).toMatchObject({ origin: 'assistant', version: 2 })
    expect(saved.content.sections).toHaveLength(4)

    // The skill stays loaded for the rest of the conversation.
    const detail = (await call(ada, 'GET', `/api/assistant/conversations/${conversationId}`)).json()
    expect(detail.messages).toHaveLength(4)
  })

  it('deletes the preparation with the study', async () => {
    expect((await call(ada, 'DELETE', `/api/studies/${studyId}`)).statusCode).toBe(204)
    expect((await call(ada, 'GET', `/api/studies/${studyId}/guide`)).statusCode).toBe(404)
  })
})
