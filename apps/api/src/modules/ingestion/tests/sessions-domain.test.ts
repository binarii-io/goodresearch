import { describe, expect, it } from 'vitest'
import { hasTranscriptTab } from '../domain/classify.ts'
import { fileWords, meetingOf, rareWords } from '../domain/file-words.ts'
import type { InventoryFile } from '../domain/inventory-walk.ts'
import { suggestLink } from '../domain/link-suggestion.ts'
import { confidenceOf, matchMedia } from '../domain/media-matching.ts'
import { reconcileSessions } from '../domain/reconcile-sessions.ts'
import { decide, edit, prefillRoster, rosterOf, type Session } from '../domain/session.ts'

const NOW = new Date('2026-10-25T10:00:00Z')

const file = (
  id: string,
  name: string,
  kind: InventoryFile['kind'],
  modifiedAt: string | null = null,
  group = 'Root',
): InventoryFile => ({
  id,
  name,
  kind,
  group,
  mimeType: kind === 'media' ? 'video/mp4' : 'text/plain',
  size: null,
  modifiedAt,
  webViewLink: `https://drive.example/${id}`,
})

let counter = 0
const newId = () => `s${++counter}`

const session = (over: Partial<Session> = {}): Session => ({
  id: 'x',
  studyId: 'study',
  transcriptFileId: 't1',
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

describe('file words', () => {
  it('drops the extension, numbers, short and common words, and accents', () => {
    expect([...fileWords('Entretien Élodie 2026-10-21 v2 - transcript.docx')]).toEqual(['elodie'])
  })

  it('finds the words of at most three files', () => {
    const names = [
      'alpha one.txt',
      'alpha two.txt',
      'alpha three.txt',
      'alpha beta.mp4',
      'beta.txt',
    ]
    expect([...rareWords(names)].sort()).toEqual(['beta', 'one', 'three', 'two'])
  })
})

describe('media matching (context map policy)', () => {
  const rare = new Set(['camille'])
  const t = file('t', 'Camille.txt', 'transcript', '2026-10-21T10:00:00Z')

  it('gives high for the same time, medium within 15 minutes or a shared rare word', () => {
    expect(confidenceOf(t, file('m', 'rec.mp4', 'media', '2026-10-21T10:00:30Z'), rare)).toEqual({
      confidence: 'high',
      reason: 'same-time',
    })
    expect(
      confidenceOf(t, file('m', 'rec.mp4', 'media', '2026-10-21T10:12:00Z'), rare)?.confidence,
    ).toBe('medium')
    expect(
      confidenceOf(t, file('m', 'Camille call.mp4', 'media', '2026-10-21T16:00:00Z'), rare),
    ).toEqual({
      confidence: 'medium',
      reason: 'shared-word:camille',
    })
  })

  it('gives low for a shared rare word without dates, never across days or groups', () => {
    expect(
      confidenceOf({ ...t, modifiedAt: null }, file('m', 'Camille call.mp4', 'media'), rare)
        ?.confidence,
    ).toBe('low')
    expect(
      confidenceOf(t, file('m', 'Camille call.mp4', 'media', '2026-10-22T10:00:00Z'), rare),
    ).toBeNull()
    expect(
      confidenceOf(
        t,
        file('m', 'Camille call.mp4', 'media', '2026-10-21T10:00:00Z', 'Other'),
        rare,
      ),
    ).toBeNull()
  })

  it('leaves a recording unmatched when two transcripts are equally good', () => {
    const a = file('a', 'One.txt', 'transcript', '2026-10-21T10:00:00Z')
    const b = file('b', 'Two.txt', 'transcript', '2026-10-21T10:00:00Z')
    const m = file('m', 'rec.mp4', 'media', '2026-10-21T10:00:10Z')
    const result = matchMedia(
      [
        { key: 'a', file: a },
        { key: 'b', file: b },
      ],
      [m],
      [a, b, m],
    )
    expect(result.get('a')).toEqual([])
    expect(result.get('b')).toEqual([])
  })
})

describe('reconcile sessions after an inventory (FR-002)', () => {
  const files = [
    file('t1', 'Interview Camille.txt', 'transcript', '2026-10-20T10:00:00Z'),
    file('t2', 'Interview Dana.txt', 'transcript', '2026-10-21T10:00:00Z'),
    file('m1', 'Camille call.mp4', 'media', '2026-10-20T10:00:00Z'),
  ]

  it('proposes one session per transcript, newest first, with its recordings', () => {
    const r = reconcileSessions({ studyId: 'study', files, sessions: [], now: NOW, newId })
    expect(r.created.map((s) => s.transcriptFileId)).toEqual(['t2', 't1'])
    expect(r.created.find((s) => s.transcriptFileId === 't1')?.media).toEqual([
      { fileId: 'm1', confidence: 'high', reason: 'same-time' },
    ])
  })

  it('never changes decided sessions and removes proposed ones whose transcript is gone', () => {
    const validated = session({
      id: 'v',
      transcriptFileId: 't1',
      state: 'validated',
      decidedBy: 'alice',
      media: [],
    })
    const orphan = session({ id: 'o', transcriptFileId: 'gone' })
    const r = reconcileSessions({
      studyId: 'study',
      files,
      sessions: [validated, orphan],
      now: NOW,
      newId,
    })
    expect(r.removed).toEqual(['o'])
    expect(r.media).toEqual([])
    // m1 is not taken by the validated session (it has none) and does not match t2 (other day):
    // it gets a row of its own, without transcript.
    expect(r.created.map((s) => [s.transcriptFileId, s.media.map((m) => m.fileId)])).toEqual([
      ['t2', []],
      [null, ['m1']],
    ])
  })

  it('keeps recordings a person chose, and never gives away a decided session’s recordings', () => {
    const decided = session({
      id: 'd',
      transcriptFileId: 't2',
      state: 'excluded',
      decidedBy: 'alice',
      media: [{ fileId: 'm1', confidence: null, reason: 'person' }],
    })
    const chosen = session({ id: 'c', transcriptFileId: 't1', mediaEdited: true, media: [] })
    const r = reconcileSessions({
      studyId: 'study',
      files,
      sessions: [decided, chosen],
      now: NOW,
      newId,
    })
    expect(r.created).toEqual([])
    expect(r.media).toEqual([])
  })

  it('stops at 500 sessions per study', () => {
    const many = Array.from({ length: 502 }, (_, i) =>
      file(`t${i}`, `T${i}.txt`, 'transcript', null),
    )
    const r = reconcileSessions({ studyId: 'study', files: many, sessions: [], now: NOW, newId })
    expect(r.created).toHaveLength(500)
  })
})

describe('link suggestion (FR-005)', () => {
  const planned = [
    { id: 'sam', interviewee: 'Sam Example', scheduledAt: '2026-10-20T09:00:00Z' },
    { id: 'lee', interviewee: 'Lee Example', scheduledAt: '2026-10-21T09:00:00Z' },
  ]

  it('suggests by name, the one sharing the most words', () => {
    expect(suggestLink({ name: 'Interview Sam Example.txt', modifiedAt: null }, planned)).toEqual({
      plannedInterviewId: 'sam',
      rule: 'name',
    })
  })

  it('spec 009: suggests by the people found in the transcript first, whatever the file name', () => {
    expect(
      suggestLink({ name: 'GMT20261021-call.txt', modifiedAt: null }, planned, {
        names: ['Lee Example'],
        date: null,
      }),
    ).toEqual({ plannedInterviewId: 'lee', rule: 'transcript' })
    // A first name alone is enough when only one planned interviewee has it.
    expect(
      suggestLink({ name: 'x.txt', modifiedAt: null }, planned, { names: ['Sam'], date: null }),
    ).toEqual({ plannedInterviewId: 'sam', rule: 'transcript' })
    // The interview date found in the transcript beats the file's date for the date rule.
    expect(
      suggestLink({ name: 'x.txt', modifiedAt: '2026-10-01T10:00:00Z' }, planned, {
        names: [],
        date: '2026-10-21',
      }),
    ).toEqual({ plannedInterviewId: 'lee', rule: 'date' })
  })

  it('suggests nothing when two names are equally close and no date decides', () => {
    expect(suggestLink({ name: 'Example.txt', modifiedAt: null }, planned)).toBeNull()
  })

  it('suggests by date only when one planned interview is within 24 hours', () => {
    expect(suggestLink({ name: 'notes.txt', modifiedAt: '2026-10-21T20:00:00Z' }, planned)).toEqual(
      {
        plannedInterviewId: 'lee',
        rule: 'date',
      },
    )
    expect(
      suggestLink({ name: 'notes.txt', modifiedAt: '2026-10-20T21:00:00Z' }, planned),
    ).toBeNull()
  })
})

describe('session decisions and edits (FR-007, FR-008)', () => {
  it('validates, excludes with a reason, and reopens', () => {
    const v = decide(session(), 'validate', 'alice', NOW)
    expect(v.ok && v.value.state).toBe('validated')
    expect(v.ok && v.value.decidedBy).toBe('alice')
    const e = decide(session(), 'exclude', 'alice', NOW, '  a test  ')
    expect(e.ok && e.value.excludedReason).toBe('a test')
    if (!v.ok) throw new Error('fixture')
    expect(decide(v.value, 'validate', 'bob', NOW)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    })
    const r = decide(v.value, 'reopen', 'bob', NOW)
    expect(r.ok && r.value.state).toBe('proposed')
    expect(r.ok && r.value.decidedBy).toBeNull()
  })

  it('edits only proposed sessions, with recordings that are free', () => {
    const s = session()
    expect(
      edit(session({ state: 'validated', decidedBy: 'alice' }), { title: 'x' }, new Set(), NOW),
    ).toEqual({
      ok: false,
      error: 'SESSION_DECIDED',
    })
    expect(edit(s, { media: ['m9'] }, new Set(['m1']), NOW)).toEqual({
      ok: false,
      error: 'MEDIA_UNAVAILABLE',
    })
    const done = edit(s, { title: '  ', media: ['m1'] }, new Set(['m1']), NOW)
    expect(done.ok && done.value.title).toBeNull()
    expect(done.ok && done.value.media).toEqual([
      { fileId: 'm1', confidence: null, reason: 'person' },
    ])
    expect(done.ok && done.value.mediaEdited).toBe(true)
  })

  it('keeps roster ids and checks names', () => {
    const current = [{ id: 'r1', name: 'Sam', role: 'interviewee' as const, memberId: null }]
    const r = rosterOf(
      [
        { id: 'r1', name: 'Sam E.', role: 'interviewee' },
        { name: 'Ana', role: 'interviewer', memberId: 'm-ana' },
      ],
      current,
      () => 'r2',
    )
    expect(r.ok && r.value.map((e) => e.id)).toEqual(['r1', 'r2'])
    expect(rosterOf([{ name: ' ', role: 'interviewee' }], [], newId).ok).toBe(false)
  })

  it('prefills the people from a planned interview', () => {
    expect(
      prefillRoster({ interviewee: 'Sam Example', interviewers: 'Ana, Bo & Cy' }, newId).map(
        (r) => [r.name, r.role],
      ),
    ).toEqual([
      ['Sam Example', 'interviewee'],
      ['Ana', 'interviewer'],
      ['Bo', 'interviewer'],
      ['Cy', 'interviewer'],
    ])
  })
})

describe('review of PR #8', () => {
  it('falls back to the date rule when two names are equally close', () => {
    const planned = [
      { id: 'sam', interviewee: 'Sam Example', scheduledAt: '2026-10-10T09:00:00Z' },
      { id: 'lee', interviewee: 'Lee Example', scheduledAt: '2026-10-21T09:00:00Z' },
    ]
    expect(
      suggestLink({ name: 'Example.txt', modifiedAt: '2026-10-21T10:00:00Z' }, planned),
    ).toEqual({
      plannedInterviewId: 'lee',
      rule: 'date',
    })
  })

  it('never pairs files of different days, even minutes apart around midnight', () => {
    const t = file('t', 'One.txt', 'transcript', '2026-10-21T23:55:00Z')
    expect(
      confidenceOf(t, file('m', 'rec.mp4', 'media', '2026-10-22T00:05:00Z'), new Set()),
    ).toBeNull()
  })

  it('recordings sent back unchanged are not a person’s choice', () => {
    const s = session({ media: [{ fileId: 'm1', confidence: 'high', reason: 'same-time' }] })
    const kept = edit(s, { title: 'New', media: ['m1'] }, new Set(['m1']), NOW)
    expect(kept.ok && kept.value.mediaEdited).toBe(false)
    expect(kept.ok && kept.value.media).toEqual(s.media)
  })
})

describe('recordings without transcript and meeting notes', () => {
  const rec = file('m9', 'Lone call.mp4', 'media', '2026-10-25T10:00:00Z')

  it('keeps a lone recording’s row across inventories, and drops it once a transcript claims it', () => {
    const first = reconcileSessions({
      studyId: 'study',
      files: [rec],
      sessions: [],
      now: NOW,
      newId,
    })
    const lone = first.created[0]
    if (!lone) throw new Error('fixture')
    expect(lone).toMatchObject({
      transcriptFileId: null,
      media: [{ fileId: 'm9', reason: 'alone' }],
    })
    const again = reconcileSessions({
      studyId: 'study',
      files: [rec],
      sessions: [lone],
      now: NOW,
      newId,
    })
    expect(again).toEqual({ created: [], removed: [], media: [] })
    const transcript = file('t9', 'Lone call.txt', 'transcript', '2026-10-25T10:00:10Z')
    const claimed = reconcileSessions({
      studyId: 'study',
      files: [rec, transcript],
      sessions: [lone],
      now: NOW,
      newId,
    })
    expect(claimed.removed).toEqual([lone.id])
    expect(claimed.created.map((s) => [s.transcriptFileId, s.media.map((m) => m.fileId)])).toEqual([
      ['t9', ['m9']],
    ])
  })

  it('keeps a row without transcript that a person worked on', () => {
    const worked = session({
      id: 'w',
      transcriptFileId: null,
      title: 'Call with Sam',
      media: [{ fileId: 'm9', confidence: null, reason: 'alone' }],
    })
    const transcript = file('t9', 'Lone call.txt', 'transcript', '2026-10-25T10:00:10Z')
    const r = reconcileSessions({
      studyId: 'study',
      files: [rec, transcript],
      sessions: [worked],
      now: NOW,
      newId,
    })
    expect(r.removed).toEqual([])
    expect(r.created.map((s) => s.media)).toEqual([[]])
  })

  it('a document is an interview file only with a transcript tab', () => {
    expect(hasTranscriptTab(['Notes', 'Transcript'])).toBe(true)
    expect(hasTranscriptTab(['Notes', 'Transcription'])).toBe(true)
    expect(hasTranscriptTab(['Notes'])).toBe(false)
    expect(hasTranscriptTab(['Tab 1'])).toBe(false)
  })
})

describe('validated by the app (spec 008)', () => {
  it('spec 009 FR-020: every interview waits for a person, with or without transcript', () => {
    const r = reconcileSessions({
      studyId: 'study',
      files: [
        file('t', 'Call.txt', 'transcript', '2026-10-20T10:00:00Z'),
        file('m', 'Other.mp4', 'media', '2026-10-22T10:00:00Z'),
      ],
      sessions: [],
      now: NOW,
      newId,
    })
    expect(r.created.map((s) => [s.transcriptFileId, s.state, s.decidedBy])).toEqual([
      ['t', 'proposed', null],
      [null, 'proposed', null],
    ])
  })

  it('stays open to changes until a person decides', () => {
    const app = session({ state: 'validated', decidedBy: null })
    expect(edit(app, { title: 'x' }, new Set(), NOW).ok).toBe(true)
    const confirmed = decide(app, 'validate', 'alice', NOW)
    expect(confirmed.ok && confirmed.value.decidedBy).toBe('alice')
    const undone = decide(app, 'reopen', 'alice', NOW)
    expect(undone.ok && undone.value.state).toBe('proposed')
  })
})

describe('the same meeting in file names', () => {
  it('reads the title and the time written in Meet names', () => {
    const notes = meetingOf('Herve / Anne - 2026/10/21 15:02 CEST - Notes par Gemini')
    const recording = meetingOf('Herve / Anne - 2026/10/21 15:02 CEST - Recording')
    expect(notes).toEqual(recording)
    expect(meetingOf('Herve / Anne - 2026_10_21 15_03 CEST - Transcript 2.docx').title).toBe(
      notes.title,
    )
    expect(meetingOf('Call with Lee - Recording.mp4')).toEqual(
      meetingOf('Call with Lee - Transcript.docx'),
    )
  })

  it('pairs a recording and its notes uploaded on another day', () => {
    const notes = file(
      't',
      'Herve / Anne - 2026/10/21 15:02 CEST - Notes par Gemini',
      'transcript',
      '2026-10-21T14:00:00Z',
    )
    const rec = file(
      'm',
      'Herve / Anne - 2026/10/21 15:02 CEST - Recording',
      'media',
      '2026-10-22T09:00:00Z',
    )
    expect(confidenceOf(notes, rec, new Set())).toEqual({
      confidence: 'high',
      reason: 'same-meeting',
    })
    const other = file(
      'm2',
      'Herve / Anne - 2026/10/28 15:02 CEST - Recording',
      'media',
      '2026-10-28T15:00:00Z',
    )
    expect(confidenceOf(notes, other, new Set())).toBeNull()
  })

  it('prefers the same meeting over another file saved at the same time', () => {
    const own = file(
      't1',
      'Lee - 2026/10/21 15:02 CEST - Notes by Gemini',
      'transcript',
      '2026-10-21T14:00:00Z',
    )
    const other = file(
      't2',
      'Kim - 2026/10/21 14:00 CEST - Notes by Gemini',
      'transcript',
      '2026-10-21T14:30:00Z',
    )
    const rec = file(
      'm',
      'Lee - 2026/10/21 15:02 CEST - Recording',
      'media',
      '2026-10-21T14:30:20Z',
    )
    const matched = matchMedia(
      [
        { key: 'own', file: own },
        { key: 'other', file: other },
      ],
      [rec],
      [own, other, rec],
    )
    expect(matched.get('own')?.map((m) => m.reason)).toEqual(['same-meeting'])
  })

  it('without a time in the names, pairs only a title that says something, days apart at most', () => {
    const generic = file('t', 'Interview - Transcript.docx', 'transcript', '2026-10-01T10:00:00Z')
    expect(
      confidenceOf(generic, file('m', 'Interview.mp4', 'media', '2026-10-01T18:00:00Z'), new Set())
        ?.reason,
    ).not.toBe('same-meeting')
    const named = file(
      't2',
      'Call with Lee - Transcript.docx',
      'transcript',
      '2026-10-01T10:00:00Z',
    )
    expect(
      confidenceOf(
        named,
        file('m2', 'Call with Lee - Recording.mp4', 'media', '2026-10-02T09:00:00Z'),
        new Set(),
      ),
    ).toEqual({ confidence: 'high', reason: 'same-meeting' })
    expect(
      confidenceOf(
        named,
        file('m3', 'Call with Lee - Recording.mp4', 'media', '2026-12-02T09:00:00Z'),
        new Set(),
      ),
    ).toBeNull()
  })
})

describe('the limit of 500 interviews counts rows without transcript', () => {
  it('never goes beyond 500, transcripts first', () => {
    const transcripts = Array.from({ length: 450 }, (_, i) =>
      file(`t${i}`, `T${i}.txt`, 'transcript', null),
    )
    const recordings = Array.from({ length: 100 }, (_, i) =>
      file(`m${i}`, `R${i}.mp4`, 'media', `2026-0${(i % 9) + 1}-1${i % 9}T10:00:00Z`),
    )
    const r = reconcileSessions({
      studyId: 'study',
      files: [...transcripts, ...recordings],
      sessions: [],
      now: NOW,
      newId,
    })
    expect(r.created).toHaveLength(500)
    expect(r.created.filter((x) => x.transcriptFileId !== null)).toHaveLength(450)
  })
})
