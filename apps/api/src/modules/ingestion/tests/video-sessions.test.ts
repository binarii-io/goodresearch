import { describe, expect, it } from 'vitest'
import { isVideo } from '../domain/classify.ts'
import { expectedNames } from '../domain/file-names.ts'
import type { InventoryFile } from '../domain/inventory-walk.ts'
import { type ProtocolVersionRef, sessionMoment, versionAt } from '../domain/protocol-version.ts'
import { reconcileVideoSessions } from '../domain/reconcile-sessions.ts'
import {
  absorb,
  chooseProtocolVersion,
  edit,
  givesUpRecordings,
  type Session,
} from '../domain/session.ts'
import { readinessOf } from '../domain/session-readiness.ts'

const NOW = new Date('2026-11-07T10:00:00Z')

const file = (
  id: string,
  name: string,
  mimeType: string,
  modifiedAt: string | null = null,
  group = 'Root',
): InventoryFile => ({
  id,
  name,
  kind: mimeType.startsWith('video/') || mimeType.startsWith('audio/') ? 'media' : 'transcript',
  group,
  mimeType,
  size: null,
  modifiedAt,
  webViewLink: `https://drive.example/${id}`,
})

const video = (id: string, name: string, at: string | null = null, group = 'Root') =>
  file(id, name, 'video/mp4', at, group)
const transcript = (id: string, name: string, at: string | null = null, group = 'Root') =>
  file(id, name, 'text/plain', at, group)
const audio = (id: string, name: string, at: string | null = null, group = 'Root') =>
  file(id, name, 'audio/mp4', at, group)

let counter = 0
const newId = () => `n${++counter}`

const session = (over: Partial<Session> = {}): Session => ({
  id: 'x',
  studyId: 'study',
  transcriptFileId: null,
  videoFileId: 'v1',
  protocolVersion: null,
  media: [],
  mediaEdited: false,
  state: 'proposed',
  excludedReason: null,
  title: null,
  plannedInterviewId: null,
  linkedBy: null,
  roster: [],
  decidedBy: null,
  decidedAt: null,
  interviewDate: null,
  language: null,
  attachments: [],
  analysis: null,
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
  ...over,
})

const run = (files: InventoryFile[], sessions: Session[] = []) =>
  reconcileVideoSessions({ studyId: 'study', files, sessions, now: NOW, newId })

