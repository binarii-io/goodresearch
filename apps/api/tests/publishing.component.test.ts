import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-study'

describe('Drive publishing (spec 007)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let sam: Who
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

  const consent = async (who: Who, account: string, access: 'read' | 'write') => {
    drive.nextConsentAccount = account
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?access=${access}&returnTo=/studies/${studyId}`,
    )
    const url = new URL(String(start.headers.location))
    const state = url.searchParams.get('state')
    const back = await call(who, 'GET', `/api/sources/google-drive/callback?state=${state}&code=ok`)
    expect(back.headers.location).toBe(`/studies/${studyId}?drive=connected`)
  }

  const publications = async (who: Who) =>
    (await call(who, 'GET', `/api/studies/${studyId}/publications`)).json() as {
      id: string
      kind: string
      state: string
      counts: { fromDrive: number }
    }[]

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Study folder', undefined, 'Alex')
    drive.share(FOLDER, 'alex@drive.example')
    drive.share(FOLDER, 'sam@drive.example')
    world = await startWorld({
      drive,
      config: { GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret' },
    })
    alex = await world.session('alex@example.org')
    sam = await world.session('sam@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    await world.addMember(sam.id, team)
    const projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'P', goal: '', teamId: team })
    ).json().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Interviews',
        type: 'interviews',
      })
    ).json().id
    await call(alex, 'PUT', `/api/studies/${studyId}/guide`, {
      version: null,
      content: {
        framing: { objectives: 'Goal', hypotheses: [], audience: '', format: '' },
        sections: [
          {
            kind: 'theme',
            title: 'Planning',
            minutes: 30,
            questions: [{ text: 'Tell me about last week.', followUps: [] }],
          },
        ],
      },
    })
    await call(alex, 'POST', `/api/studies/${studyId}/planned-interviews`, { interviewee: 'Lee' })
  })
  afterAll(async () => {
    await world?.close()
  })

  it('needs a folder, then the write consent, then publishes the three files', async () => {
    await consent(alex, 'alex@drive.example', 'read')
    const body = {
      kinds: ['guide', 'best-practices', 'schedule'],
      language: 'en',
      timeZone: 'Europe/Paris',
    }
    expect(
      (await call(alex, 'POST', `/api/studies/${studyId}/publications`, body)).json().code,
    ).toBe('NO_SOURCE_FOLDER')
    await call(alex, 'PUT', `/api/studies/${studyId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}`,
    })
    const refused = await call(alex, 'POST', `/api/studies/${studyId}/publications`, body)
    expect(refused.statusCode).toBe(409)
    expect(refused.json().code).toBe('DRIVE_WRITE_REQUIRED')
    await consent(alex, 'alex@drive.example', 'write')
    expect(drive.consents).toEqual(['read', 'write'])
    expect((await call(alex, 'GET', '/api/me/sources')).json()[0]).toMatchObject({ canWrite: true })
    const published = await call(alex, 'POST', `/api/studies/${studyId}/publications`, body)
    expect(published.statusCode).toBe(201)
    expect(published.json().map((p: { kind: string; state: string }) => [p.kind, p.state])).toEqual(
      expect.arrayContaining([
        ['guide', 'in-sync'],
        ['best-practices', 'in-sync'],
        ['schedule', 'in-sync'],
      ]),
    )
    expect(drive.documents.files.size).toBe(3)
  })

  it('brings a Drive edit back for review, shared by the team, decided once', async () => {
    const guide = (await publications(alex)).find((p) => p.kind === 'guide')
    const fileId =
      [...drive.documents.files.values()].find((f) => f.name.endsWith('Interview guide'))?.id ?? ''
    drive.documents.edit(fileId, 'Lee in Drive', {
      doc: (d) => ({
        blocks: d.blocks.map((b) =>
          b.text === 'Tell me about last week.' ? { ...b, text: 'Walk me through last week.' } : b,
        ),
      }),
    })
    // Sam has not connected Drive yet: the folder (and so the publication) is out of reach.
    expect((await call(sam, 'POST', `/api/publications/${guide?.id}/check`)).json().code).toBe(
      'DRIVE_NOT_CONNECTED',
    )
    await consent(sam, 'sam@drive.example', 'read')
    const checked = (await call(sam, 'POST', `/api/publications/${guide?.id}/check`)).json()
    expect(checked).toMatchObject({
      state: 'changed-in-drive',
      counts: { fromDrive: 1 },
      lastEditor: 'Lee in Drive',
      access: { canEdit: true },
    })
    const changes = (await call(alex, 'GET', `/api/publications/${guide?.id}/changes`)).json()
    expect(changes).toEqual([
      expect.objectContaining({
        kind: 'changed',
        decision: 'pending',
        key: expect.stringMatching(/^question:/),
      }),
    ])
    const decision = { decisions: [{ changeId: changes[0].id, decision: 'accept' }] }
    expect(
      (await call(sam, 'POST', `/api/publications/${guide?.id}/decisions`, decision)).json(),
    ).toEqual({
      applied: 1,
      rejected: 0,
      alreadyDecided: 0,
    })
    expect(
      (await call(alex, 'POST', `/api/publications/${guide?.id}/decisions`, decision)).json(),
    ).toMatchObject({
      alreadyDecided: 1,
    })
    const saved = (await call(alex, 'GET', `/api/studies/${studyId}/guide`)).json()
    expect(saved).toMatchObject({ origin: 'drive', version: 1 })
    expect(saved.content.sections[0].questions[0].text).toBe('Walk me through last week.')
  })

  it('updates in place after app changes, refused for a viewer and over pending changes', async () => {
    const schedule = (await publications(alex)).find((p) => p.kind === 'schedule')
    await call(alex, 'POST', `/api/studies/${studyId}/planned-interviews`, { interviewee: 'Kim' })
    expect((await call(alex, 'POST', `/api/publications/${schedule?.id}/check`)).json().state).toBe(
      'out-of-date',
    )
    // Sam has only read access to Drive: updating needs the write consent.
    expect(
      (await call(sam, 'POST', `/api/publications/${schedule?.id}/update`, {})).json().code,
    ).toBe('DRIVE_WRITE_REQUIRED')
    const updated = await call(alex, 'POST', `/api/publications/${schedule?.id}/update`, {})
    expect(updated.json()).toMatchObject({ state: 'in-sync' })
    const sheet = [...drive.documents.files.values()].find((f) => f.table)
    expect(sheet?.table?.rows.map((r) => r.cells.interviewee)).toEqual(['Lee', 'Kim'])
    drive.documents.edit(sheet?.id ?? '', 'x', {
      table: (t) => ({
        ...t,
        rows: t.rows.map((r) => ({ ...r, cells: { ...r.cells, notes: 'Called' } })),
      }),
    })
    await call(alex, 'POST', `/api/publications/${schedule?.id}/check`)
    const pending = await call(alex, 'POST', `/api/publications/${schedule?.id}/update`, {})
    expect(pending.json().code).toBe('DRIVE_CHANGES_PENDING')
    expect(
      (
        await call(alex, 'POST', `/api/publications/${schedule?.id}/update`, {
          replaceDriveChanges: true,
        })
      ).json(),
    ).toMatchObject({ state: 'in-sync' })
  })

  it('forgets a publication without touching Drive, and deletes them with the study', async () => {
    const practices = (await publications(alex)).find((p) => p.kind === 'best-practices')
    expect((await call(alex, 'DELETE', `/api/publications/${practices?.id}`)).statusCode).toBe(204)
    expect(drive.documents.files.size).toBe(3)
    expect((await publications(alex)).map((p) => p.kind).sort()).toEqual(['guide', 'schedule'])
    await call(alex, 'DELETE', `/api/studies/${studyId}`)
    expect(drive.documents.files.size).toBe(3)
  })
})
