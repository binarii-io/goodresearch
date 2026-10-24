import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
const admin = { id: 'admin', role: 'admin' as const }
const MINUTE = 60_000

describe('inventory lifecycle (review of PR #2)', () => {
  let world: InMemoryIngestion

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-24T10:00:00Z')))
    world.studies.set('study-1', ['alice', 'admin'])
    world.drive.addFolder('folder-xxxxxxxx', 'X')
    world.drive.addFile('x1', 'secret-x.mp4', 'folder-xxxxxxxx')
    world.drive.addFolder('folder-yyyyyyyy', 'Y')
    world.drive.addFile('y1', 'y.mp4', 'folder-yyyyyyyy')
    world.drive.share('folder-xxxxxxxx', 'alice@example.org')
    world.drive.share('folder-yyyyyyyy', 'alice@example.org')
    const started = await world.commands.startDriveConnection({ actor: alice, returnTo: '/' })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor: alice,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
  })

  it('B3: a run of a replaced folder never writes its files on the new folder', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    const oldJob = world.jobs.shift()
    await world.commands.detachFolder({ actor: admin, studyId: 'study-1' })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-yyyyyyyy' })
    if (oldJob) await world.run(oldJob)
    expect(world.store.files.get('study-1') ?? []).toEqual([])
    await world.runJobs()
    expect(world.store.files.get('study-1')?.map((f) => f.name)).toEqual(['y.mp4'])
    expect(world.store.sources.get('study-1')?.folderName).toBe('Y')
  })

  it('B3: an old run never writes after a detach and re-attach of the same folder', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    const oldJob = world.jobs.shift()
    await world.commands.detachFolder({ actor: alice, studyId: 'study-1' })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    world.drive.addFile('x2', 'added-later.mp4', 'folder-xxxxxxxx')
    world.drive.items.delete('x2')
    if (oldJob) await world.run(oldJob)
    expect(world.store.sources.get('study-1')?.inventory.status).toBe('running')
    await world.runJobs()
    expect(world.store.sources.get('study-1')?.inventory.status).toBe('done')
  })

  it('shows a dead run as interrupted so it can be refreshed', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    world.jobs.length = 0
    world.clock.advance(36 * MINUTE)
    await world.store.saveFolderAccess('study-1', 'alice', 'granted', world.clock.now())
    expect((await world.queries.studySource(alice, 'study-1'))?.source?.inventory).toMatchObject({
      status: 'failed',
      failure: 'INTERRUPTED',
      progress: null,
    })
  })

  it('B3: a run finishing after a detach writes nothing', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    await world.commands.detachFolder({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    expect(world.store.files.has('study-1')).toBe(false)
    expect(world.store.sources.has('study-1')).toBe(false)
  })

  it('B2: a run stuck for more than 35 minutes can be restarted', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    world.jobs.length = 0 // the worker died: the job is lost
    expect(await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'INVENTORY_RUNNING',
    })
    world.clock.advance(36 * MINUTE)
    expect((await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })).ok).toBe(
      true,
    )
    await world.runJobs()
    expect(world.store.sources.get('study-1')?.inventory.status).toBe('done')
  })

  it('B2: a refused enqueue does not leave the study running', async () => {
    world.refuseJobs = true
    expect(
      await world.commands.attachFolder({
        actor: alice,
        studyId: 'study-1',
        link: 'folder-xxxxxxxx',
      }),
    ).toEqual({
      ok: false,
      error: 'INVENTORY_RUNNING',
    })
    expect(world.store.sources.get('study-1')?.inventory).toMatchObject({
      status: 'failed',
      failure: 'NOT_STARTED',
    })
    world.refuseJobs = false
    expect((await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })).ok).toBe(
      true,
    )
  })

  it('B2: an unreadable stored permission ends the run as access lost', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    const connection = world.store.connections.get('alice')
    if (connection)
      world.store.connections.set('alice', {
        ...connection,
        encryptedRefreshToken: 'v2:broken:broken:broken',
      })
    await world.runJobs()
    expect(world.store.sources.get('study-1')?.inventory).toMatchObject({
      status: 'failed',
      failure: 'ACCESS_LOST',
    })
    expect(world.store.connections.get('alice')?.status).toBe('lost')
  })

  it('a Drive outage during an access check is reported, not cached, not a crash', async () => {
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-xxxxxxxx' })
    await world.runJobs()
    world.clock.advance(6 * MINUTE)
    world.drive.outage = true
    expect((await world.queries.studySource(alice, 'study-1'))?.access).toBe('drive-unavailable')
    world.drive.outage = false
    expect((await world.queries.studySource(alice, 'study-1'))?.access).toBe('full')
  })
})
