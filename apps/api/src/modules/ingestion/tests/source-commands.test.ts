import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }
const admin = { id: 'admin', role: 'admin' as const }
const LINK = 'https://drive.google.com/drive/folders/folder-interviews'

describe('Drive connection and folder (US2)', () => {
  let world: InMemoryIngestion

  beforeEach(() => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-24T10:00:00Z')))
    world.studies.set('study-1', ['alice', 'bob', 'admin'])
    world.drive.addFolder('folder-interviews', 'Interviews Q4')
    world.drive.addFile('f1', 'call.mp4', 'folder-interviews')
    world.drive.share('folder-interviews', 'alice@example.org')
  })

  const connect = async (actor: { id: string }, googleAccount: string) => {
    world.drive.nextConsentAccount = googleAccount
    const started = await world.commands.startDriveConnection({
      actor,
      returnTo: '/studies/study-1',
    })
    if (!started.ok) throw new Error(started.error)
    const state = new URL(started.value.url).searchParams.get('state') ?? ''
    return world.commands.completeDriveConnection({ actor, state, code: 'code' })
  }

  it('stores the Drive permission encrypted, separate from sign-in', async () => {
    expect(await connect(alice, 'alice@example.org')).toEqual({
      ok: true,
      value: { returnTo: '/studies/study-1' },
    })
    const stored = world.store.connections.get('alice')
    expect(stored?.externalAccount).toBe('alice@example.org')
    expect(stored?.encryptedRefreshToken.startsWith('v2:')).toBe(true)
    expect(stored?.encryptedRefreshToken).not.toContain('token-')
  })

  it('refuses a callback whose state belongs to another person', async () => {
    const started = await world.commands.startDriveConnection({ actor: alice, returnTo: '/' })
    if (!started.ok) throw new Error('fixture')
    const state = new URL(started.value.url).searchParams.get('state') ?? ''
    expect(
      (await world.commands.completeDriveConnection({ actor: bob, state, code: 'code' })).ok,
    ).toBe(false)
  })

  it('attaches a folder by link and starts an inventory', async () => {
    expect(
      await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_NOT_CONNECTED',
    })
    await connect(alice, 'alice@example.org')
    expect(
      await world.commands.attachFolder({
        actor: alice,
        studyId: 'study-1',
        link: 'https://example.com',
      }),
    ).toEqual({
      ok: false,
      error: 'NOT_A_DRIVE_FOLDER_LINK',
    })
    expect(
      await world.commands.attachFolder({
        actor: alice,
        studyId: 'study-1',
        link: 'https://drive.google.com/drive/folders/unknown-folder',
      }),
    ).toEqual({ ok: false, error: 'FOLDER_NOT_FOUND' })
    expect(
      await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK }),
    ).toEqual({ ok: true, value: undefined })
    expect(world.store.sources.get('study-1')).toMatchObject({
      folderName: 'Interviews Q4',
      ownerName: 'Alice',
    })
    await world.runJobs()
    expect(world.store.files.get('study-1')?.map((f) => f.name)).toEqual(['call.mp4'])
  })

  it('spec 022: checks a folder without attaching or starting anything', async () => {
    const check = (link: string) =>
      world.commands.checkFolder({ actor: alice, studyId: 'study-1', link })
    expect(await check(LINK)).toEqual({ ok: false, error: 'DRIVE_NOT_CONNECTED' })
    await connect(alice, 'alice@example.org')
    expect(await check('https://example.com')).toEqual({
      ok: false,
      error: 'NOT_A_DRIVE_FOLDER_LINK',
    })
    expect(await check(`${LINK}-missing`)).toEqual({ ok: false, error: 'FOLDER_NOT_FOUND' })
    expect(await check(LINK)).toMatchObject({ ok: true, value: { folderName: 'Interviews Q4' } })
    expect(world.store.sources.size).toBe(0)
  })

  it('spec 022: onlyIfNone never replaces a folder, the form still can', async () => {
    await connect(alice, 'alice@example.org')
    world.drive.addFolder('folder-other', 'Other')
    world.drive.share('folder-other', 'alice@example.org')
    const other = 'https://drive.google.com/drive/folders/folder-other'
    const attach = (link: string, onlyIfNone: boolean) =>
      world.commands.attachFolder({ actor: alice, studyId: 'study-1', link, onlyIfNone })
    expect((await attach(LINK, true)).ok).toBe(true)
    expect(await attach(other, true)).toEqual({ ok: false, error: 'FOLDER_ALREADY_ATTACHED' })
    // Even when the check passed before someone else attached one: the store decides.
    const source = world.store.sources.get('study-1')
    if (!source) throw new Error('fixture')
    expect(await world.store.attachNewSource(source)).toBe(false)
    expect(
      await world.commands.checkFolder({ actor: alice, studyId: 'study-1', link: other }),
    ).toEqual({ ok: false, error: 'FOLDER_ALREADY_ATTACHED' })
    expect(world.store.sources.get('study-1')?.folderName).toBe('Interviews Q4')
  })

  it('spec 022: gives the assistant counts by kind, and nothing without access', async () => {
    await connect(alice, 'alice@example.org')
    expect(await world.queries.folderState(alice, 'study-1')).toBeNull()
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK })
    const state = await world.queries.folderState(alice, 'study-1')
    expect(state).toMatchObject({ name: 'Interviews Q4' })
    expect(Object.keys(state ?? {}).sort()).toEqual(['byKind', 'name', 'status'])
    expect(JSON.stringify(state)).not.toContain('call.mp4')
    await connect(bob, 'bob@example.org')
    expect(await world.queries.folderState(bob, 'study-1')).toBeNull()
  })

  it('hides studies outside the project team', async () => {
    expect(
      await world.commands.attachFolder({
        actor: { id: 'stranger', role: 'member' },
        studyId: 'study-1',
        link: LINK,
      }),
    ).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
  })

  it('checks each person own folder access; no file name without it (SC-008)', async () => {
    await connect(alice, 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK })
    await world.runJobs()

    expect((await world.queries.studySource(bob, 'study-1'))?.access).toBe('drive-not-connected')
    await connect(bob, 'bob@example.org')
    const bobView = await world.queries.studySource(bob, 'study-1')
    expect(bobView).toMatchObject({ access: 'no-folder-access', folderOwner: 'Alice' })
    expect(JSON.stringify(bobView)).not.toContain('call.mp4')
    expect(await world.queries.listFiles(bob, 'study-1', {})).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
    expect(await world.gate.canAct('bob', 'study-1')).toBe(false)
    expect(await world.commands.refreshInventory({ actor: bob, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })

    world.drive.share('folder-interviews', 'bob@example.org')
    world.clock.advance(6 * 60_000)
    expect((await world.queries.studySource(bob, 'study-1'))?.access).toBe('full')
  })

  it('never uses one person permission for another person', async () => {
    await connect(alice, 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK })
    await world.runJobs()
    await connect(bob, 'bob@example.org')
    world.drive.share('folder-interviews', 'bob@example.org')
    expect((await world.commands.refreshInventory({ actor: bob, studyId: 'study-1' })).ok).toBe(
      true,
    )
    expect(world.jobs.at(-1)).toMatchObject({ accountId: 'bob' })
  })

  it('replacing the folder discards the previous inventory', async () => {
    await connect(alice, 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK })
    await world.runJobs()
    world.drive.addFolder('folder-other', 'Other')
    world.drive.share('folder-other', 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-other' })
    expect(world.store.files.get('study-1') ?? []).toEqual([])
    expect(world.store.sources.get('study-1')?.folderName).toBe('Other')
  })

  it('lets admins detach a folder without access to it (FR-010b)', async () => {
    await connect(alice, 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK })
    expect(await world.commands.detachFolder({ actor: bob, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
    expect(await world.commands.detachFolder({ actor: admin, studyId: 'study-1' })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(world.store.sources.has('study-1')).toBe(false)
  })

  it('disconnecting revokes at Google and forgets the permission (SC-007)', async () => {
    await connect(alice, 'alice@example.org')
    await world.commands.disconnectDrive({ actor: alice })
    expect(world.drive.revoked).toEqual(['token-1'])
    expect(world.store.connections.has('alice')).toBe(false)
    expect(
      await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: LINK }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_NOT_CONNECTED',
    })
  })

  it('refuses everything Drive-related when the connector is not configured', async () => {
    const unconfigured = new InMemoryIngestion(fixedClock(new Date()), { configured: false })
    expect(
      await unconfigured.commands.startDriveConnection({ actor: alice, returnTo: '/' }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_NOT_CONFIGURED',
    })
  })
})