describe('test sessions from videos (spec 037)', () => {
  it('tells videos from audio by their type', () => {
    expect(isVideo('video/mp4')).toBe(true)
    expect(isVideo('audio/mp4')).toBe(false)
  })

  it('gives one session per video, with the transcript and audio that match it', () => {
    const r = run([
      video('v1', 'Test A - 2026/11/03 10:00 CET - Recording.mp4'),
      transcript('t1', 'Test A - 2026/11/03 10:00 CET - Transcript'),
      video('v2', 'Other.mp4', '2026-11-04T15:00:00Z'),
      audio('a2', 'Other sound.m4a', '2026-11-04T15:00:20Z'),
      transcript('t9', 'Lost notes.txt', '2026-11-05T09:00:00Z'),
    ])
    expect(r.created).toHaveLength(2)
    const a = r.created.find((s) => s.videoFileId === 'v1')
    const b = r.created.find((s) => s.videoFileId === 'v2')
    expect(a?.transcriptFileId).toBe('t1')
    expect(b?.media.map((m) => m.fileId)).toEqual(['a2'])
    // A transcript no video claims gives no session.
    expect(r.created.some((s) => s.transcriptFileId === 't9')).toBe(false)
  })

  it('matches by close times in the same group only', () => {
    const r = run([
      video('v1', 'rec.mp4', '2026-11-03T10:00:00Z', 'Week 1'),
      transcript('t1', 'notes.txt', '2026-11-03T10:05:00Z', 'Week 1'),
      transcript('t2', 'other.txt', '2026-11-03T10:00:10Z', 'Week 2'),
    ])
    expect(r.created[0]?.transcriptFileId).toBe('t1')
  })

  it('leaves a transcript alone when two videos match it equally', () => {
    const r = run([
      video('v1', 'a.mp4', '2026-11-03T10:00:00Z'),
      video('v2', 'b.mp4', '2026-11-03T10:00:00Z'),
      transcript('t1', 'notes.txt', '2026-11-03T10:00:00Z'),
    ])
    expect(r.created.every((s) => s.transcriptFileId === null)).toBe(true)
  })

  it('keeps decided sessions and their files, even when the video left', () => {
    const decided = session({
      id: 'd',
      videoFileId: 'gone',
      transcriptFileId: 't1',
      state: 'validated',
      decidedBy: 'u',
    })
    const r = run([transcript('t1', 'Test A.txt'), video('v2', 'Test A.mp4')], [decided])
    expect(r.removed).toEqual([])
    expect(r.created).toHaveLength(1)
    expect(r.created[0]?.transcriptFileId).toBeNull()
  })

  it('removes an undecided session whose video left, and keeps the others with new matches', () => {
    const left = session({ id: 'l', videoFileId: 'gone' })
    const open = session({ id: 'o', videoFileId: 'v1' })
    const r = run(
      [
        video('v1', 'Test B.mp4', '2026-11-03T10:00:00Z'),
        transcript('t1', 'x.txt', '2026-11-03T10:00:10Z'),
      ],
      [left, open],
    )
    expect(r.removed).toEqual(['l'])
    expect(r.created).toEqual([])
    expect(r.transcripts).toEqual([{ id: 'o', transcriptFileId: 't1' }])
  })

  it('keeps the files a person chose while they exist', () => {
    const chosen = session({
      id: 'c',
      videoFileId: 'v1',
      transcriptFileId: 't1',
      media: [{ fileId: 'a1', confidence: null, reason: 'person' }],
      mediaEdited: true,
    })
    const r = run([video('v1', 'v.mp4'), transcript('t1', 't.txt'), audio('a1', 'a.m4a')], [chosen])
    expect(r).toMatchObject({ removed: [], created: [], media: [], transcripts: [] })
  })
})

