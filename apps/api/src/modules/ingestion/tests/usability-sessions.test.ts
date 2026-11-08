import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeUsabilitySources } from '../application/usability-sources.ts'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
const TEXT = 'text/plain'
const VIDEO = 'video/mp4'

const SPEAKERS = [
  'Robin Sample: Hello and thanks for joining this test, I will give you a few tasks.',
  'Casey Test: Thanks for having me, it is a pleasure to try it.',
].join('\n')

describe('usability test sessions (spec 037)', () => {
  let world: InMemoryIngestion

  const file = (
    id: string,
    name: string,
    at: string,
    mime = TEXT,
    extra: { text?: string; durationMs?: number } = {},
  ) => {
    world.drive.addFile(id, name, 'folder-study', mime)
    const item = world.drive.items.get(id)
    if (item)
      world.drive.items.set(id, {
        ...item,
        modifiedTime: at,
        ...(extra.durationMs ? { durationMs: extra.durationMs } : {}),
      })
    if (extra.text !== undefined) world.drive.texts.set(id, extra.text)
  }

  const fieldwork = async () => {
    const view = await world.sessionQueries.fieldwork(alice, 'study-1')
    if (!view.ok) throw new Error(view.error)
    return view.value
  }

  const sessionOf = async (videoId: string) => {
    const s = (await fieldwork()).sessions.find((x) => x.video?.fileId === videoId)
    if (!s) throw new Error(`no session for ${videoId}`)
    return s
  }

  const refresh = async () => {
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
  }

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-11-07T10:00:00Z')))
    world.studies.set('study-1', ['alice'])
    world.studyTypes.set('study-1', 'usability-test')
    world.team.push({ id: 'alice', name: 'Alice Martin' })
    world.drive.addFolder('folder-study', 'Study')
    world.drive.share('folder-study', 'alice@example.org')
    file('v-a', 'Test A - 2026/11/03 10:00 CET - Recording.mp4', '2026-11-03T11:00:00Z', VIDEO, {
      durationMs: 1_860_000,
    })
    file('t-a', 'Test A - 2026/11/03 10:00 CET - Transcript', '2026-11-03T11:01:00Z', TEXT, {
      text: SPEAKERS,
    })
    file('v-b', 'Screen B.mp4', '2026-11-04T15:00:00Z', VIDEO, { durationMs: 1_200_000 })
    file('a-b', 'Sound B.m4a', '2026-11-04T15:00:20Z', 'audio/mp4')
    file('v-c', 'Camera B.mp4', '2026-11-04T15:30:00Z', VIDEO)
    file('t-lost', 'Notes without video.txt', '2026-11-05T09:00:00Z')
    world.protocolVersions.set('study-1', [
      { version: 1, savedAt: new Date('2026-11-01T09:00:00Z') },
      { version: 2, savedAt: new Date('2026-11-04T09:00:00Z') },
    ])
    world.drive.nextConsentAccount = 'alice@example.org'
    const started = await world.commands.startDriveConnection({
      actor: alice,
      returnTo: '/',
      access: 'write',
    })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor: alice,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-study' })
    await world.runJobs()
  })

  it('US1: one session per video, with its duration, transcript and audio; others listed', async () => {
    const view = await fieldwork()
    expect(view.kind).toBe('sessions')
    expect(view.sessions).toHaveLength(3)
    const a = await sessionOf('v-a')
    expect(a.video).toMatchObject({ durationMs: 1_860_000 })
    expect(a.transcript?.fileId).toBe('t-a')
    expect((await sessionOf('v-b')).media.map((m) => m.fileId)).toEqual(['a-b'])
    // A video still processing at the source has no length yet.
    expect((await sessionOf('v-c')).video?.durationMs).toBeNull()
    expect(view.unclaimedTranscripts.map((f) => f.fileId)).toEqual(['t-lost'])
    expect(view.videoMinutes).toBe(51)
    // No schedule on a usability test.
    expect(view.plannedWithoutSession).toEqual([])
    expect(view.sessions.every((s) => s.link === null && s.suggestion === null)).toBe(true)
  })

  it('US1: a refresh keeps decisions and adds new videos', async () => {
    const a = await sessionOf('v-a')
    await world.sessions.decide({
      actor: alice,
      sessionId: a.id,
      decision: 'validate',
      version: a.version,
    })
    file('v-d', 'Test D.mp4', '2026-11-06T10:00:00Z', VIDEO)
    await refresh()
    const view = await fieldwork()
    expect(view.sessions).toHaveLength(4)
    expect((await sessionOf('v-a')).state).toBe('validated')
  })

  it('merges two videos of one session: the other files follow, the emptied session goes', async () => {
    const b = await sessionOf('v-b')
    const c = await sessionOf('v-c')
    expect((await fieldwork()).unmatchedMedia.map((f) => f.fileId)).toContain('v-c')
    const merged = await world.sessions.edit({
      actor: alice,
      sessionId: b.id,
      version: b.version,
      media: ['a-b', 'v-c'],
    })
    expect(merged.ok).toBe(true)
    const view = await fieldwork()
    expect(view.sessions.map((s) => s.id)).not.toContain(c.id)
    expect((await sessionOf('v-b')).media.map((m) => m.fileId)).toEqual(['a-b', 'v-c'])
    // A refresh does not bring the merged video back as a session of its own.
    await refresh()
    expect((await fieldwork()).sessions).toHaveLength(2)
  })

  it('refuses to take the video of a decided session', async () => {
    const b = await sessionOf('v-b')
    const c = await sessionOf('v-c')
    await world.sessions.decide({ actor: alice, sessionId: c.id, decision: 'exclude', version: 1 })
    expect(
      await world.sessions.edit({
        actor: alice,
        sessionId: b.id,
        version: b.version,
        media: ['v-c'],
      }),
    ).toMatchObject({ ok: false, error: 'MEDIA_UNAVAILABLE' })
  })

  it('US2: proposes the protocol version of the session date; a person chooses another', async () => {
    expect((await sessionOf('v-a')).protocolVersion).toEqual({ version: 1, by: 'app' })
    expect((await sessionOf('v-b')).protocolVersion).toEqual({ version: 2, by: 'app' })
    // Saving the protocol again later does not move the sessions (SC-005).
    world.protocolVersions.get('study-1')?.push({ version: 3, savedAt: new Date('2026-11-07') })
    expect((await sessionOf('v-a')).protocolVersion).toEqual({ version: 1, by: 'app' })
    const a = await sessionOf('v-a')
    expect(
      await world.sessions.setProtocolVersion({
        actor: alice,
        sessionId: a.id,
        protocolVersion: 3,
        version: a.version,
      }),
    ).toEqual({ ok: true, value: { id: a.id } })
    expect((await sessionOf('v-a')).protocolVersion).toEqual({ version: 3, by: 'person' })
    const again = await sessionOf('v-a')
    expect(
      await world.sessions.setProtocolVersion({
        actor: alice,
        sessionId: a.id,
        protocolVersion: 9,
        version: again.version,
      }),
    ).toMatchObject({ ok: false, error: 'VALIDATION' })
  })

  it('US2: without transcript, only the rules propose (no AI); with one, the AI hears the roles', async () => {
    const b = await sessionOf('v-b')
    await world.analysis.analyzeSession({ actor: alice, sessionId: b.id, consent: true })
    expect(world.analyzer.calls).toEqual([])
    const a = await sessionOf('v-a')
    world.analyzer.answer = () => ({
      interviewers: [{ name: 'Robin Sample', quote: 'I will give you a few tasks.' }],
      interviewees: [{ name: 'Casey Test', quote: 'it is a pleasure to try it' }],
      date: null,
    })
    await world.analysis.analyzeSession({ actor: alice, sessionId: a.id, consent: true })
    expect(world.analyzer.calls).toMatchObject([{ kind: 'usability-test' }])
    const proposals = (await sessionOf('v-a')).analysis?.proposals ?? []
    expect(proposals.find((p) => p.field === 'interviewees')?.people).toEqual([
      { name: 'Casey Test', memberId: null },
    ])
  })

  it('US2: on an anonymised study, the names the app knows never reach the AI', async () => {
    world.anonymised.add('study-1')
    world.drive.texts.set('t-a', `${SPEAKERS}\nRobin Sample: Alice Martin takes the notes.`)
    const a = await sessionOf('v-a')
    world.analyzer.answer = () => ({ interviewers: [], interviewees: [], date: null })
    await world.analysis.analyzeSession({ actor: alice, sessionId: a.id, consent: true })
    expect(world.analyzer.calls).toHaveLength(1)
    // The names the app knows (team, people entered) are replaced, as for interviews (spec 009 R4).
    expect(world.analyzer.calls[0]?.text).not.toContain('Alice')
  })

  it('US3: tells which sessions are ready and why the others are not', async () => {
    const a = await sessionOf('v-a')
    await world.sessions.edit({
      actor: alice,
      sessionId: a.id,
      version: a.version,
      roster: [{ name: 'Casey Test', role: 'interviewee' }],
    })
    for (const id of ['v-a', 'v-b', 'v-c']) {
      const s = await sessionOf(id)
      await world.sessions.decide({
        actor: alice,
        sessionId: s.id,
        decision: 'validate',
        version: s.version,
      })
    }
    const view = await fieldwork()
    expect(view.ready).toBe(1)
    expect((await sessionOf('v-a')).readiness).toBe('ready')
    expect((await sessionOf('v-b')).readiness).toBe('participant-to-confirm')
    expect((await sessionOf('v-c')).readiness).toBe('duration-unknown')
    world.protocolVersions.set('study-1', [])
    expect((await sessionOf('v-a')).readiness).toBe('no-protocol')
  })

  it('US4: the assistant counts sessions, readiness and video minutes, without names', async () => {
    const counts = await world.sessionQueries.interviewCounts(alice, 'study-1')
    expect(counts).toMatchObject({
      ok: true,
      value: { total: 3, readyForAnalysis: 0, videoMinutes: 51, 'not-ready': 3 },
    })
  })
})