describe('inventory runs (US3)', () => {
  let world: InMemoryIngestion

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-24T10:00:00Z')))
    world.studies.set('study-1', ['alice'])
    world.drive.addFolder('root-folder-01', 'Interviews')
    world.drive.addFolder('g1', 'Finance', 'root-folder-01')
    world.drive.addFile('f1', 'call.mp4', 'g1')
    world.drive.addFile('f2', 'notes.txt', 'root-folder-01', 'text/plain')
    world.drive.share('root-folder-01', 'alice@example.org')
    const started = await world.commands.startDriveConnection({ actor: alice, returnTo: '/' })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor: alice,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'root-folder-01' })
  })

  it('records totals per kind and group, and who ran it', async () => {
    expect(world.store.sources.get('study-1')?.inventory.status).toBe('running')
    expect(await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'INVENTORY_RUNNING',
    })
    await world.runJobs()
    const view = await world.queries.studySource(alice, 'study-1')
    expect(view?.source?.inventory).toMatchObject({
      status: 'done',
      runBy: { id: 'alice' },
      outdated: false,
      totals: {
        byKind: { transcript: 1, media: 1, other: 0 },
        byGroup: [
          { group: 'Finance', count: 1 },
          { group: 'Root', count: 1 },
        ],
      },
    })
    expect(await world.queries.listFiles(alice, 'study-1', { kind: 'media' })).toMatchObject({
      ok: true,
      value: [{ name: 'call.mp4', group: 'Finance' }],
    })
  })

  it('keeps the last inventory, marked outdated, when a refresh fails', async () => {
    await world.runJobs()
    world.drive.items.delete('root-folder-01')
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    const inventory = (await world.queries.studySource(alice, 'study-1'))?.source?.inventory
    expect(inventory).toMatchObject({
      status: 'failed',
      failure: 'FOLDER_NOT_FOUND',
      outdated: true,
    })
    expect(world.store.files.get('study-1')?.length).toBe(2)
  })

  it('marks the connection lost when Google revoked it', async () => {
    await world.runJobs()
    world.drive.tokens.clear()
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    expect(world.store.connections.get('alice')?.status).toBe('lost')
    expect(world.store.sources.get('study-1')?.inventory.failure).toBe('ACCESS_LOST')
    expect((await world.queries.studySource(alice, 'study-1'))?.access).toBe('drive-not-connected')
  })
})
