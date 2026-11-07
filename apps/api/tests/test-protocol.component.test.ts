import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-usability'

const content = (
  instruction = 'Send this report to your manager so that they read it on Monday',
) => ({
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: [],
    participants: 'Analysts',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: {
    introduction: 'Thank you.',
    thinkAloud: 'Please think aloud.',
    warmUp: [],
    debrief: ['What was hardest?'],
    closing: 'Thank you.',
  },
  scenario: 'You prepare the weekly review.',
  tasks: [{ instruction, criterion: 'The report is sent', startUrl: null, minutes: null }],
  questionnaire: 'sus-v1',
  easeQuestion: 'seq-v1',
})

describe('Usability test preparation (spec 036)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let robin: Who
  let testId: string
  let surveyId: string
  let projectId: string

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

  const consent = async (who: Who, account: string, access: 'read' | 'write') => {
    drive.nextConsentAccount = account
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?access=${access}&returnTo=/studies/${testId}`,
    )
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=ok`)
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Study folder', undefined, 'Alex')
    drive.share(FOLDER, 'alex@drive.example')
    world = await startWorld({
      drive,
      config: { GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret' },
    })
    alex = await world.session('alex@example.org')
    robin = await world.session('robin@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'Reports', goal: 'Goal', teamId: team })
    ).json().id
    const make = async (name: string, type: string) =>
      (await call(alex, 'POST', `/api/projects/${projectId}/studies`, { name, type })).json().id
    testId = await make('A usability test', 'usability-test')
    surveyId = await make('A survey', 'survey')
  })
  afterAll(async () => {
    await world?.close()
  })

  it('has no protocol at first, and refuses one on another type', async () => {
    const first = await call(alex, 'GET', `/api/studies/${testId}/protocol`)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toBeNull()
    const other = await call(alex, 'GET', `/api/studies/${surveyId}/protocol`)
    expect(other.json().code).toBe('NOT_A_USABILITY_TEST_STUDY')
  })

  it('keeps the interview and survey commands refused on a usability test study', async () => {
    expect((await call(alex, 'GET', `/api/studies/${testId}/guide`)).json().code).toBe(
      'NOT_AN_INTERVIEW_STUDY',
    )
    expect((await call(alex, 'GET', `/api/studies/${testId}/planned-interviews`)).json().code).toBe(
      'NOT_AN_INTERVIEW_STUDY',
    )
    expect((await call(alex, 'GET', `/api/studies/${testId}/questionnaire`)).json().code).toBe(
      'NOT_A_SURVEY_STUDY',
    )
  })

  it('saves it, reads it back with its checks, planned length and standard texts, refuses a stale version', async () => {
    const url = `/api/studies/${testId}/protocol`
    const saved = await call(alex, 'PUT', url, { content: content(), version: null })
    expect(saved.json()).toEqual({ version: 0 })
    const read = (await call(alex, 'GET', url)).json()
    expect(read).toMatchObject({
      version: 0,
      origin: 'person',
      plannedMinutes: 5 + 15 + 3 + 1,
      checks: { whole: [] },
      updatedBy: { name: expect.any(String) },
    })
    expect(read.content.tasks[0].id).toBeTruthy()
    expect(read.standard.sus.items).toHaveLength(10)
    expect(read.standard.seq.scale.points).toBe(7)
    const stale = await call(alex, 'PUT', url, { content: content(), version: 5 })
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    const invalid = await call(alex, 'PUT', url, {
      content: {
        ...content(),
        framing: {
          ...content().framing,
          interface: { url: 'nope', kind: 'prototype', description: null },
        },
      },
      version: 0,
    })
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('keeps the task id when the instruction is reworded with its id', async () => {
    const url = `/api/studies/${testId}/protocol`
    const before = (await call(alex, 'GET', url)).json()
    const id = before.content.tasks[0].id
    const body = content('Share this report with your manager so that they read it on Monday')
    body.tasks[0] = { ...body.tasks[0], id } as (typeof body.tasks)[0]
    await call(alex, 'PUT', url, { content: body, version: before.version })
    const after = (await call(alex, 'GET', url)).json()
    expect(after.content.tasks[0].id).toBe(id)
    expect(after.version).toBe(before.version + 1)
  })

  it('marks a check, and says when the protocol changed since', async () => {
    const url = `/api/studies/${testId}/protocol`
    const mark = await call(alex, 'PUT', `${url}/readiness/pilot`)
    expect(mark.statusCode).toBe(204)
    const marked = (await call(alex, 'GET', url)).json()
    expect(marked.readiness).toMatchObject([{ kind: 'pilot', changedSince: false }])
    await call(alex, 'PUT', url, {
      content: content('Find last week report so that you can read it again'),
      version: marked.version,
    })
    expect((await call(alex, 'GET', url)).json().readiness[0].changedSince).toBe(true)
    await call(alex, 'DELETE', `${url}/readiness/pilot`)
    expect((await call(alex, 'GET', url)).json().readiness).toEqual([])
  })

  it('lets a member outside the team read it, without names, and change nothing', async () => {
    const url = `/api/studies/${testId}/protocol`
    const read = await call(robin, 'GET', url)
    expect(read.statusCode).toBe(200)
    expect(read.json().updatedBy).toBeNull()
    const change = await call(robin, 'PUT', url, {
      content: content(),
      version: read.json().version,
    })
    expect(change.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('spec 037: one test session per video of the folder, with its length and protocol version', async () => {
    const video = (id: string, name: string, at: string, durationMs?: number) => {
      drive.addFile(id, name, FOLDER, 'video/mp4')
      const item = drive.items.get(id)
      if (item)
        drive.items.set(id, { ...item, modifiedTime: at, ...(durationMs ? { durationMs } : {}) })
    }
    video(
      'v-one',
      'Test one - 2026/11/03 10:00 CET - Recording.mp4',
      '2026-11-03T11:00:00Z',
      1_800_000,
    )
    video('v-two', 'Test two.mp4', '2026-11-04T11:00:00Z')
    drive.addFile('t-one', 'Test one - 2026/11/03 10:00 CET - Transcript', FOLDER, 'text/plain')
    drive.addFile('t-lost', 'Lost notes.txt', FOLDER, 'text/plain')
    await consent(alex, 'alex@drive.example', 'write')
    await call(alex, 'PUT', `/api/studies/${testId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}`,
    })
    await world.runJobs()
    const view = (await call(alex, 'GET', `/api/studies/${testId}/sessions`)).json()
    expect(view.kind).toBe('sessions')
    expect(view.sessions).toHaveLength(2)
    const one = view.sessions.find((s: { video: { fileId: string } }) => s.video.fileId === 'v-one')
    expect(one).toMatchObject({
      video: { durationMs: 1_800_000 },
      transcript: { fileId: 't-one' },
      readiness: 'not-validated',
      link: null,
    })
    expect(view.unclaimedTranscripts.map((f: { fileId: string }) => f.fileId)).toEqual(['t-lost'])
    // Three saves above, each kept as a version (FR-010).
    expect(view.protocolVersions.map((v: { version: number }) => v.version)).toEqual([1, 2, 3])
    const chosen = await call(alex, 'PUT', `/api/sessions/${one.id}/protocol-version`, {
      protocolVersion: 2,
      version: one.version,
    })
    expect(chosen.json().protocolVersion).toEqual({ version: 2, by: 'person' })
    const unknown = await call(alex, 'PUT', `/api/sessions/${one.id}/protocol-version`, {
      protocolVersion: 9,
      version: chosen.json().version,
    })
    expect(unknown.statusCode).toBe(422)
    expect(view.videoMinutes).toBe(30)
  })

  it('spec 037: a transcript moves to another open session without breaking the inventory', async () => {
    // The names now say the transcript belongs to the other video.
    const rename = (id: string, name: string) => {
      const item = drive.items.get(id)
      if (item) drive.items.set(id, { ...item, name })
    }
    rename('v-one', 'Other take.mp4')
    rename('v-two', 'Test one - 2026/11/03 10:00 CET - Recording.mp4')
    const two = drive.items.get('v-two')
    if (two) drive.items.set('v-two', { ...two, modifiedTime: '2026-11-03T11:00:00Z' })
    const refresh = await call(alex, 'POST', `/api/studies/${testId}/source/inventory`)
    expect(refresh.statusCode).toBeLessThan(300)
    await world.runJobs()
    const source = (await call(alex, 'GET', `/api/studies/${testId}/source`)).json()
    expect(source.source.inventory.status).toBe('done')
    const view = (await call(alex, 'GET', `/api/studies/${testId}/sessions`)).json()
    const byVideo = (id: string) =>
      view.sessions.find((s: { video: { fileId: string } }) => s.video.fileId === id)
    expect(byVideo('v-two').transcript?.fileId).toBe('t-one')
    expect(byVideo('v-one').transcript).toBeNull()
  })

  it('deletes it with the study', async () => {
    const { version } = (await call(alex, 'GET', `/api/studies/${testId}`)).json()
    const deleted = await call(alex, 'DELETE', `/api/studies/${testId}?version=${version}`)
    expect(deleted.statusCode).toBeLessThan(300)
    expect(
      (await call(alex, 'GET', `/api/studies/${testId}/protocol`)).statusCode,
    ).toBeGreaterThanOrEqual(400)
  })
})
