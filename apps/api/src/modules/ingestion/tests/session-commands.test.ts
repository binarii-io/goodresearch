import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }
const eve = { id: 'eve', role: 'member' as const }
const TEXT = 'text/plain'
const SAM = '00000000-0000-4000-8000-000000000001'
const LEE = '00000000-0000-4000-8000-000000000002'

describe('fieldwork sessions (spec 008)', () => {
  let world: InMemoryIngestion

  const file = (id: string, name: string, at: string, mime = TEXT) => {
    world.drive.addFile(id, name, 'folder-study', mime)
    const item = world.drive.items.get(id)
    if (item) world.drive.items.set(id, { ...item, modifiedTime: at })
  }

  const connect = async (actor: { id: string }, account: string) => {
    world.drive.nextConsentAccount = account
    const started = await world.commands.startDriveConnection({ actor, returnTo: '/' })
    if (!started.ok) throw new Error('fixture')
    await world.commands.completeDriveConnection({
      actor,
      state: new URL(started.value.url).searchParams.get('state') ?? '',
      code: 'c',
    })
  }

  const fieldwork = async (actor = alice) => {
    const view = await world.sessionQueries.fieldwork(actor, 'study-1')
    if (!view.ok) throw new Error(view.error)
    return view.value
  }

  const refresh = async () => {
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
  }

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-25T10:00:00Z')))
    world.studies.set('study-1', ['alice', 'bob'])
    world.drive.addFolder('folder-study', 'Study')
    world.drive.share('folder-study', 'alice@example.org')
    world.drive.share('folder-study', 'bob@example.org')
    file('t-sam', 'Interview Sam Example.txt', '2026-10-20T10:00:00Z')
    file('t-two', 'Second interview.txt', '2026-10-21T15:00:00Z')
    file('m-sam', 'Sam recording.mp4', '2026-10-20T10:00:20Z', 'video/mp4')
    world.schedules.set('study-1', [
      {
        id: SAM,
        interviewee: 'Sam Example',
        interviewers: 'Ana, Bo',
        scheduledAt: '2026-10-20T09:00:00Z',
        status: 'scheduled',
        version: 1,
      },
      {
        id: LEE,
        interviewee: 'Lee Example',
        interviewers: '',
        scheduledAt: '2026-10-21T14:00:00Z',
        status: 'scheduled',
        version: 1,
      },
    ])
    await connect(alice, 'alice@example.org')
    await connect(bob, 'bob@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-study' })
    await world.runJobs()
  })

  it('US1: proposes one interview per transcript, newest first, with its recording', async () => {
    const view = await fieldwork()
    expect(view.sessions.map((s) => s.transcript?.name)).toEqual([
      'Second interview.txt',
      'Interview Sam Example.txt',
    ])
    expect(view.sessions[1]?.media).toMatchObject([
      { fileId: 'm-sam', confidence: 'high', reason: 'same-time' },
    ])
    expect(view.totals).toEqual({ proposed: 2, validated: 0, excluded: 0 })
    expect(view.unmatchedMedia).toEqual([])
  })

  it('US1: keeps the order of the list when a file is renamed in Drive', async () => {
    const before = await fieldwork()
    const sam = before.sessions[1]?.transcript
    if (!sam) throw new Error('fixture')
    await world.store.renameFile('study-1', sam.fileId, 'Renamed.txt', '2030-01-01T00:00:00.000Z')
    const after = await fieldwork()
    expect(after.sessions.map((s) => s.id)).toEqual(before.sessions.map((s) => s.id))
  })

  it('US2: suggests the planned interview by name, then by date, and lists those without one', async () => {
    const view = await fieldwork()
    const [two, sam] = view.sessions
    expect(sam?.suggestion).toMatchObject({ plannedInterviewId: SAM, rule: 'name' })
    expect(two?.suggestion).toMatchObject({ plannedInterviewId: LEE, rule: 'date' })
    expect(view.plannedWithoutSession.map((p) => p.id)).toEqual([SAM, LEE])
  })

  it('US2: confirming a suggestion links it and prefills the people', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    const linked = await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: sam.version,
      confirmSuggestion: true,
    })
    expect(linked.ok).toBe(true)
    const view = await fieldwork()
    const after = view.sessions[1]
    expect(after?.link).toMatchObject({ plannedInterviewId: SAM, linkedBy: 'suggestion' })
    expect(after?.defaultTitle).toBe('Sam Example')
    expect(after?.roster.map((r) => [r.name, r.role])).toEqual([
      ['Sam Example', 'interviewee'],
      ['Ana', 'interviewer'],
      ['Bo', 'interviewer'],
    ])
    expect(view.plannedWithoutSession.map((p) => p.id)).toEqual([LEE])
  })

  it('US2: a planned interview goes to one session; moving it needs a confirmation', async () => {
    const [two, sam] = (await fieldwork()).sessions
    if (!two || !sam) throw new Error('fixture')
    await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: 1,
    })
    const refused = await world.sessions.link({
      actor: alice,
      sessionId: two.id,
      plannedInterviewId: SAM,
      version: two.version,
    })
    expect(refused).toMatchObject({ ok: false, error: 'PLANNED_INTERVIEW_LINKED' })
    const moved = await world.sessions.link({
      actor: alice,
      sessionId: two.id,
      plannedInterviewId: SAM,
      version: two.version,
      move: true,
    })
    expect(moved.ok).toBe(true)
    const view = await fieldwork()
    expect(view.sessions[0]?.link?.plannedInterviewId).toBe(SAM)
    expect(view.sessions[1]?.link).toBeNull()
  })

  it('US3: decided sessions survive a refresh; reopening proposes them again', async () => {
    const [two, sam] = (await fieldwork()).sessions
    if (!two || !sam) throw new Error('fixture')
    expect(
      (
        await world.sessions.decide({
          actor: alice,
          sessionId: sam.id,
          decision: 'validate',
          version: 1,
        })
      ).ok,
    ).toBe(true)
    await world.sessions.decide({
      actor: alice,
      sessionId: two.id,
      decision: 'exclude',
      reason: 'A test call',
      version: two.version,
    })
    world.drive.items.delete('m-sam')
    world.drive.items.delete('t-two')
    await refresh()
    const view = await fieldwork()
    expect(view.totals).toEqual({ proposed: 0, validated: 1, excluded: 1 })
    expect(view.sessions.find((s) => s.id === two.id)).toMatchObject({
      fileMissing: true,
      excludedReason: 'A test call',
    })
    const excluded = view.sessions.find((s) => s.id === two.id)
    const reopened = await world.sessions.decide({
      actor: alice,
      sessionId: two.id,
      decision: 'reopen',
      version: excluded?.version ?? 0,
    })
    expect(reopened.ok).toBe(true)
  })

  it('US3: validating marks its planned interview done, whichever screen it comes from', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    const linked = await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: sam.version,
    })
    if (!linked.ok) throw new Error('fixture')
    const now = (await fieldwork()).sessions[1]
    await world.sessions.decide({
      actor: alice,
      sessionId: sam.id,
      decision: 'validate',
      version: now?.version ?? 0,
    })
    expect(world.schedules.get('study-1')?.find((p) => p.id === SAM)?.status).toBe('done')
    expect(world.schedules.get('study-1')?.find((p) => p.id === LEE)?.status).toBe('scheduled')
  })

  it('US3: a stale change is refused with "changed meanwhile"', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    await world.sessions.edit({ actor: alice, sessionId: sam.id, version: 1, title: 'Sam, day 1' })
    expect(
      await world.sessions.decide({
        actor: bob,
        sessionId: sam.id,
        decision: 'validate',
        version: 1,
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('US3: recordings are chosen among the free ones and kept by the next refresh', async () => {
    const [two, sam] = (await fieldwork()).sessions
    if (!two || !sam) throw new Error('fixture')
    expect(
      await world.sessions.edit({
        actor: alice,
        sessionId: two.id,
        version: two.version,
        media: ['m-sam'],
      }),
    ).toEqual({ ok: false, error: 'MEDIA_UNAVAILABLE' })
    await world.sessions.edit({ actor: alice, sessionId: sam.id, version: sam.version, media: [] })
    expect(
      (
        await world.sessions.edit({
          actor: alice,
          sessionId: two.id,
          version: two.version,
          media: ['m-sam'],
        })
      ).ok,
    ).toBe(true)
    await refresh()
    const view = await fieldwork()
    expect(view.sessions[0]?.media.map((m) => m.fileId)).toEqual(['m-sam'])
    expect(view.sessions[1]?.media).toEqual([])
  })

  it('checks members of the people and refuses edits of decided sessions', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    expect(
      await world.sessions.edit({
        actor: alice,
        sessionId: sam.id,
        version: 1,
        roster: [{ name: 'Ghost', role: 'interviewer', memberId: 'nobody' }],
      }),
    ).toEqual({ ok: false, error: 'MEMBER_NOT_FOUND' })
    await world.sessions.decide({
      actor: alice,
      sessionId: sam.id,
      decision: 'validate',
      version: 1,
    })
    expect(
      await world.sessions.edit({ actor: alice, sessionId: sam.id, version: 2, title: 'x' }),
    ).toEqual({ ok: false, error: 'SESSION_DECIDED' })
  })

  it('gates on the study and the folder, and a new folder discards the sessions', async () => {
    expect(await world.sessionQueries.fieldwork(eve, 'study-1')).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
    world.drive.addFolder('folder-other', 'Other')
    world.drive.share('folder-other', 'alice@example.org')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-other' })
    expect([...world.store.sessions.values()]).toEqual([])
  })

  it('a link to a planned interview removed from the schedule reads as none', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: 1,
    })
    world.schedules.set(
      'study-1',
      (world.schedules.get('study-1') ?? []).filter((p) => p.id !== SAM),
    )
    const view = await fieldwork()
    expect(view.sessions[1]?.link).toBeNull()
    const validated = await world.sessions.decide({
      actor: alice,
      sessionId: sam.id,
      decision: 'validate',
      version: 2,
    })
    expect(validated.ok).toBe(true)
    expect(world.store.sessions.get(sam.id)?.plannedInterviewId).toBeNull()
  })

  it('a recording goes to one interview only, even when chosen in two at once', async () => {
    const [two, sam] = (await fieldwork()).sessions
    if (!two || !sam) throw new Error('fixture')
    // A stale view of "sam" (still without its recording) cannot take it from elsewhere.
    await world.sessions.edit({ actor: alice, sessionId: sam.id, version: sam.version, media: [] })
    await world.sessions.edit({
      actor: alice,
      sessionId: two.id,
      version: two.version,
      media: ['m-sam'],
    })
    const fresh = world.store.sessions.get(sam.id)
    if (!fresh) throw new Error('fixture')
    expect(
      await world.store.saveSession(
        { ...fresh, media: [{ fileId: 'm-sam', confidence: null, reason: 'person' }] },
        fresh.version,
      ),
    ).toBe('media-taken')
  })

  it('other study types get no interviews', async () => {
    world.studyTypes.set('study-1', 'survey')
    for (const id of world.store.sessions.keys()) world.store.sessions.delete(id)
    await refresh()
    expect(world.store.sessions.size).toBe(0)
    expect(await world.sessionQueries.fieldwork(alice, 'study-1')).toEqual({
      ok: false,
      error: 'NOT_AN_INTERVIEW_STUDY',
    })
  })

  it('an inventory taken before sessions existed gets its interviews on the first read', async () => {
    for (const id of world.store.sessions.keys()) world.store.sessions.delete(id)
    const view = await fieldwork()
    expect(view.sessions).toHaveLength(2)
    expect(view.skipped).toBe(0)
  })

  it('a schedule that cannot be read never drops a link', async () => {
    const sam = (await fieldwork()).sessions[1]
    if (!sam) throw new Error('fixture')
    await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: 1,
    })
    world.scheduleUnreadable = true
    await world.sessions.edit({ actor: alice, sessionId: sam.id, version: 2, title: 'Sam' })
    expect(world.store.sessions.get(sam.id)?.plannedInterviewId).toBe(SAM)
  })

  it('moving a planned interview held by a decided interview asks to reopen that one', async () => {
    const [two, sam] = (await fieldwork()).sessions
    if (!two || !sam) throw new Error('fixture')
    await world.sessions.link({
      actor: alice,
      sessionId: sam.id,
      plannedInterviewId: SAM,
      version: 1,
    })
    await world.sessions.decide({
      actor: alice,
      sessionId: sam.id,
      decision: 'validate',
      version: 2,
    })
    expect(
      await world.sessions.link({
        actor: alice,
        sessionId: two.id,
        plannedInterviewId: SAM,
        version: two.version,
        move: true,
      }),
    ).toEqual({ ok: false, error: 'LINKED_TO_DECIDED_SESSION' })
  })

  it('meeting notes without a transcript tab are not interviews', async () => {
    world.drive.addFile(
      'd-notes',
      'Team sync - Notes',
      'folder-study',
      'application/vnd.google-apps.document',
    )
    world.drive.addFile(
      'd-call',
      'Lee - Notes',
      'folder-study',
      'application/vnd.google-apps.document',
    )
    world.drive.tabs.set('d-notes', ['Notes'])
    world.drive.tabs.set('d-call', ['Notes', 'Transcript'])
    await refresh()
    const names = (await fieldwork()).sessions.map((s) => s.transcript?.name)
    expect(names).toContain('Lee - Notes')
    expect(names).not.toContain('Team sync - Notes')
  })

  it('a recording alone gets its own row, which goes when the recording joins an interview', async () => {
    file('m-lone', 'Lone call.mp4', '2026-10-28T10:00:00Z', 'video/mp4')
    await refresh()
    const view = await fieldwork()
    const lone = view.sessions.find((s) => s.noTranscript)
    expect(lone?.media.map((m) => m.fileId)).toEqual(['m-lone'])
    expect(view.unmatchedMedia.map((m) => m.fileId)).toEqual(['m-lone'])
    const two = view.sessions.find((s) => s.transcript?.name === 'Second interview.txt')
    if (!two || !lone) throw new Error('fixture')
    expect(
      (
        await world.sessions.edit({
          actor: alice,
          sessionId: two.id,
          version: two.version,
          media: ['m-lone'],
        })
      ).ok,
    ).toBe(true)
    expect(world.store.sessions.has(lone.id)).toBe(false)
  })

  it('places files no session holds yet on the next read, without a new inventory', async () => {
    const lone = [...world.store.sessions.values()].find((x) => x.transcriptFileId === null)
    if (lone) world.store.sessions.delete(lone.id)
    file('m-new', 'Late call.mp4', '2026-10-28T10:00:00Z', 'video/mp4')
    world.store.files.set('study-1', [
      ...(world.store.files.get('study-1') ?? []),
      {
        id: 'm-new',
        name: 'Late call.mp4',
        kind: 'media',
        group: 'Root',
        mimeType: 'video/mp4',
        size: 1,
        modifiedAt: '2026-10-28T10:00:00Z',
        webViewLink: 'https://drive.example/m-new',
      },
    ])
    const view = await fieldwork()
    expect(view.sessions.filter((x) => x.noTranscript).map((x) => x.media[0]?.fileId)).toEqual([
      'm-new',
    ])
  })

  it('a row without transcript someone worked on still gives up its recording, unless decided', async () => {
    file('m-lone', 'Lone call.mp4', '2026-10-28T10:00:00Z', 'video/mp4')
    await refresh()
    let view = await fieldwork()
    const lone = view.sessions.find((x) => x.noTranscript)
    const two = view.sessions.find((x) => x.transcript?.name === 'Second interview.txt')
    if (!lone || !two) throw new Error('fixture')
    // Worked on (a title), not decided: its recording is still offered and moves.
    await world.sessions.edit({
      actor: alice,
      sessionId: lone.id,
      version: lone.version,
      title: 'A call',
    })
    view = await fieldwork()
    expect(view.unmatchedMedia.map((m) => m.fileId)).toEqual(['m-lone'])
    expect(
      (
        await world.sessions.edit({
          actor: alice,
          sessionId: two.id,
          version: two.version,
          media: ['m-lone'],
        })
      ).ok,
    ).toBe(true)
    expect(world.store.sessions.has(lone.id)).toBe(false)
  })

  it('a row without transcript a person validated keeps its recording', async () => {
    file('m-lone', 'Lone call.mp4', '2026-10-28T10:00:00Z', 'video/mp4')
    await refresh()
    const view = await fieldwork()
    const lone = view.sessions.find((x) => x.noTranscript)
    const two = view.sessions.find((x) => x.transcript?.name === 'Second interview.txt')
    if (!lone || !two) throw new Error('fixture')
    await world.sessions.decide({
      actor: alice,
      sessionId: lone.id,
      decision: 'validate',
      version: lone.version,
    })
    expect((await fieldwork()).unmatchedMedia).toEqual([])
    expect(
      await world.sessions.edit({
        actor: alice,
        sessionId: two.id,
        version: two.version,
        media: ['m-lone'],
      }),
    ).toEqual({ ok: false, error: 'MEDIA_UNAVAILABLE' })
  })
})
