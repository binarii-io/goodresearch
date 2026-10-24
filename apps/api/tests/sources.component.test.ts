import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryDrive } from '../src/modules/ingestion/tests/fakes/in-memory-drive.ts'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }
const FOLDER = 'folder-interviews-q4'

describe('Google Drive source (spec 002 US2, US3)', () => {
  let world: World
  let drive: InMemoryDrive
  let alex: Who
  let sam: Who
  let admin: Who
  let studyId: string
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

  /** Runs the consent round trip through our connect and callback routes. */
  const connectDrive = async (who: Who, googleAccount: string) => {
    drive.nextConsentAccount = googleAccount
    const start = await call(
      who,
      'GET',
      `/api/sources/google-drive/connect?returnTo=/studies/${studyId}`,
    )
    expect(start.statusCode).toBe(302)
    const state = new URL(String(start.headers.location)).searchParams.get('state')
    const back = await call(
      who,
      'GET',
      `/api/sources/google-drive/callback?state=${state}&code=granted`,
    )
    expect(back.headers.location).toBe(`/studies/${studyId}?drive=connected`)
  }

  beforeAll(async () => {
    drive = new InMemoryDrive()
    drive.addFolder(FOLDER, 'Interviews Q4', undefined, 'Alex')
    for (let g = 0; g < 20; g++) {
      drive.addFolder(`group-${g}`, `Group ${g}`, FOLDER)
      for (let f = 0; f < 25; f++) drive.addFile(`file-${g}-${f}`, `call ${f}.mp4`, `group-${g}`)
    }
    drive.addFile('notes-1', 'notes.txt', FOLDER, 'text/plain')
    drive.share(FOLDER, 'alex@drive.example')
    world = await startWorld({
      drive,
      config: { GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret' },
    })
    admin = await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
    sam = await world.session('sam@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    await world.addMember(sam.id, team)
    projectId = (await call(alex, 'POST', '/api/projects', { name: 'P', teamId: team })).json<{
      id: string
    }>().id
    studyId = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'S',
        type: 'interviews',
      })
    ).json<{ id: string }>().id
  })

  afterAll(async () => {
    await world?.close()
  })

  it('needs a Drive connection to attach, then inventories 500 files in 20 groups (SC-002)', async () => {
    expect(
      (await call(alex, 'PUT', `/api/studies/${studyId}/source`, { link: FOLDER })).json(),
    ).toMatchObject({ code: 'DRIVE_NOT_CONNECTED' })
    await connectDrive(alex, 'alex@drive.example')
    expect((await call(alex, 'GET', '/api/me/sources')).json()).toMatchObject([
      { status: 'connected', externalAccount: 'alex@drive.example' },
    ])
    const attached = await call(alex, 'PUT', `/api/studies/${studyId}/source`, {
      link: `https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`,
    })
    expect(attached.statusCode).toBe(202)
    const started = Date.now()
    await world.runJobs()
    expect(Date.now() - started).toBeLessThan(60_000)
    const view = (await call(alex, 'GET', `/api/studies/${studyId}/source`)).json()
    expect(view).toMatchObject({
      access: 'full',
      source: {
        folderName: 'Interviews Q4',
        ownerName: 'Alex',
        inventory: { status: 'done', totals: { byKind: { media: 500, transcript: 1, other: 0 } } },
      },
    })
    expect(view.source.inventory.totals.byGroup).toHaveLength(21)
    const media = (
      await call(alex, 'GET', `/api/studies/${studyId}/source/files?kind=media&group=Group%203`)
    ).json<unknown[]>()
    expect(media).toHaveLength(25)
  })

  it('SC-008: a team member without access to the folder sees no file name and cannot act', async () => {
    expect((await call(sam, 'GET', `/api/studies/${studyId}/source`)).json()).toMatchObject({
      access: 'drive-not-connected',
      source: null,
    })
    await connectDrive(sam, 'sam@drive.example')
    const view = await call(sam, 'GET', `/api/studies/${studyId}/source`)
    expect(view.json()).toMatchObject({
      access: 'no-folder-access',
      folderOwner: 'Alex',
      source: null,
    })
    expect(view.body).not.toContain('call 1.mp4')
    expect((await call(sam, 'GET', `/api/studies/${studyId}/source/files`)).json()).toMatchObject({
      code: 'FOLDER_ACCESS_REQUIRED',
    })
    expect(
      (await call(sam, 'POST', `/api/studies/${studyId}/source/inventory`)).json(),
    ).toMatchObject({ code: 'FOLDER_ACCESS_REQUIRED' })
    expect(
      (await call(sam, 'PUT', `/api/studies/${studyId}/name`, { name: 'X', version: 0 })).json(),
    ).toMatchObject({
      code: 'FOLDER_ACCESS_REQUIRED',
    })
    expect((await call(sam, 'GET', `/api/studies/${studyId}`)).statusCode).toBe(200)
    // The project's study list does not show the folder name either (FR-010a).
    expect((await call(sam, 'GET', `/api/projects/${projectId}/studies`)).json()).toMatchObject([
      { hasFolder: true, folderName: null },
    ])
    expect((await call(alex, 'GET', `/api/projects/${projectId}/studies`)).json()).toMatchObject([
      { hasFolder: true, folderName: 'Interviews Q4' },
    ])
  })

  it('refreshes with the requester own permission and shows new files', async () => {
    drive.addFile('late-1', 'late.mp4', FOLDER)
    expect((await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)).statusCode).toBe(
      202,
    )
    await world.runJobs()
    const view = (await call(alex, 'GET', `/api/studies/${studyId}/source`)).json()
    expect(view.source.inventory).toMatchObject({
      status: 'done',
      runBy: { id: alex.id },
      totals: { byKind: { media: 501 } },
    })
  })

  it('SC-007: disconnecting revokes the permission and later actions ask to reconnect', async () => {
    expect((await call(alex, 'DELETE', '/api/me/sources/google-drive')).statusCode).toBe(204)
    expect(drive.revoked).toHaveLength(1)
    expect((await call(alex, 'GET', '/api/me/sources')).json()).toMatchObject([{ status: 'none' }])
    expect(
      (await call(alex, 'POST', `/api/studies/${studyId}/source/inventory`)).json(),
    ).toMatchObject({ code: 'DRIVE_NOT_CONNECTED' })
  })

  it('lets an admin without folder access detach the folder (FR-010b)', async () => {
    expect((await call(admin, 'DELETE', `/api/studies/${studyId}/source`)).statusCode).toBe(204)
    expect((await call(alex, 'GET', `/api/studies/${studyId}/source`)).json()).toMatchObject({
      access: 'full',
      source: null,
    })
  })
})
