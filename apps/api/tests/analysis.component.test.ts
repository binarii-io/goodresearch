import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type Proposal = { field: string; text: string | null; people: { name: string }[] | null }
type SessionView = {
  id: string
  version: number
  title: string | null
  transcript: { name: string } | null
  media: { fileId: string }[]
  roster: { name: string; role: string }[]
  cost: number | null
  fileNames: { inSync: boolean; differing: number } | null
  analysis: {
    state: string
    usedAi: boolean
    proposals: Proposal[]
  } | null
}
type FieldworkView = {
  sessions: SessionView[]
  analysisCost: number | null
  run: { total: number } | null
  consentNeeded: boolean
}
const FOLDER = 'folder-analysis'

const HEADER = [
  'Transcript',
  '21 October 2026',
  'Participants: Sam Example, Alex Martin',
  'Alex Martin: Thanks for joining. So what do you think about the way you plan the week?',
].join('\n')

const SPEAKERS = [
  'Robin Sample: Hello and thanks for being here today, shall we start with your role?',
  'Casey Test: Sure, I coordinate the volunteers, Alex Martin knows the team well.',
].join('\n')

describe('Analyzing the interviews on PostgreSQL (spec 009)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let zoe: Who
  let studyId: string
  /** Every request sent to the AI provider, to check what leaves the app (SC-003). */
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

  const fieldwork = async (who = alex) =>
    (await call(who, 'GET', `/api/studies/${studyId}/sessions`)).json<FieldworkView>()

  const sessionNamed = async (name: string) => {
    const s = (await fieldwork()).sessions.find((x) => x.transcript?.name === name)
    if (!s) throw new Error(`no session ${name}`)
    return s
  }

  const file = (id: string, name: string, at: string, mime: string, text?: string) => {
    drive.addFile(id, name, FOLDER, mime)
    const item = drive.items.get(id)
    if (item) drive.items.set(id, { ...item, modifiedTime: at })
    if (text) drive.texts.set(id, text)
  }

  const connectDrive = async (who: Who, account: string, access: 'read' | 'write') => {
    drive.nextConsentAccount = account
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?returnTo=/&access=${access}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Analysis', undefined, 'Alex')
    file('t-sam', 'Interview Sam Example.txt', '2026-10-21T10:00:00Z', 'text/plain', HEADER)
    file('m-sam', 'Interview Sam Example.mp4', '2026-10-21T10:00:20Z', 'video/mp4')
    file('t-two', 'Second interview.txt', '2026-10-22T15:00:00Z', 'text/plain', SPEAKERS)
    file('t-three', 'Third interview.txt', '2026-10-23T15:00:00Z', 'text/plain', SPEAKERS)
    drive.share(FOLDER, 'alex@drive.example')
    drive.share(FOLDER, 'zoe@drive.example')
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
    zoe = await world.session('zoe@research.example.com', 'Zoe Stone')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    await world.addMember(zoe.id, team)
    for (const who of [alex, zoe])
      await call(who, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-k' })
    const projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'P', teamId: team })
    ).json<{ id: string }>().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'S',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    await connectDrive(alex, 'alex@drive.example', 'write')
    await connectDrive(zoe, 'zoe@drive.example', 'read')
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: FOLDER })
    await world.runJobs()
  })

  afterAll(async () => {
    await world?.close()
  })

  it('a meeting tool header is analyzed by the rules alone, at no cost (SC-005)', async () => {
    const sam = await sessionNamed('Interview Sam Example.txt')
    const res = await call(alex, 'POST', `/api/sessions/${sam.id}/analysis`, { consent: true })
    expect(res.statusCode).toBe(200)
    const view = res.json<SessionView>()
    expect(view.analysis).toMatchObject({ state: 'done', usedAi: false })
    expect(view.analysis?.proposals.find((p) => p.field === 'name')?.text).toBe(
      '2026-10-21 – Sam Example – Alex Martin',
    )
    expect(view.cost).toBe(0)
    expect(sent).toEqual([])
  })

  it('asks the AI for the rest: quotes not in the text never show, costs come from the ledger (SC-001, SC-004)', async () => {
    const two = await sessionNamed('Second interview.txt')
    expect(
      (await call(zoe, 'POST', `/api/sessions/${two.id}/analysis`, {})).json<{ code: string }>()
        .code,
    ).toBe('ANALYSIS_CONSENT_REQUIRED')
    const res = await call(zoe, 'POST', `/api/sessions/${two.id}/analysis`, { consent: true })
    const view = res.json<SessionView>()
    const people = view.analysis?.proposals.find((p) => p.field === 'interviewees')?.people
    expect(people?.map((p) => p.name)).toEqual(['Casey Test'])
    // The fake provider's second interviewee has a quote absent from the text: dropped.
    expect(JSON.stringify(view)).not.toContain('Nobody Here')
    // 1,200 tokens in and 80 out at $2 and $10 per million.
    expect(view.cost).toBeCloseTo(0.0032, 6)
    // The cost is the team's: Alex sees what Zoe's analysis cost.
    const seen = await fieldwork(alex)
    expect(seen.analysisCost).toBeCloseTo(0.0032, 6)
    // No name of the schedule or of the team in the request (SC-003): only the text read.
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toContain('Zoe Stone')
  })

  it('under anonymisation, the names the app knows never reach the AI (SC-003)', async () => {
    const study = (await call(alex, 'GET', `/api/studies/${studyId}`)).json<{ version: number }>()
    expect(
      (
        await call(alex, 'PATCH', `/api/studies/${studyId}/settings`, {
          anonymised: true,
          version: study.version,
        })
      ).statusCode,
    ).toBe(200)
    const three = await sessionNamed('Third interview.txt')
    await call(alex, 'POST', `/api/sessions/${three.id}/analysis`, { consent: true })
    const request = sent.at(-1) ?? ''
    expect(request).not.toContain('Alex Martin')
    expect(request).toContain('[Person')
    const sam = await sessionNamed('Interview Sam Example.txt')
    const again = (
      await call(alex, 'POST', `/api/sessions/${sam.id}/analysis`, {})
    ).json<SessionView>()
    expect(again.analysis?.proposals.find((p) => p.field === 'name')?.text).toBe(
      '2026-10-21 – P01 – Alex Martin',
    )
    await call(alex, 'PATCH', `/api/studies/${studyId}/settings`, {
      anonymised: false,
      version: study.version + 1,
    })
  })

  it('accepts the proposals, renames the files, and a refresh keeps the interview (SC-006)', async () => {
    const sam = await sessionNamed('Interview Sam Example.txt')
    await call(alex, 'POST', `/api/sessions/${sam.id}/analysis`, {})
    const current = await sessionNamed('Interview Sam Example.txt')
    const accepted = await call(alex, 'POST', `/api/sessions/${sam.id}/proposals`, {
      version: current.version,
      decisions: ['interviewees', 'interviewers', 'date', 'name'].map((field) => ({
        field,
        action: 'accept',
      })),
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json<SessionView>().title).toBe('2026-10-21 – Sam Example – Alex Martin')
    expect(
      (await call(zoe, 'POST', `/api/sessions/${sam.id}/rename`, { fileIds: ['t-sam'] })).json<{
        code: string
      }>().code,
    ).toBe('DRIVE_WRITE_REQUIRED')
    const renamed = await call(alex, 'POST', `/api/sessions/${sam.id}/rename`, {
      fileIds: ['t-sam', 'm-sam'],
    })
    expect(renamed.json()).toEqual({
      results: [
        {
          fileId: 't-sam',
          outcome: 'renamed',
          name: '2026-10-21 – Sam Example – Alex Martin – Transcript.txt',
        },
        {
          fileId: 'm-sam',
          outcome: 'renamed',
          name: '2026-10-21 – Sam Example – Alex Martin – Video.mp4',
        },
      ],
    })
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const after = await sessionNamed('2026-10-21 – Sam Example – Alex Martin – Transcript.txt')
    expect(after.id).toBe(sam.id)
    expect(after.media.map((m) => m.fileId)).toEqual(['m-sam'])
    // FR-028: the names in Drive follow the accepted name…
    expect(after.fileNames).toEqual({ inSync: true, differing: 0 })
    // …until someone renames a file in Drive: the next refresh shows it.
    const video = drive.items.get('m-sam')
    if (video) drive.items.set('m-sam', { ...video, name: 'renamed by hand.mp4' })
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const drifted = await sessionNamed('2026-10-21 – Sam Example – Alex Martin – Transcript.txt')
    expect(drifted.fileNames).toEqual({ inSync: false, differing: 1 })
  })

  it('runs every analysis to do in the worker, one run per study (US2)', async () => {
    const estimate = (
      await call(alex, 'GET', `/api/studies/${studyId}/analysis-runs/estimate`)
    ).json<{ count: number }>()
    expect(estimate.count).toBeGreaterThan(0)
    const started = await call(alex, 'POST', `/api/studies/${studyId}/analysis-runs`, {
      consent: true,
    })
    expect(started.statusCode).toBe(202)
    expect((await call(zoe, 'POST', `/api/studies/${studyId}/analysis-runs`, {})).statusCode).toBe(
      409,
    )
    expect((await fieldwork()).run?.total).toBe(estimate.count)
    await world.runJobs()
    const done = await fieldwork()
    expect(done.run).toBeNull()
    expect(done.sessions.every((s) => s.analysis?.state === 'done')).toBe(true)
  })

  it('FR-022: the planned interview and its interview share who and when, both ways', async () => {
    const planned = (
      await call(alex, 'POST', `/api/studies/${studyId}/planned-interviews`, {
        interviewee: 'Casey Test',
        role: '',
        interviewers: 'Robin Sample',
        scheduledAt: '2026-10-22T09:00:00.000Z',
        status: 'scheduled',
        notes: '',
      })
    ).json<{ id: string }>()
    const two = await sessionNamed('Second interview.txt')
    await call(alex, 'POST', `/api/sessions/${two.id}/link`, {
      plannedInterviewId: planned.id,
      version: two.version,
    })
    // The schedule changes: the interview follows.
    const rows = (await call(alex, 'GET', `/api/studies/${studyId}/planned-interviews`)).json<
      { id: string; version: number }[]
    >()
    const row = rows.find((r) => r.id === planned.id)
    await call(alex, 'PUT', `/api/planned-interviews/${planned.id}`, {
      interviewee: 'Casey Tester',
      role: '',
      interviewers: 'Robin Sample',
      scheduledAt: '2026-10-23T09:00:00.000Z',
      status: 'done',
      notes: '',
      version: row?.version,
    })
    const followed = await sessionNamed('Second interview.txt')
    expect(followed.roster.find((r) => r.role === 'interviewee')?.name).toBe('Casey Tester')
    // The interview changes: the schedule follows.
    await call(alex, 'PATCH', `/api/sessions/${two.id}`, {
      version: followed.version,
      roster: [
        { name: 'Casey Test', role: 'interviewee' },
        { name: 'Robin Sample', role: 'interviewer' },
      ],
    })
    const after = (await call(alex, 'GET', `/api/studies/${studyId}/planned-interviews`)).json<
      { id: string; interviewee: string; status: string }[]
    >()
    expect(after.find((r) => r.id === planned.id)).toMatchObject({
      interviewee: 'Casey Test',
      status: 'done',
    })
  })
})