describe('what the video analysis reads of test sessions (spec 038)', () => {
  let world: InMemoryIngestion
  const alice = { id: 'alice', role: 'member' as const }

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-11-07T10:00:00Z')))
    world.studies.set('study-1', ['alice'])
    world.studyTypes.set('study-1', 'usability-test')
    world.team.push({ id: 'alice', name: 'Alice Martin' })
    world.drive.addFolder('folder-study', 'Study')
    world.drive.share('folder-study', 'alice@example.org')
    world.drive.addFile('v-a', 'Test A.mp4', 'folder-study', 'video/mp4')
    const item = world.drive.items.get('v-a')
    if (item)
      world.drive.items.set('v-a', {
        ...item,
        modifiedTime: '2026-11-03T11:00:00Z',
        durationMs: 60_000,
      })
    world.drive.bytes.set('v-a', new Uint8Array([1, 2, 3, 4, 5]))
    world.protocolVersions.set('study-1', [{ version: 1, savedAt: new Date('2026-11-01') }])
    world.drive.nextConsentAccount = 'alice@example.org'
    const started = await world.commands.startDriveConnection({ actor: alice, returnTo: '/' })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor: alice,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-study' })
    await world.runJobs()
  })

  const sources = () => makeUsabilitySources(world.deps, world.sessionQueries, world.analysis)

  it('lists the sessions with their video, protocol version and people, pseudonyms when anonymised', async () => {
    const [s] = await sources().sessions('alice', 'study-1')
    expect(s).toMatchObject({
      studyId: 'study-1',
      protocolVersion: 1,
      video: { fileId: 'v-a', durationMs: 60_000 },
      participant: null,
      hasPeople: false,
    })
    const view = await world.sessionQueries.fieldwork(alice, 'study-1')
    if (!view.ok) throw new Error('fixture')
    const id = view.value.sessions[0]?.id ?? ''
    await world.sessions.edit({
      actor: alice,
      sessionId: id,
      version: view.value.sessions[0]?.version ?? 0,
      roster: [
        { name: 'Casey Test', role: 'interviewee' },
        { name: 'Robin Sample', role: 'interviewer' },
      ],
    })
    expect((await sources().session('alice', id))?.participant).toBe('Casey Test')
    world.anonymised.add('study-1')
    expect(await sources().session('alice', id)).toMatchObject({
      participant: 'P01',
      facilitators: ['I01'],
      hasPeople: true,
    })
    expect(await sources().sessions('bob', 'study-1')).toEqual([])
  })

  it('streams the video and reads ranges with the person’s access, only for videos of the study', async () => {
    const stream = await sources().streamVideo('alice', 'study-1', 'v-a')
    if (typeof stream === 'string') throw new Error(stream)
    const got: number[] = []
    for await (const bytes of stream.chunks) got.push(...bytes)
    expect(got).toEqual([1, 2, 3, 4, 5])
    expect(await sources().streamVideo('alice', 'study-1', 'not-in-study')).toBe('not-found')
    const part = await sources().videoRange('alice', 'study-1', 'v-a', 'bytes=1-2')
    expect(part).toMatchObject({ status: 206, contentRange: 'bytes 1-2/5' })
  })

  it('streams a video range after range, each starting where the last ended', async () => {
    const small = makeUsabilitySources(world.deps, world.sessionQueries, world.analysis, 2)
    const stream = await small.streamVideo('alice', 'study-1', 'v-a')
    if (typeof stream === 'string') throw new Error(stream)
    const got: number[] = []
    for await (const bytes of stream.chunks) got.push(...bytes)
    expect(got).toEqual([1, 2, 3, 4, 5])
  })

  it('fails the copy when the video goes from Drive meanwhile, never a cut video', async () => {
    const small = makeUsabilitySources(world.deps, world.sessionQueries, world.analysis, 2)
    const stream = await small.streamVideo('alice', 'study-1', 'v-a')
    if (typeof stream === 'string') throw new Error(stream)
    const read = async () => {
      for await (const _ of stream.chunks) world.drive.bytes.delete('v-a')
    }
    await expect(read()).rejects.toThrow('no longer readable')
  })

  it('keeps consent per provider, and names known for anonymisation checks', async () => {
    expect(await sources().hasConsent('alice', 'study-1', 'vertex')).toBe(false)
    await sources().giveConsent('alice', 'study-1', 'vertex')
    expect(await sources().hasConsent('alice', 'study-1', 'vertex')).toBe(true)
    expect(await sources().knownNames('study-1', 'alice')).toContain('Alice Martin')
  })

  it('proposes the people from a given transcript, without reopening a validated session', async () => {
    const view = await world.sessionQueries.fieldwork(alice, 'study-1')
    if (!view.ok) throw new Error('fixture')
    const s = view.value.sessions[0]
    if (!s) throw new Error('fixture')
    await world.sessions.decide({
      actor: alice,
      sessionId: s.id,
      decision: 'validate',
      version: s.version,
    })
    world.analyzer.answer = () => ({
      interviewers: [{ name: 'Robin Sample', quote: 'I will give you a few tasks.' }],
      interviewees: [{ name: 'Casey Test', quote: 'it is a pleasure to try it' }],
      date: null,
    })
    await sources().proposePeopleFromText('alice', s.id, SPEAKERS)
    expect(world.analyzer.calls).toMatchObject([{ kind: 'usability-test', text: SPEAKERS }])
    const after = await sources().session('alice', s.id)
    expect(after?.state).toBe('validated')
    const shown = await world.sessionQueries.session(alice, s.id)
    if (!shown.ok) throw new Error('fixture')
    expect(shown.value.analysis?.proposals.find((p) => p.field === 'interviewees')?.people).toEqual(
      [{ name: 'Casey Test', memberId: null }],
    )
  })
})
