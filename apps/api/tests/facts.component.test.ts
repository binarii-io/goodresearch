import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Overview = {
  interviews: {
    sessionId: string
    title: string
    state: string
    verbatims: number
    facts: { toDecide: number; accepted: number }
    cost: number | null
  }[]
  run: { finished: boolean; leftOut: { verbatims: number; facts: number } } | null
  cost: number | null
}
type FactView = {
  id: string
  version: number
  status: string
  statement: { en: string; fr: string }
  translation: string
  verbatims: { id: string; text: string; participant: string | null }[]
}
type Interview = {
  turns: { id: string; role: string; text: string }[] | null
  verbatims: { id: string; text: string; segmentId: string }[]
  facts: FactView[]
}

const TEXTS: Record<string, string> = {
  'f-one': [
    'Alex Martin: Thanks for joining, Sam Example. How do you find the data?',
    'Sam Example: I never find the data of my team quickly. Alex Martin knows it.',
    'Alex Martin: And the newsletter?',
    'Sam Example: The newsletter helps me every single week. Really.',
  ].join('\n'),
}

describe('Verbatims and facts on PostgreSQL (spec 012)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let outsider: Who
  let studyId: string
  const sent: string[] = []
  const fake = createFakeRunner()
  const runner: ModelRunner = {
    generateText: (c, m, r, t) => fake.generateText(c, m, r, t),
    generateObject: (c, m, r, t) => {
      sent.push(JSON.stringify(r))
      return fake.generateObject(c, m, r, t)
    },
    stream: (c, m, r, t) => fake.stream(c, m, r, t),
  }
  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })
  const overview = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/facts-analysis`)).json<Overview>()

  beforeAll(async () => {
    drive = new InMemoryDrive()
    world = await startWorld({
      drive,
      runner,
      config: {
        GOOGLE_DRIVE_CLIENT_ID: 'id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
        AI_PROVIDERS: '',
        AI_FAKE_PROVIDER: 'true',
        AI_PRICES:
          '[{"model":"fake-model","from":"2026-01-01","inputPerMillion":2,"outputPerMillion":10}]',
      },
    })
    alex = await world.session('alex@example.org', 'Alex Martin')
    outsider = await world.session('zoe@research.example.com', 'Zoe Stone')
    const teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    const projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId })).json<{
      id: string
    }>().id
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call(
      alex,
      'GET',
      '/api/sources/google-drive/connect?returnTo=/&access=read',
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(alex, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
    drive.addFolder('folder-facts', 'folder-facts', undefined, 'Alex')
    for (const [id, text] of Object.entries(TEXTS)) {
      drive.addFile(id, `${id}.txt`, 'folder-facts', 'text/plain')
      drive.texts.set(id, text)
    }
    drive.share('folder-facts', 'alex@drive.example')
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Facts',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: 'folder-facts' })
    await world.runJobs()
    const sessions = (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: { id: string; version: number }[]
    }>().sessions
    for (const s of sessions) {
      // The interview's people, as the Fieldwork analysis gives them (spec 009).
      const edited = await call(alex, 'PATCH', `/api/sessions/${s.id}`, {
        version: s.version,
        roster: [
          { name: 'Sam Example', role: 'interviewee' },
          { name: 'Alex Martin', role: 'interviewer' },
        ],
      })
      await call(alex, 'POST', `/api/sessions/${s.id}/decision`, {
        decision: 'validate',
        version: edited.json<{ version: number }>().version,
      })
    }
  })

  afterAll(async () => {
    await world?.close()
  })

  it('imports the transcript, finds verbatims and facts, with no known name sent (SC-001–SC-004)', async () => {
    expect(
      (
        await call(alex, 'POST', `/api/studies/${studyId}/facts-runs`, {
          all: false,
          consent: false,
        })
      ).json<{ code: string }>().code,
    ).toBe('FACTS_CONSENT_REQUIRED')
    sent.length = 0
    const started = await call(alex, 'POST', `/api/studies/${studyId}/facts-runs`, {
      all: false,
      consent: true,
    })
    expect(started.statusCode).toBe(202)
    // A reading waits for the analysis (FR-012).
    expect(
      (await call(alex, 'POST', `/api/studies/${studyId}/lexicon-runs`, { consent: true })).json<{
        code: string
      }>().code,
    ).toBe('ENRICHMENT_RUNNING')
    await world.runJobs()
    const view = await overview()
    const [one] = view.interviews
    if (!one) throw new Error('no interview')
    expect(one).toMatchObject({ state: 'to-decide', verbatims: 2, facts: { toDecide: 1 } })
    expect(view.run).toMatchObject({ finished: true, leftOut: { verbatims: 2, facts: 2 } })
    expect(one.cost).toBeGreaterThan(0)
    expect(view.cost).toBe(one.cost)
    const request = sent.join('\n')
    expect(request).not.toMatch(/Sam Example|Alex Martin|Sam|Alex/)
    expect(request).toContain('[Person')
    const detail = (
      await call(alex, 'GET', `/api/studies/${studyId}/facts-analysis/${one.sessionId}`)
    ).json<Interview>()
    expect(detail.verbatims.map((v) => v.text)).toEqual([
      'I never find the data of my team quickly.',
      'The newsletter helps me every single week.',
    ])
    expect(detail.turns?.map((t) => t.role)).toEqual([
      'interviewer',
      'interviewee',
      'interviewer',
      'interviewee',
    ])
  })

  it('decides, edits with a translation, and keeps a rejected fact out of a new reading', async () => {
    const [one] = (await overview()).interviews
    if (!one) throw new Error('no interview')
    const url = `/api/studies/${studyId}/facts-analysis/${one.sessionId}`
    let detail = (await call(alex, 'GET', url)).json<Interview>()
    const [fact] = detail.facts
    if (!fact) throw new Error('no fact')
    expect(
      (
        await call(alex, 'PATCH', `/api/studies/${studyId}/facts/${fact.id}`, {
          decision: 'edit',
          version: fact.version,
          statement: { fr: 'Les données sont dures à trouver' },
        })
      ).statusCode,
    ).toBe(204)
    await world.runJobs()
    detail = (await call(alex, 'GET', url)).json<Interview>()
    expect(detail.facts[0]).toMatchObject({
      status: 'edited',
      translation: 'done',
      statement: { en: 'EN: Les données sont dures à trouver' },
    })
    // A person's verbatim and fact.
    const turn = detail.turns?.[3]
    if (!turn) throw new Error('no turn')
    const added = await call(alex, 'POST', `${url}/verbatims`, {
      segmentId: turn.id,
      offset: 0,
      length: turn.text.length,
    })
    expect(added.statusCode).toBe(201)
    const verbatimId = added.json<{ id: string }>().id
    const created = await call(alex, 'POST', `/api/studies/${studyId}/facts`, {
      sessionId: one.sessionId,
      statement: { en: 'The newsletter is useful', fr: 'La lettre est utile' },
      polarity: 'positive',
      themeId: null,
      verbatims: [verbatimId],
    })
    expect(created.statusCode).toBe(201)
    const page = (await call(alex, 'GET', `/api/studies/${studyId}/facts?status=accepted`)).json<{
      facts: FactView[]
      total: number
    }>()
    expect(page.total).toBe(2)
    // Rejected, then read again: not proposed again (SC-008).
    const edited = detail.facts[0]
    if (!edited) throw new Error('no fact')
    await call(alex, 'PATCH', `/api/studies/${studyId}/facts/${edited.id}`, {
      decision: 'reject',
      version: edited.version,
    })
    await call(alex, 'POST', `/api/studies/${studyId}/facts-runs`, {
      all: true,
      consent: false,
      sessionIds: [one.sessionId],
    })
    await world.runJobs()
    const again = (await call(alex, 'GET', url)).json<Interview>()
    expect(again.facts.map((f) => f.status).sort()).toEqual(['accepted', 'rejected'])
  })

  it('refuses a person without access to the study (FR-019)', async () => {
    for (const [method, url] of [
      ['GET', `/api/studies/${studyId}/facts-analysis`],
      ['GET', `/api/studies/${studyId}/facts`],
      ['POST', `/api/studies/${studyId}/facts-runs`],
    ] as const)
      expect(
        (
          await call(
            outsider,
            method,
            url,
            method === 'POST' ? { all: true, consent: true } : undefined,
          )
        ).statusCode,
      ).toBe(404)
  })
})
