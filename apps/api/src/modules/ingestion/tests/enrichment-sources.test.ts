import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeEnrichmentSources, TRANSCRIPT_MAX_CHARS } from '../application/enrichment-sources.ts'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }

describe('what Enrichment reads of the interviews (spec 010)', () => {
  let world: InMemoryIngestion
  let sources: ReturnType<typeof makeEnrichmentSources>

  const file = (id: string, name: string, text: string) => {
    world.drive.addFile(id, name, 'folder-study', 'text/plain')
    world.drive.texts.set(id, text)
  }

  const sessionOf = async (name: string) => {
    const view = await world.sessionQueries.fieldwork(alice, 'study-1')
    if (!view.ok) throw new Error(view.error)
    const s = view.value.sessions.find((x) => x.transcript?.name === name)
    if (!s) throw new Error(`no session ${name}`)
    return s
  }

  const validate = async (name: string) => {
    const s = await sessionOf(name)
    const done = await world.sessions.decide({
      actor: alice,
      sessionId: s.id,
      decision: 'validate',
      version: s.version,
    })
    if (!done.ok) throw new Error(done.error)
    return s.id
  }

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-26T10:00:00Z')))
    world.studies.set('study-1', ['alice'])
    world.team.push({ id: 'alice', name: 'Alice Martin' })
    world.schedules.set('study-1', [
      {
        id: 'p1',
        interviewee: 'Sam Example',
        interviewers: 'Alice Martin, Lee Other',
        scheduledAt: null,
        status: 'done',
        version: 1,
      },
    ])
    world.drive.addFolder('folder-study', 'Study')
    world.drive.share('folder-study', 'alice@example.org')
    file('t-one', 'One.txt', 'Lee: Hello\nSam: Hi, we use Goodresearch.')
    file('t-two', 'Two.txt', 'Lee: Hello again')
    file('t-long', 'Long.txt', `Lee: ${'word '.repeat(TRANSCRIPT_MAX_CHARS / 5)}`)
    world.drive.nextConsentAccount = 'alice@example.org'
    const started = await world.commands.startDriveConnection({
      actor: alice,
      returnTo: '/',
      access: 'read',
    })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor: alice,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-study' })
    await world.runJobs()
    sources = makeEnrichmentSources(world.deps)
  })

  it('lists only the validated interviews, and counts the others', async () => {
    await validate('One.txt')
    const found = await sources.enrichmentSessions('alice', 'study-1')
    expect(found?.sessions.map((s) => s.title)).toEqual(['One.txt'])
    expect(found?.sessions[0]?.transcript).toMatchObject({ fileId: 't-one', name: 'One.txt' })
    expect(found?.toValidate).toBe(2)
    expect(await sources.enrichmentSessions('nobody', 'study-1')).toBeNull()
  })

  it('reads the full text of a validated interview only', async () => {
    const id = await validate('One.txt')
    expect(await sources.readTranscript('alice', 'study-1', id)).toMatchObject({
      ok: true,
      value: { text: 'Lee: Hello\nSam: Hi, we use Goodresearch.' },
    })
    const other = await sessionOf('Two.txt')
    expect(await sources.readTranscript('alice', 'study-1', other.id)).toEqual({
      ok: false,
      error: 'FILE_NOT_FOUND',
    })
  })

  it('refuses a transcript longer than the ceiling', async () => {
    const id = await validate('Long.txt')
    expect(await sources.readTranscript('alice', 'study-1', id)).toEqual({
      ok: false,
      error: 'TOO_LONG',
    })
  })

  it('gives the names of the schedule and the team (they stay in the app)', async () => {
    expect(await sources.knownNames('alice', 'study-1')).toEqual(
      expect.arrayContaining(['Sam Example', 'Alice Martin', 'Lee Other']),
    )
    expect(await sources.knownNames('nobody', 'study-1')).toEqual([])
  })
})
