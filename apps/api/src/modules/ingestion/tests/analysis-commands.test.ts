import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }
const TEXT = 'text/plain'

const SAM_HEADER = [
  'Transcript',
  '21 October 2026',
  'Participants: Sam Example, Alice Martin',
  'Alice Martin: Thanks for joining. So what do you think about the way you plan the week?',
  'Sam Example: I plan it on Sunday, with the whole family, and we keep it on the fridge.',
].join('\n')

const SPEAKERS = [
  'Robin Sample: Hello and thanks for being here with us today, shall we start?',
  'Casey Test: Thanks for having me, it is a pleasure to talk about this with you.',
].join('\n')

describe('analyzing the interviews (spec 009)', () => {
  let world: InMemoryIngestion

  const file = (id: string, name: string, at: string, mime = TEXT, text?: string) => {
    world.drive.addFile(id, name, 'folder-study', mime)
    const item = world.drive.items.get(id)
    if (item) world.drive.items.set(id, { ...item, modifiedTime: at })
    if (text !== undefined) world.drive.texts.set(id, text)
  }

  const connect = async (actor: { id: string }, account: string, access: 'read' | 'write') => {
    world.drive.nextConsentAccount = account
    const started = await world.commands.startDriveConnection({ actor, returnTo: '/', access })
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

  const sessionOf = async (name: string) => {
    const s = (await fieldwork()).sessions.find((x) => x.transcript?.name === name)
    if (!s) throw new Error(`no session ${name}`)
    return s
  }

  beforeEach(async () => {
    world = new InMemoryIngestion(fixedClock(new Date('2026-10-25T10:00:00Z')))
    world.studies.set('study-1', ['alice', 'bob'])
    world.team.push({ id: 'alice', name: 'Alice Martin' }, { id: 'bob', name: 'Bob Stone' })
    world.drive.addFolder('folder-study', 'Study')
    world.drive.share('folder-study', 'alice@example.org')
    world.drive.share('folder-study', 'bob@example.org')
    file('t-sam', 'Interview Sam Example.txt', '2026-10-21T10:00:00Z', TEXT, SAM_HEADER)
    file('m-sam', 'Interview Sam Example.mp4', '2026-10-21T10:00:20Z', 'video/mp4')
    file('t-two', 'Second interview.txt', '2026-10-22T15:00:00Z', TEXT, SPEAKERS)
    file('c-sam', 'Sam Example consent.pdf', '2026-10-21T09:00:00Z', 'application/pdf')
    await connect(alice, 'alice@example.org', 'write')
    await connect(bob, 'bob@example.org', 'read')
    await world.commands.attachFolder({ actor: alice, studyId: 'study-1', link: 'folder-study' })
    await world.runJobs()
    // Answers the AI would give: one real quote, one not in the text.
    world.analyzer.answer = (text) => ({
      interviewers: [{ name: 'Robin Sample', quote: 'shall we start?' }],
      interviewees: [
        { name: 'Casey Test', quote: text.includes('pleasure') ? 'it is a pleasure' : 'x' },
        { name: 'Nobody Here', quote: 'This sentence is not in the transcript.' },
      ],
      date: { value: '2026-10-22', quote: 'not written anywhere' },
    })
  })

  it('US1: a meeting tool header gives everything without the AI, at no cost (SC-005)', async () => {
    const s = await sessionOf('Interview Sam Example.txt')
    expect(
      await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true }),
    ).toEqual({ ok: true, value: { id: s.id } })
    expect(world.analyzer.calls).toEqual([])
    const after = await sessionOf('Interview Sam Example.txt')
    expect(after.cost).toBe(0)
    expect(after.analysis).toMatchObject({ state: 'done', usedAi: false, filesChanged: false })
    const byField = Object.fromEntries((after.analysis?.proposals ?? []).map((p) => [p.field, p]))
    expect(byField.interviewees).toMatchObject({
      people: [{ name: 'Sam Example', memberId: null }],
      origin: 'header',
    })
    expect(byField.interviewers).toMatchObject({
      people: [{ name: 'Alice Martin', memberId: 'alice' }],
    })
    expect(byField.date).toMatchObject({ text: '2026-10-21', origin: 'header' })
    expect(byField.language).toMatchObject({ text: 'en' })
    expect(byField.name).toMatchObject({ text: '2026-10-21 – Sam Example – Alice Martin' })
    expect(byField.attachment).toMatchObject({
      attachment: { fileId: 'c-sam', reason: 'shared-word:example' },
    })
  })

  it('US1: the AI fills what is missing; quotes not in the text are dropped (SC-001)', async () => {
    const s = await sessionOf('Second interview.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    expect(world.analyzer.calls).toEqual([
      { accountId: 'alice', ref: `session-analysis:${s.id}`, text: SPEAKERS },
    ])
    const after = await sessionOf('Second interview.txt')
    const byField = Object.fromEntries((after.analysis?.proposals ?? []).map((p) => [p.field, p]))
    expect(byField.interviewees).toMatchObject({
      people: [{ name: 'Casey Test' }],
      origin: 'ai',
      quote: 'it is a pleasure',
    })
    expect(byField.interviewers).toMatchObject({ people: [{ name: 'Robin Sample' }] })
    // The AI's date had no quote in the text: the file's date stays.
    expect(byField.date).toMatchObject({ text: '2026-10-22', origin: 'file-date' })
    expect(after.cost).toBe(0.01)
    expect((await fieldwork()).analysisCost).toBe(0.01)
  })

  it('FR-018: a badly named file finds its planned interview by the people of the transcript', async () => {
    world.schedules.set('study-1', [
      {
        id: '00000000-0000-4000-8000-0000000000aa',
        interviewee: 'Casey Test',
        interviewers: 'Robin Sample',
        scheduledAt: '2026-11-30T09:00:00Z',
        status: 'scheduled',
        version: 1,
      },
    ])
    const before = await sessionOf('Second interview.txt')
    expect(before.suggestion).toBeNull()
    await world.analysis.analyzeSession({ actor: alice, sessionId: before.id, consent: true })
    expect((await sessionOf('Second interview.txt')).suggestion).toMatchObject({
      plannedInterviewId: '00000000-0000-4000-8000-0000000000aa',
      rule: 'transcript',
    })
  })

  it('FR-022: accepting the people and date updates the linked planned interview', async () => {
    const PLANNED = '00000000-0000-4000-8000-0000000000bb'
    world.schedules.set('study-1', [
      {
        id: PLANNED,
        interviewee: 'Someone Else',
        interviewers: '',
        scheduledAt: '2026-10-01T15:00:00.000Z',
        status: 'scheduled',
        version: 1,
      },
    ])
    const s = await sessionOf('Interview Sam Example.txt')
    await world.sessions.link({
      actor: alice,
      sessionId: s.id,
      plannedInterviewId: PLANNED,
      version: s.version,
    })
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const analyzed = await sessionOf('Interview Sam Example.txt')
    await world.analysis.decide({
      actor: alice,
      sessionId: s.id,
      version: analyzed.version,
      decisions: [
        { field: 'interviewees', action: 'edit', value: [{ name: 'Sam Example', memberId: null }] },
        { field: 'date', action: 'accept' },
      ],
    })
    expect(world.schedules.get('study-1')?.[0]).toMatchObject({
      interviewee: 'Sam Example',
      scheduledAt: '2026-10-21T15:00:00.000Z',
    })
  })

  it('a Google document completes the first names of its transcript with its invited people', async () => {
    const DOC = 'application/vnd.google-apps.document'
    world.drive.addFile('d-call', 'Call - Notes by the assistant', 'folder-study', DOC)
    world.drive.tabs.set('d-call', ['Notes', 'Transcript'])
    world.drive.notes.set('d-call', 'Notes\nInvited: Casey Test, Alice Martin\n\nSummary')
    world.drive.texts.set(
      'd-call',
      [
        '21/10/2026',
        'Alice: Thanks for joining, shall we start?',
        'Casey: Sure.',
        'Alice: Tell me more.',
      ].join('\n'),
    )
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    const s = await sessionOf('Call - Notes by the assistant')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const after = await sessionOf('Call - Notes by the assistant')
    const byField = Object.fromEntries((after.analysis?.proposals ?? []).map((p) => [p.field, p]))
    expect(byField.interviewees?.people).toEqual([{ name: 'Casey Test', memberId: null }])
    expect(byField.interviewers?.people).toEqual([{ name: 'Alice Martin', memberId: 'alice' }])
    expect(world.analyzer.calls).toEqual([])
  })

  it('a member link typed for an interviewer must be one of the team', async () => {
    const s = await sessionOf('Interview Sam Example.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const analyzed = await sessionOf('Interview Sam Example.txt')
    await world.analysis.decide({
      actor: alice,
      sessionId: s.id,
      version: analyzed.version,
      decisions: [
        {
          field: 'interviewers',
          action: 'edit',
          value: [
            { name: 'Alice Martin', memberId: 'alice' },
            { name: 'Somebody', memberId: 'not-in-the-team' },
          ],
        },
      ],
    })
    const after = await sessionOf('Interview Sam Example.txt')
    expect(after.roster.filter((r) => r.role === 'interviewer').map((r) => r.memberId)).toEqual([
      'alice',
      null,
    ])
  })

  it('FR-011: asks for consent once per provider, and again when it changes', async () => {
    const s = await sessionOf('Second interview.txt')
    expect(await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })).toEqual({
      ok: false,
      error: 'ANALYSIS_CONSENT_REQUIRED',
    })
    expect((await fieldwork()).consentNeeded).toBe(true)
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    expect((await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })).ok).toBe(true)
    world.analyzer.provider = 'other'
    expect((await fieldwork()).consentNeeded).toBe(true)
  })

  it('US1: without an AI provider the rules still run, with the reason', async () => {
    world.analyzer.provider = null
    const s = await sessionOf('Second interview.txt')
    expect((await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })).ok).toBe(true)
    const after = await sessionOf('Second interview.txt')
    expect(after.analysis).toMatchObject({ state: 'failed', failure: 'AI_PROVIDER_REQUIRED' })
    expect(after.analysis?.proposals.map((p) => p.field)).toContain('date')
  })

  it('a network failure reaching Drive is a reason on the row, never a server error', async () => {
    const s = await sessionOf('Second interview.txt')
    const read = world.drive.readTextStart.bind(world.drive)
    world.drive.readTextStart = async () => {
      throw new TypeError('fetch failed')
    }
    expect(
      (await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })).ok,
    ).toBe(true)
    world.drive.readTextStart = read
    expect((await sessionOf('Second interview.txt')).analysis).toMatchObject({
      state: 'failed',
      failure: 'DRIVE_UNAVAILABLE',
    })
    expect(world.analyzer.calls).toEqual([])
  })

  it('a summary is not a transcript: the app excludes the interview, without the AI', async () => {
    world.drive.texts.set(
      't-two',
      [
        'Summary of the call',
        ...Array.from(
          { length: 15 },
          (_, i) => `Point ${i + 1}. The participant explained how the week is planned at home.`,
        ),
        'Next steps: send the survey and plan a second session in two weeks.',
      ].join('\n'),
    )
    const s = await sessionOf('Second interview.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const after = await sessionOf('Second interview.txt')
    expect(after).toMatchObject({ state: 'excluded', excludedReason: 'not-a-transcript' })
    expect(after.decidedBy).toBeNull()
    expect(after.analysis).toMatchObject({ failure: 'NOT_A_TRANSCRIPT' })
    expect(world.analyzer.calls).toEqual([])
    // A person can bring it back.
    const reopened = await world.sessions.decide({
      actor: alice,
      sessionId: s.id,
      decision: 'reopen',
      version: after.version,
    })
    expect(reopened.ok).toBe(true)
  })

  it('FR-005: an unreadable transcript fails with its reason, the file names still count', async () => {
    world.drive.unreadable.add('t-two')
    const s = await sessionOf('Second interview.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    expect((await sessionOf('Second interview.txt')).analysis).toMatchObject({
      state: 'failed',
      failure: 'UNREADABLE_FORMAT',
    })
    expect(world.analyzer.calls).toEqual([])
  })

  it('FR-008: accepting fills the roster, date, language and title; a person decision freezes it', async () => {
    const s = await sessionOf('Interview Sam Example.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const analyzed = await sessionOf('Interview Sam Example.txt')
    const decided = await world.analysis.decide({
      actor: alice,
      sessionId: s.id,
      version: analyzed.version,
      decisions: ['interviewees', 'interviewers', 'date', 'language', 'name'].map((field) => ({
        field: field as 'name',
        action: 'accept' as const,
      })),
    })
    expect(decided.ok).toBe(true)
    const after = await sessionOf('Interview Sam Example.txt')
    expect(after.roster.map((r) => [r.name, r.role, r.memberId])).toEqual([
      ['Sam Example', 'interviewee', null],
      ['Alice Martin', 'interviewer', 'alice'],
    ])
    expect(after).toMatchObject({
      interviewDate: '2026-10-21',
      language: 'en',
      title: '2026-10-21 – Sam Example – Alice Martin',
    })
    // A stale version is refused: nothing is overwritten.
    expect(
      await world.analysis.decide({
        actor: alice,
        sessionId: s.id,
        version: analyzed.version,
        decisions: [{ field: 'date', action: 'reject' }],
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    // A new analysis keeps what was accepted.
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })
    const again = await sessionOf('Interview Sam Example.txt')
    expect(again.analysis?.proposals.find((p) => p.field === 'date')?.status).toBe('accepted')
    await world.sessions.decide({
      actor: alice,
      sessionId: s.id,
      decision: 'validate',
      version: again.version,
    })
    // A validated interview can be analyzed again: nothing new, it stays validated.
    expect(await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })).toEqual({
      ok: true,
      value: { id: s.id },
    })
    expect(await sessionOf('Interview Sam Example.txt')).toMatchObject({
      state: 'validated',
      decidedBy: { id: alice.id },
    })
    // Something new to decide (a file added since): back to decide, what it holds kept.
    file('n-sam', 'Interview Sam Example - Notes.pdf', '2026-10-23T09:00:00Z', 'application/pdf')
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })
    const reopened = await sessionOf('Interview Sam Example.txt')
    expect(reopened).toMatchObject({ state: 'proposed', decidedBy: null })
    expect(reopened.title).toBe('2026-10-21 – Sam Example – Alice Martin')
    expect(reopened.analysis?.proposals.find((p) => p.field === 'date')?.status).toBe('accepted')
    // Excluded by a person: not analyzed.
    await world.sessions.decide({
      actor: alice,
      sessionId: s.id,
      decision: 'exclude',
      version: reopened.version,
    })
    expect(await world.analysis.analyzeSession({ actor: alice, sessionId: s.id })).toEqual({
      ok: false,
      error: 'SESSION_DECIDED',
    })
  })

  it('US2: a run analyzes the sessions to do, a few at a time, and can be stopped', async () => {
    const estimate = await world.analysis.estimate(alice, 'study-1')
    expect(estimate).toMatchObject({
      ok: true,
      value: { count: 2, withTranscript: 2, consentNeeded: true, aiConnected: true },
    })
    expect(await world.analysis.startRun({ actor: alice, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'ANALYSIS_CONSENT_REQUIRED',
    })
    const started = await world.analysis.startRun({
      actor: alice,
      studyId: 'study-1',
      consent: true,
    })
    expect(started.ok).toBe(true)
    expect(
      await world.analysis.startRun({ actor: bob, studyId: 'study-1', consent: true }),
    ).toEqual({ ok: false, error: 'ANALYSIS_RUNNING' })
    const waiting = await fieldwork()
    expect(waiting.run).toMatchObject({ total: 2, done: 0, state: 'running' })
    expect(waiting.sessions.map((s) => s.analysis?.state)).toEqual(['waiting', 'waiting'])
    const one = waiting.sessions[0]
    if (!one) throw new Error('fixture')
    expect(await world.analysis.analyzeSession({ actor: alice, sessionId: one.id })).toEqual({
      ok: false,
      error: 'ANALYSIS_RUNNING',
    })
    await world.runAnalysisJobs()
    const done = await fieldwork()
    expect(done.run).toBeNull()
    expect(done.sessions.map((s) => s.analysis?.state)).toEqual(['done', 'done'])
    expect(await world.analysis.startRun({ actor: alice, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'NOTHING_TO_ANALYZE',
    })
  })

  it('US2: analyzes again the interviews already analyzed when asked, decisions kept', async () => {
    await world.analysis.startRun({ actor: alice, studyId: 'study-1', consent: true })
    await world.runAnalysisJobs()
    expect(await world.analysis.startRun({ actor: alice, studyId: 'study-1' })).toEqual({
      ok: false,
      error: 'NOTHING_TO_ANALYZE',
    })
    const sam = await sessionOf('Interview Sam Example.txt')
    await world.analysis.decide({
      actor: alice,
      sessionId: sam.id,
      version: sam.version,
      decisions: [{ field: 'language', action: 'reject' }],
    })
    expect(await world.analysis.estimate(alice, 'study-1', { all: true })).toMatchObject({
      ok: true,
      value: { count: 2 },
    })
    const again = await world.analysis.startRun({ actor: alice, studyId: 'study-1', all: true })
    expect(again.ok).toBe(true)
    await world.runAnalysisJobs()
    const after = await sessionOf('Interview Sam Example.txt')
    expect(after.analysis?.proposals.find((p) => p.field === 'language')?.status).toBe('rejected')
  })

  it('US2: stopping leaves the sessions not reached as they were (never analyzed: none)', async () => {
    const started = await world.analysis.startRun({
      actor: alice,
      studyId: 'study-1',
      consent: true,
    })
    if (!started.ok) throw new Error('fixture')
    await world.analysis.stopRun({ actor: alice, studyId: 'study-1', runId: started.value.runId })
    await world.runAnalysisJobs()
    const view = await fieldwork()
    expect(view.run).toBeNull()
    expect(view.sessions.map((s) => s.analysis)).toEqual([null, null])
    expect(world.analyzer.calls).toEqual([])
  })

  it('US2: a run that cannot start puts the sessions back; a stuck one reads interrupted', async () => {
    const sam = await sessionOf('Interview Sam Example.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: sam.id, consent: true })
    world.refuseJobs = true
    expect(await world.analysis.startRun({ actor: alice, studyId: 'study-1', all: true })).toEqual({
      ok: false,
      error: 'ANALYSIS_RUNNING',
    })
    world.refuseJobs = false
    const back = await fieldwork()
    expect(back.sessions.map((s) => s.analysis?.state ?? null).sort()).toEqual(
      ['done', null].sort(),
    )
    // A run left without worker (crash): its waiting rows read interrupted, and are taken again.
    await world.analysis.startRun({ actor: alice, studyId: 'study-1', all: true })
    world.clock.advance(11 * 60_000)
    world.analysisJobs.length = 0
    const stuck = await fieldwork()
    expect(stuck.run).toBeNull()
    expect(stuck.sessions.map((s) => [s.analysis?.state, s.analysis?.failure])).toEqual([
      ['failed', 'INTERRUPTED'],
      ['failed', 'INTERRUPTED'],
    ])
    expect(await world.analysis.estimate(alice, 'study-1')).toMatchObject({
      ok: true,
      value: { count: 2 },
    })
  })

  it('US3: renames the files after the accepted name, and a refresh keeps the interview (SC-006)', async () => {
    const s = await sessionOf('Interview Sam Example.txt')
    expect(await world.rename.renamePlan(alice, s.id)).toEqual({
      ok: false,
      error: 'NAME_NOT_ACCEPTED',
    })
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    let current = await sessionOf('Interview Sam Example.txt')
    await world.analysis.decide({
      actor: alice,
      sessionId: s.id,
      version: current.version,
      decisions: [
        { field: 'name', action: 'accept' },
        { field: 'attachment', fileId: 'c-sam', action: 'accept' },
      ],
    })
    const plan = await world.rename.renamePlan(alice, s.id)
    expect(plan.ok && plan.value.files.map((f) => [f.current, f.next, f.canEdit])).toEqual([
      [
        'Interview Sam Example.txt',
        '2026-10-21 – Sam Example – Alice Martin – Transcript.txt',
        true,
      ],
      ['Interview Sam Example.mp4', '2026-10-21 – Sam Example – Alice Martin – Video.mp4', true],
      ['Sam Example consent.pdf', '2026-10-21 – Sam Example – Alice Martin – consent.pdf', true],
    ])
    expect(await world.rename.renameFiles(bob, s.id, ['t-sam'])).toEqual({
      ok: false,
      error: 'DRIVE_WRITE_REQUIRED',
    })
    world.drive.documents.viewers.set('m-sam', new Set(['alice@example.org']))
    const renamed = await world.rename.renameFiles(alice, s.id, ['t-sam', 'm-sam', 'c-sam'])
    expect(renamed.ok && renamed.value.results.map((r) => r.outcome)).toEqual([
      'renamed',
      'cannot-edit',
      'renamed',
    ])
    current = await sessionOf('2026-10-21 – Sam Example – Alice Martin – Transcript.txt')
    await world.commands.refreshInventory({ actor: alice, studyId: 'study-1' })
    await world.runJobs()
    const refreshed = await sessionOf('2026-10-21 – Sam Example – Alice Martin – Transcript.txt')
    expect(refreshed.id).toBe(s.id)
    // Renamed by the app: not a change of the files, so no new (paid) analysis is due.
    expect(refreshed.analysis?.filesChanged).toBe(false)
    expect(refreshed.media.map((m) => m.fileId)).toEqual(['m-sam'])
    expect(refreshed.attachments.map((a) => a.name)).toEqual([
      '2026-10-21 – Sam Example – Alice Martin – consent.pdf',
    ])
  })

  it('US4: under anonymisation, known names never reach the AI and names use pseudonyms (SC-003)', async () => {
    world.anonymised.add('study-1')
    world.drive.texts.set('t-two', `${SPEAKERS}\nRobin Sample: Bob Stone will join later.`)
    const s = await sessionOf('Second interview.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: s.id, consent: true })
    const sent = world.analyzer.calls[0]?.text ?? ''
    expect(sent).not.toContain('Bob')
    expect(sent).toContain('[Person')
    const sam = await sessionOf('Interview Sam Example.txt')
    await world.analysis.analyzeSession({ actor: alice, sessionId: sam.id })
    const after = await sessionOf('Interview Sam Example.txt')
    const name = after.analysis?.proposals.find((p) => p.field === 'name')
    expect(name?.text).toMatch(/^2026-10-21 – P0\d – Alice Martin$/)
    expect((await fieldwork()).namedFiles).toBeGreaterThan(0)
  })
})
