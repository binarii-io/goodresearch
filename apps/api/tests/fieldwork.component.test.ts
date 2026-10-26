import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModelRunner } from '../src/modules/ai-gateway/application/ports.ts'
import { createFakeRunner } from '../src/modules/ai-gateway/infrastructure/fake.model-runner.ts'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
type SessionView = {
  id: string
  version: number
  state: string
  transcript: { name: string } | null
  noTranscript: boolean
  media: { fileId: string }[]
  suggestion: { plannedInterviewId: string; rule: string } | null
  link: { plannedInterviewId: string } | null
  roster: { name: string; role: string }[]
}
const FOLDER = 'folder-fieldwork'

describe('Fieldwork sessions on PostgreSQL (spec 008)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let studyId: string
  let plannedId: string
  /** Every request sent to the AI provider, to check what leaves the app (SC-005). */
  const sent: string[] = []
  const fake = createFakeRunner()
  const runner: ModelRunner = {
    generateText: (c, m, r, t) => {
      sent.push(JSON.stringify(r))
      return fake.generateText(c, m, r, t)
    },
    generateObject: (c, m, r, t) => {
      sent.push(JSON.stringify(r))
      return fake.generateObject(c, m, r, t)
    },
    stream: (c, m, r, t) => {
      sent.push(JSON.stringify(r))
      return fake.stream(c, m, r, t)
    },
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

  const fieldwork = async () =>
    (await call(alex, 'GET', `/api/studies/${studyId}/sessions`)).json<{
      sessions: SessionView[]
      totals: Record<string, number>
      plannedWithoutSession: { id: string }[]
    }>()

  const file = (id: string, name: string, at: string, mime: string) => {
    drive.addFile(id, name, FOLDER, mime)
    const item = drive.items.get(id)
    if (item) drive.items.set(id, { ...item, modifiedTime: at })
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Fieldwork', undefined, 'Alex')
    file('t-sam', 'Interview Sam Example.txt', '2026-10-20T10:00:00Z', 'text/plain')
    file('m-sam', 'recording.mp4', '2026-10-20T10:00:30Z', 'video/mp4')
    file('t-test', 'Test call.txt', '2026-10-19T10:00:00Z', 'text/plain')
    drive.share(FOLDER, 'alex@drive.example')
    world = await startWorld({
      drive,
      runner,
      config: {
        GOOGLE_DRIVE_CLIENT_ID: 'id',
        GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
        AI_PROVIDERS: '',
        AI_FAKE_PROVIDER: 'true',
      },
    })
    alex = await world.session('alex@example.org')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    const projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'P', teamId: team })
    ).json<{
      id: string
    }>().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'S',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
    drive.nextConsentAccount = 'alex@drive.example'
    const start = await call(alex, 'GET', `/api/sources/google-drive/connect?returnTo=/`)
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(alex, 'GET', `/api/sources/google-drive/callback?state=${state}&code=granted`)
    plannedId = (
      await call(alex, 'POST', `/api/studies/${studyId}/planned-interviews`, {
        interviewee: 'Sam Example',
        role: '',
        interviewers: 'Ana',
        scheduledAt: '2026-10-20T09:00:00Z',
        status: 'scheduled',
        notes: '',
      })
    ).json<{ id: string }>().id
    expect(
      (await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: FOLDER })).statusCode,
    ).toBe(202)
    await world.runJobs()
  })

  afterAll(async () => {
    await world?.close()
  })

  it('proposes the interviews of the inventory with their recordings and suggestions', async () => {
    const view = await fieldwork()
    // Both have their transcript: validated by the app (FR-002c).
    expect(view.totals).toEqual({ proposed: 2, validated: 0, excluded: 0 })
    const sam = view.sessions[0]
    expect(sam?.transcript?.name).toBe('Interview Sam Example.txt')
    expect(sam?.media.map((m) => m.fileId)).toEqual(['m-sam'])
    expect(sam?.suggestion).toMatchObject({ plannedInterviewId: plannedId, rule: 'name' })
  })

  it('links, validates, and keeps decisions through a refresh', async () => {
    const [sam, test] = (await fieldwork()).sessions
    if (!sam || !test) throw new Error('fixture')
    const linked = await call(alex, 'POST', `/api/sessions/${sam.id}/link`, {
      plannedInterviewId: plannedId,
      version: sam.version,
      confirmSuggestion: true,
    })
    expect(linked.statusCode).toBe(200)
    const after = linked.json<SessionView>()
    expect(after.roster.map((r) => r.name)).toEqual(['Sam Example', 'Ana'])
    // The second session cannot take the same planned interview (unique per study).
    expect(
      (
        await call(alex, 'POST', `/api/sessions/${test.id}/link`, {
          plannedInterviewId: plannedId,
          version: test.version,
        })
      ).json(),
    ).toMatchObject({ code: 'PLANNED_INTERVIEW_LINKED' })
    const validated = await call(alex, 'POST', `/api/sessions/${sam.id}/decision`, {
      decision: 'validate',
      version: after.version,
    })
    expect(validated.json<SessionView>().state).toBe('validated')
    expect(
      (
        await call(alex, 'POST', `/api/sessions/${sam.id}/decision`, {
          decision: 'exclude',
          version: after.version,
        })
      ).json(),
    ).toMatchObject({ code: 'VERSION_CONFLICT' })
    await call(alex, 'POST', `/api/sessions/${test.id}/decision`, {
      decision: 'exclude',
      reason: 'A test',
      version: test.version,
    })
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const view = await fieldwork()
    expect(view.totals).toEqual({ proposed: 0, validated: 1, excluded: 1 })
    expect(view.plannedWithoutSession).toEqual([])
  })

  it('SC-005: no name of the schedule or of the people of an interview reaches the AI provider', async () => {
    await call(alex, 'PUT', '/api/ai-provider/api-key', { provider: 'fake', apiKey: 'test-ok-key' })
    const conversationId = (await call(alex, 'POST', '/api/assistant/conversations')).json<{
      id: string
    }>().id
    const answered = await call(
      alex,
      'POST',
      `/api/assistant/conversations/${conversationId}/messages`,
      {
        text: 'hello',
        page: { kind: 'study', id: studyId, phase: 'fieldwork' },
        language: 'en',
      },
    )
    expect(answered.statusCode).toBe(200)
    expect(sent.length).toBeGreaterThan(0)
    for (const request of sent) {
      expect(request).not.toContain('Sam Example')
      expect(request).not.toContain('Ana')
      expect(request).not.toContain('Interview Sam Example.txt')
    }
  })

  it('a recording goes to one interview even when two people add it at once (FR-004)', async () => {
    file('t-eve', 'Interview Eve.txt', '2026-10-24T10:00:00Z', 'text/plain')
    file('t-kim', 'Interview Kim.txt', '2026-10-25T10:00:00Z', 'text/plain')
    file('m-free', 'free recording.mp4', '2026-10-28T10:00:00Z', 'video/mp4')
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const proposed = (await fieldwork()).sessions.filter(
      (s) =>
        s.transcript?.name === 'Interview Eve.txt' || s.transcript?.name === 'Interview Kim.txt',
    )
    expect(proposed).toHaveLength(2)
    const answers = await Promise.all(
      proposed.map((s) =>
        call(alex, 'PATCH', `/api/sessions/${s.id}`, { version: s.version, media: ['m-free'] }),
      ),
    )
    expect(answers.map((a) => a.statusCode).sort()).toEqual([200, 422])
  })

  it('a new transcript becomes an interview at the next refresh', async () => {
    file('t-new', 'Interview Dana.txt', '2026-10-22T10:00:00Z', 'text/plain')
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const view = await fieldwork()
    expect(view.totals).toEqual({ proposed: 3, validated: 1, excluded: 1 })
    expect(view.sessions.map((s) => s.transcript?.name)).toContain('Interview Dana.txt')
  })

  it('a recording that arrives later joins its interview; a deleted transcript takes its open interview', async () => {
    file(
      't-zoe',
      'Zoe - 2026/10/23 10:00 CEST - Notes',
      '2026-10-23T08:30:00Z',
      'application/vnd.google-apps.document',
    )
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    file('m-zoe', 'Zoe - 2026/10/23 10:00 CEST - Recording', '2026-10-24T07:00:00Z', 'video/mp4')
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    let zoe = (await fieldwork()).sessions.find((s) => s.transcript?.name.startsWith('Zoe'))
    expect(zoe?.media.map((m) => m.fileId)).toEqual(['m-zoe'])
    drive.items.delete('t-zoe')
    await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)
    await world.runJobs()
    const sessions = (await fieldwork()).sessions
    zoe = sessions.find((s) => s.transcript?.name.startsWith('Zoe'))
    expect(zoe).toBeUndefined()
    // Its recording is alone again: a row without transcript.
    expect(sessions.find((s) => s.noTranscript && s.media[0]?.fileId === 'm-zoe')).toBeDefined()
  })

  it('replacing the folder discards the sessions', async () => {
    drive.addFolder('folder-empty', 'Empty', undefined, 'Alex')
    drive.share('folder-empty', 'alex@drive.example')
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: 'folder-empty' })
    await world.runJobs()
    expect((await fieldwork()).sessions).toEqual([])
  })
})