describe('merging two test sessions (spec 037)', () => {
  it('moves the recordings, attachments and transcript of the absorbed session', () => {
    const target = session({ id: 't', videoFileId: 'v1' })
    const source = session({
      id: 's',
      videoFileId: 'v2',
      transcriptFileId: 't2',
      media: [{ fileId: 'a2', confidence: 'high', reason: 'same-time' }],
      attachments: [{ fileId: 'c2' }],
    })
    const taken = edit(target, { media: ['v2'] }, new Set(['v2']), NOW)
    expect(taken.ok).toBe(true)
    if (!taken.ok) return
    const merged = absorb(taken.value, source, NOW)
    expect(merged.transcriptFileId).toBe('t2')
    expect(merged.media.map((m) => m.fileId)).toEqual(['v2', 'a2'])
    expect(merged.attachments).toEqual([{ fileId: 'c2' }])
  })

  it('keeps the people and title typed on the absorbed session when the target has none', () => {
    const roster = [{ id: 'r1', name: 'Casey Test', role: 'interviewee' as const, memberId: null }]
    const merged = absorb(session({ id: 't' }), session({ id: 's', roster, title: 'Camera' }), NOW)
    expect(merged.roster).toEqual(roster)
    expect(merged.title).toBe('Camera')
  })

  it('never takes a session´s own video as one of its recordings', () => {
    expect(edit(session(), { media: ['v1'] }, new Set(['v1']), NOW)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
  })

  it('does not give up recordings like a lone interview recording', () => {
    expect(givesUpRecordings(session())).toBe(false)
  })
})

describe('protocol version of a session (spec 037 R8)', () => {
  const versions: ProtocolVersionRef[] = [
    { version: 1, savedAt: new Date('2026-11-01T09:00:00Z') },
    { version: 2, savedAt: new Date('2026-11-05T09:00:00Z') },
  ]

  it('is the last version saved on or before the date', () => {
    expect(versionAt(versions, '2026-11-03')).toBe(1)
    expect(versionAt(versions, '2026-11-05')).toBe(2)
    expect(versionAt(versions, '2026-11-04T23:00:00Z')).toBe(1)
  })

  it('takes the video´s time on the session´s day, so a revision later that day is not taken', () => {
    const revised = [...versions, { version: 3, savedAt: new Date('2026-11-05T15:00:00Z') }]
    expect(versionAt(revised, sessionMoment('2026-11-05', '2026-11-05T11:00:00Z'))).toBe(2)
    expect(sessionMoment('2026-11-06', '2026-11-05T11:00:00Z')).toBe('2026-11-06')
    expect(sessionMoment(null, '2026-11-05T11:00:00Z')).toBe('2026-11-05T11:00:00Z')
  })

  it('is the first one before any save, the last one without a date, none without a protocol', () => {
    expect(versionAt(versions, '2026-10-01')).toBe(1)
    expect(versionAt(versions, null)).toBe(2)
    expect(versionAt([], '2026-11-03')).toBeNull()
  })

  it('is chosen by a person among the saved ones, while the session is undecided', () => {
    expect(chooseProtocolVersion(session(), 2, [1, 2], NOW)).toMatchObject({
      ok: true,
      value: { protocolVersion: 2 },
    })
    expect(chooseProtocolVersion(session(), 3, [1, 2], NOW)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(
      chooseProtocolVersion(session({ state: 'validated', decidedBy: 'u' }), 1, [1], NOW),
    ).toEqual({ ok: false, error: 'SESSION_DECIDED' })
  })
})

describe('session readiness (spec 037 FR-012)', () => {
  const ready = {
    state: 'validated' as const,
    videoInFolder: true,
    durationMs: 60_000,
    participants: 1,
    protocolVersion: 1,
  }

  it('is ready when every condition holds', () => {
    expect(readinessOf(ready)).toBe('ready')
  })

  it('names the first condition missing, in order', () => {
    expect(readinessOf({ ...ready, state: 'proposed', videoInFolder: false })).toBe('not-validated')
    expect(readinessOf({ ...ready, videoInFolder: false, durationMs: null })).toBe('video-missing')
    expect(readinessOf({ ...ready, durationMs: null, participants: 0 })).toBe('duration-unknown')
    expect(readinessOf({ ...ready, participants: 0, protocolVersion: null })).toBe(
      'participant-to-confirm',
    )
    expect(readinessOf({ ...ready, protocolVersion: null })).toBe('no-protocol')
  })
})

describe('naming a test session´s files (spec 037 FR-009)', () => {
  it('names the main video like the other files of the session', () => {
    const s = session({
      transcriptFileId: 't1',
      media: [{ fileId: 'a1', confidence: 'high', reason: 'same-time' }],
      analysis: {
        state: 'done',
        failure: null,
        at: NOW,
        by: 'u',
        runId: null,
        usedAi: false,
        filesRead: [],
        proposals: [
          {
            field: 'name',
            value: '2026-11-03 – Casey Test – Robin Sample',
            origin: 'rule',
            quote: null,
            otherDate: null,
            status: 'accepted',
          },
        ],
      },
    } as Partial<Session>)
    const names = expectedNames(s, [
      video('v1', 'rec.mp4'),
      transcript('t1', 'notes.txt'),
      audio('a1', 'sound.m4a'),
    ])
    expect(names?.map((n) => n.next)).toEqual([
      '2026-11-03 – Casey Test – Robin Sample – Transcript.txt',
      '2026-11-03 – Casey Test – Robin Sample – Video.mp4',
      '2026-11-03 – Casey Test – Robin Sample – Audio.m4a',
    ])
  })
})
