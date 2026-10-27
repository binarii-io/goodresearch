import { describe, expect, it } from 'vitest'
import {
  type Analysis,
  decideProposals,
  mergeProposals,
  type Proposal,
  ruleProposals,
} from '../domain/analysis.ts'
import { attachmentCandidates } from '../domain/attachments.ts'
import { expectedNames, fileNamesState } from '../domain/file-names.ts'
import {
  chipNames,
  completeNames,
  findDate,
  matchMembers,
  participantsOf,
  personName,
  speakersOf,
} from '../domain/header-rules.ts'
import type { InventoryFile } from '../domain/inventory-walk.ts'
import { languageOf } from '../domain/language.ts'
import { normalisedBase, renameTargets } from '../domain/normalised-name.ts'
import { assignPseudonyms, nameKey } from '../domain/pseudonyms.ts'
import { fromPlaceholders, normaliseQuote, quoteFound, withPlaceholders } from '../domain/quotes.ts'
import type { Session } from '../domain/session.ts'

const NOW = new Date('2026-10-25T10:00:00Z')

const session = (over: Partial<Session> = {}): Session => ({
  id: 'x',
  studyId: 'study',
  transcriptFileId: 't1',
  media: [],
  mediaEdited: false,
  state: 'validated',
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

const file = (
  id: string,
  name: string,
  kind: InventoryFile['kind'],
  group = 'Root',
  mimeType = kind === 'media' ? 'video/mp4' : 'text/plain',
): InventoryFile => ({
  id,
  name,
  kind,
  group,
  mimeType,
  size: null,
  modifiedAt: '2026-10-21T15:00:00Z',
  webViewLink: `https://drive.example/${id}`,
})

const MEMBERS = [
  { id: 'm1', name: 'Lee Example' },
  { id: 'm2', name: 'Ana Sample' },
]

let n = 0
const newId = () => `r${++n}`

describe('header rules: dates', () => {
  it('reads ISO, day-first and written dates in English and French', () => {
    expect(findDate('Meeting on 2026-10-21 at 15:00')).toBe('2026-10-21')
    expect(findDate('Date : 21/10/2026')).toBe('2026-10-21')
    expect(findDate('21 October 2026')).toBe('2026-10-21')
    expect(findDate('October 21, 2026')).toBe('2026-10-21')
    expect(findDate('mardi 21 octobre 2026')).toBe('2026-10-21')
    expect(findDate('1er décembre 2026')).toBe('2026-12-01')
  })

  it('ignores dates that do not exist and text without a date', () => {
    expect(findDate('31/02/2026')).toBeNull()
    expect(findDate('version 2.10.4')).toBeNull()
  })
})

describe('header rules: people', () => {
  it('reads a participants line written by a meeting tool', () => {
    expect(participantsOf('Transcript\nParticipants: Sam Example, Lee Example\n\nHello')).toEqual([
      'Sam Example',
      'Lee Example',
    ])
    expect(participantsOf('Invités : Camille Test et Ana Sample')).toEqual([
      'Camille Test',
      'Ana Sample',
    ])
    expect(participantsOf('Hello there')).toEqual([])
  })

  it('reads speaker labels, most frequent first, never times or long sentences', () => {
    const text = [
      'Lee Example: Hello, thanks for joining.',
      'Sam Example: Hi.',
      '10:32 the call starts',
      'Lee Example: Shall we start?',
      'This is a very long sentence that keeps going on and on and on: no',
      '<v Sam Example>Sure.',
    ].join('\n')
    expect(speakersOf(text)).toEqual(['Lee Example', 'Sam Example'])
  })

  it('keeps only the person in a speaker label, without company or version', () => {
    expect(personName('Sam EXAMPLE -ACME CORP SOMEWHERE V2-')).toBe('Sam EXAMPLE')
    expect(personName('Lee Example (Acme)')).toBe('Lee Example')
    expect(personName('Ana Sample | Acme')).toBe('Ana Sample')
    expect(personName('Jean-Pierre Martin')).toBe('Jean-Pierre Martin')
    expect(speakersOf('Sam EXAMPLE -ACME CORP V2-: Hello there')).toEqual(['Sam EXAMPLE'])
    expect(speakersOf('Lee Example,: Hello there')).toEqual(['Lee Example'])
    expect(participantsOf('Participants: Sam Example (Acme), Lee Example - Acme')).toEqual([
      'Sam Example',
      'Lee Example',
    ])
  })

  it('reads the invited people of meeting notes, on the line or the lines after', () => {
    expect(participantsOf('Notes\nInvités : Jean Dupont, Martin Lezaire\n\nRésumé')).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
    ])
    expect(participantsOf('Notes\nInvited\nJean Dupont\nMartin Lezaire\n\nSummary')).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
    ])
  })

  it('reads invited people written as chips (no colon) or as e-mail addresses', () => {
    expect(participantsOf('Invités Jean Dupont, Martin Lezaire,')).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
    ])
    expect(participantsOf('Invited: jean.dupont@example.org, Martin Lezaire')).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
    ])
    // Prose is not a list.
    expect(participantsOf('Participants were happy with the session')).toEqual([])
  })

  it('takes the person chips of meeting notes, whatever the heading or language', () => {
    expect(
      chipNames('Guests [[person:Jean Dupont]] [[person:martin.lezaire@example.org]]\nOther'),
    ).toEqual(['Jean Dupont', 'Martin Lezaire'])
    expect(chipNames('No chips here')).toEqual([])
    expect(participantsOf('Guests: Jean Dupont, Martin Lezaire')).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
    ])
  })

  it('completes a first name with the one invited person who has it', () => {
    const invited = ['Jean Dupont', 'Martin Lezaire', 'Jeanne Other']
    expect(completeNames(['Jean', 'Martin', 'Robin'], invited)).toEqual([
      'Jean Dupont',
      'Martin Lezaire',
      'Robin',
    ])
    // Two invited Jean: the first name stays as it is.
    expect(completeNames(['Jean'], ['Jean Dupont', 'Jean Martin'])).toEqual(['Jean'])
    expect(completeNames(['Jean Dupont'], invited)).toEqual(['Jean Dupont'])
  })

  it('makes interviewers of names matching exactly one member', () => {
    expect(matchMembers(['Sam Example', 'Lee', 'Ana Sample'], MEMBERS)).toEqual({
      interviewers: [
        { name: 'Lee Example', memberId: 'm1' },
        { name: 'Ana Sample', memberId: 'm2' },
      ],
      others: ['Sam Example'],
    })
  })

  it('does not link a name two members share', () => {
    const twins = [...MEMBERS, { id: 'm3', name: 'Lee Other' }]
    expect(matchMembers(['Lee'], twins)).toEqual({ interviewers: [], others: ['Lee'] })
  })
})

describe('language', () => {
  it('tells English from French, else other', () => {
    expect(languageOf('So what do you think about the way we work with the team?')).toBe('en')
    expect(
      languageOf(
        "Alors qu'est-ce que vous pensez de la façon dont on travaille avec les équipes ?",
      ),
    ).toBe('fr')
    expect(languageOf('12:00 — ok')).toBe('other')
  })
})

describe('quotes', () => {
  it('compares quotes ignoring case, spaces and apostrophe style', () => {
    expect(normaliseQuote('  It’s   FINE ')).toBe("it's fine")
    expect(quoteFound("Hello, I'm Sam\nExample here", 'i’m sam example')).toBe(true)
    expect(quoteFound('Hello', 'Goodbye')).toBe(false)
    expect(quoteFound('Hello', '')).toBe(false)
    expect(quoteFound('a'.repeat(400), 'a'.repeat(301))).toBe(false)
  })

  it('replaces known names by placeholders, whole words, ignoring accents, and maps back', () => {
    const sent = withPlaceholders('Bonjour Élodie Martin, merci. Elodie, tu es prête ? Elodies', [
      'Elodie Martin',
    ])
    expect(sent.text).toBe('Bonjour [Person 1], merci. [Person 1], tu es prête ? Elodies')
    expect(fromPlaceholders('[Person 1] said', sent.names)).toBe('Elodie Martin said')
  })
})

describe('normalised name', () => {
  it('builds date, interviewees and interviewers', () => {
    expect(
      normalisedBase({
        date: '2026-10-21',
        interviewees: ['Sam Example'],
        interviewers: ['Lee Example', 'Ana Sample'],
      }),
    ).toBe('2026-10-21 – Sam Example – Lee Example & Ana Sample')
    expect(normalisedBase({ date: '2026-10-21', interviewees: ['Sam'], interviewers: [] })).toBe(
      '2026-10-21 – Sam',
    )
    expect(normalisedBase({ date: null, interviewees: ['Sam'], interviewers: [] })).toBeNull()
    expect(normalisedBase({ date: '2026-10-21', interviewees: [], interviewers: [] })).toBeNull()
  })

  it('replaces characters files cannot hold and shortens names to 120 characters', () => {
    expect(normalisedBase({ date: '2026-10-21', interviewees: ['A/B: C'], interviewers: [] })).toBe(
      '2026-10-21 – A-B- C',
    )
    const long = normalisedBase({
      date: '2026-10-21',
      interviewees: ['Very Long Name With Many Words Inside It Really Long'],
      interviewers: ['Another Long Interviewer Name With Words', 'And One More Person Here Too'],
    })
    expect(long?.length).toBeLessThanOrEqual(120)
    expect(long?.startsWith('2026-10-21 – Very')).toBe(true)
  })

  it('names each file with its kind, in the language, numbering two of a kind', () => {
    const targets = renameTargets(
      '2026-10-21 – Sam',
      [
        { fileId: 't', name: 'notes.docx', kind: 'transcript', mimeType: 'text/plain' },
        { fileId: 'v1', name: 'a.mp4', kind: 'media', mimeType: 'video/mp4' },
        { fileId: 'v2', name: 'b.MOV', kind: 'media', mimeType: 'video/quicktime' },
        { fileId: 'a', name: 'c.m4a', kind: 'media', mimeType: 'audio/mp4' },
        {
          fileId: 'x',
          name: 'Sam consent 2026-10-21.pdf',
          kind: 'attachment',
          mimeType: 'application/pdf',
        },
      ],
      'fr',
      ['Sam'],
    )
    expect(targets.map((t) => t.next)).toEqual([
      '2026-10-21 – Sam – Transcription.docx',
      '2026-10-21 – Sam – Vidéo 1.mp4',
      '2026-10-21 – Sam – Vidéo 2.MOV',
      '2026-10-21 – Sam – Audio.m4a',
      '2026-10-21 – Sam – consent.pdf',
    ])
    expect(
      renameTargets(
        'B',
        [{ fileId: 't', name: 'x', kind: 'transcript', mimeType: 'text/plain' }],
        null,
        [],
      )[0]?.next,
    ).toBe('B – Transcript')
  })
})

describe('pseudonyms', () => {
  it('normalises names and assigns codes in date order, after the largest, never reused', () => {
    expect(nameKey('  Élodie   MARTIN ')).toBe('elodie martin')
    const existing = new Map([['sam example', 'P02']])
    expect(
      assignPseudonyms(existing, [
        { key: 'lee', date: '2026-10-22' },
        { key: 'sam example', date: '2026-10-01' },
        { key: 'ana', date: '2026-10-20' },
        { key: 'zoe', date: null },
      ]),
    ).toEqual([
      { key: 'ana', code: 'P03' },
      { key: 'lee', code: 'P04' },
      { key: 'zoe', code: 'P05' },
    ])
  })
  it('numbers interviewers apart, with their own prefix (spec 011)', () => {
    const existing = new Map([
      ['sam example', 'P02'],
      ['interviewer:lee', 'I01'],
    ])
    expect(assignPseudonyms(existing, [{ key: 'interviewer:ana', date: null }], 'I')).toEqual([
      { key: 'interviewer:ana', code: 'I02' },
    ])
  })
})

describe('rule proposals', () => {
  const base = {
    transcriptName: 'Interview.txt',
    mediaNames: [],
    fileDate: '2026-10-25T09:00:00Z',
    planned: null,
    members: MEMBERS,
  }

  it('fills everything from a meeting tool header, without the AI', () => {
    const r = ruleProposals({
      ...base,
      text: 'Transcript\n21 October 2026\nParticipants: Sam Example, Lee Example\nLee Example: Thanks for joining, so what do you think about the way we work?',
    })
    expect(r.needsAi).toBe(false)
    expect(r.interviewees).toEqual({
      value: [{ name: 'Sam Example', memberId: null }],
      origin: 'header',
    })
    expect(r.interviewers).toEqual({
      value: [{ name: 'Lee Example', memberId: 'm1' }],
      origin: 'header',
    })
    expect(r.date).toEqual({ value: '2026-10-21', origin: 'header', otherDate: null })
    expect(r.language).toBe('en')
  })

  it('keeps a different date of the file name aside', () => {
    const r = ruleProposals({
      ...base,
      transcriptName: 'Call - 2026/10/20 15:02 CEST - Transcript',
      text: '21/10/2026\nParticipants: Sam Example, Lee Example',
    })
    expect(r.date).toEqual({ value: '2026-10-21', origin: 'header', otherDate: '2026-10-20' })
  })

  it('takes the date from the file name, then the planned interview, else the file date', () => {
    expect(
      ruleProposals({ ...base, transcriptName: 'x 2026-10-19.txt', text: 'hello' }).date?.origin,
    ).toBe('file-name')
    const planned = {
      interviewee: 'Sam Example',
      interviewers: 'Lee Example',
      scheduledAt: '2026-10-18T10:00:00Z',
    }
    const p = ruleProposals({ ...base, planned, text: 'hello' })
    expect(p.date).toEqual({ value: '2026-10-18', origin: 'planned', otherDate: null })
    expect(p.interviewees?.origin).toBe('planned')
    expect(p.interviewers?.value).toEqual([{ name: 'Lee Example', memberId: 'm1' }])
    expect(ruleProposals({ ...base, text: 'hello' }).date).toEqual({
      value: '2026-10-25',
      origin: 'file-date',
      otherDate: null,
    })
  })

  it('calls the AI when people are missing or cannot be told apart', () => {
    expect(ruleProposals({ ...base, text: '21/10/2026 hello' }).needsAi).toBe(true)
    const two = ruleProposals({
      ...base,
      text: '21/10/2026\nSam Example: hi\nCamille Test: hello',
    })
    expect(two.needsAi).toBe(true)
    expect(two.interviewees).toBeNull()
    const one = ruleProposals({ ...base, text: '21/10/2026\nSam Example: hi\nLee: hello' })
    expect(one.needsAi).toBe(false)
    expect(one.interviewees?.origin).toBe('speakers')
  })

  it('never takes the only speaker found for the interviewee: interviewers often speak first', () => {
    const r = ruleProposals({
      ...base,
      text: '21/10/2026\nRobin Sample: Thanks for joining, let me present the study and how we use the data.',
    })
    expect(r.interviewees).toBeNull()
    expect(r.needsAi).toBe(true)
  })

  it('tells roles apart with the linked planned interview', () => {
    const planned = { interviewee: 'Casey Test', interviewers: '', scheduledAt: null }
    const r = ruleProposals({
      ...base,
      planned,
      text: '21/10/2026\nRobin Sample: So, tell me about your week.\nCasey: I plan it on Sunday.',
    })
    expect(r.interviewees).toEqual({
      value: [{ name: 'Casey', memberId: null }],
      origin: 'speakers',
    })
    expect(r.interviewers).toEqual({
      value: [{ name: 'Robin Sample', memberId: null }],
      origin: 'speakers',
    })
    expect(r.needsAi).toBe(false)
  })

  it('completes first names with the invited people of the meeting notes', () => {
    const r = ruleProposals({
      ...base,
      invited: ['Sam Example', 'Lee Example'],
      text: '21/10/2026\nLee: Thanks for joining, shall we start?\nSam: Sure, I plan the week on Sunday.\nLee: Why Sunday?',
    })
    expect(r.interviewers).toEqual({
      value: [{ name: 'Lee Example', memberId: 'm1' }],
      origin: 'speakers',
    })
    expect(r.interviewees).toEqual({
      value: [{ name: 'Sam Example', memberId: null }],
      origin: 'speakers',
    })
  })

  it('never needs the AI without a transcript', () => {
    expect(ruleProposals({ ...base, text: null }).needsAi).toBe(false)
  })
})

const proposal = (p: Partial<Proposal> & Pick<Proposal, 'field' | 'value'>): Proposal =>
  ({ origin: 'header', quote: null, otherDate: null, status: 'proposed', ...p }) as Proposal

describe('merging and deciding proposals', () => {
  it('keeps decided proposals and never proposes a rejected value again', () => {
    const previous = [
      proposal({ field: 'date', value: '2026-10-21', status: 'rejected' }),
      proposal({ field: 'language', value: 'en', status: 'accepted' }),
      proposal({ field: 'interviewees', value: [{ name: 'Sam', memberId: null }] }),
    ]
    const next = [
      proposal({ field: 'date', value: '2026-10-21' }),
      proposal({ field: 'language', value: 'fr' }),
      proposal({ field: 'interviewees', value: [{ name: 'Lee', memberId: null }] }),
    ]
    expect(mergeProposals(previous, next).map((p) => [p.field, p.value, p.status])).toEqual([
      ['date', '2026-10-21', 'rejected'],
      ['language', 'en', 'accepted'],
      ['interviewees', [{ name: 'Lee', memberId: null }], 'proposed'],
    ])
  })

  const analyzed = (proposals: Proposal[]): Session =>
    session({
      roster: [{ id: 'keep', name: 'Sam Example', role: 'interviewee', memberId: null }],
      analysis: {
        state: 'done',
        failure: null,
        runId: null,
        by: 'me',
        at: NOW,
        filesRead: [],
        usedAi: false,
        proposals,
      } satisfies Analysis,
    })

  it('accepts people into the roster, keeping ids, and sets date, language and title', () => {
    const s = analyzed([
      proposal({ field: 'interviewees', value: [{ name: 'Sam Example', memberId: null }] }),
      proposal({ field: 'interviewers', value: [{ name: 'Lee Example', memberId: 'm1' }] }),
      proposal({ field: 'date', value: '2026-10-21' }),
      proposal({ field: 'language', value: 'en' }),
      proposal({ field: 'name', value: 'old' }),
    ])
    const r = decideProposals(
      s,
      [
        { field: 'interviewees', action: 'accept' },
        { field: 'interviewers', action: 'accept' },
        { field: 'date', action: 'accept' },
        { field: 'language', action: 'accept' },
        { field: 'name', action: 'accept' },
      ],
      { anonymised: false, pseudonyms: new Map(), available: new Set(), now: NOW, newId },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.roster).toEqual([
      { id: 'keep', name: 'Sam Example', role: 'interviewee', memberId: null },
      expect.objectContaining({ name: 'Lee Example', role: 'interviewer', memberId: 'm1' }),
    ])
    expect(r.value.interviewDate).toBe('2026-10-21')
    expect(r.value.language).toBe('en')
    // The name follows the values accepted in the same decision.
    expect(r.value.title).toBe('2026-10-21 – Sam Example – Lee Example')
    expect(r.value.analysis?.proposals.every((p) => p.status === 'accepted')).toBe(true)
  })

  it('uses pseudonyms in the name when the study is anonymised', () => {
    const s = analyzed([proposal({ field: 'name', value: 'x' })])
    const r = decideProposals(
      { ...s, interviewDate: '2026-10-21' },
      [{ field: 'name', action: 'accept' }],
      {
        anonymised: true,
        pseudonyms: new Map([['sam example', 'P01']]),
        available: new Set(),
        now: NOW,
        newId,
      },
    )
    expect(r.ok && r.value.title).toBe('2026-10-21 – P01')
  })

  it('takes an edited value, rejects, and refuses unknown or invalid decisions', () => {
    const s = analyzed([
      proposal({ field: 'date', value: '2026-10-21' }),
      proposal({ field: 'language', value: 'en' }),
    ])
    const ctx = {
      anonymised: false,
      pseudonyms: new Map(),
      available: new Set<string>(),
      now: NOW,
      newId,
    }
    const r = decideProposals(
      s,
      [
        { field: 'date', action: 'edit', value: '2026-10-22' },
        { field: 'language', action: 'reject' },
      ],
      ctx,
    )
    expect(r.ok && r.value.interviewDate).toBe('2026-10-22')
    expect(r.ok && r.value.language).toBeNull()
    expect(r.ok && r.value.analysis?.proposals.map((p) => p.status)).toEqual(['edited', 'rejected'])
    expect(decideProposals(s, [{ field: 'name', action: 'accept' }], ctx)).toEqual({
      ok: false,
      error: 'PROPOSAL_NOT_FOUND',
    })
    expect(
      decideProposals(s, [{ field: 'date', action: 'edit', value: '2026-02-31' }], ctx).ok,
    ).toBe(false)
    expect(
      decideProposals(
        { ...s, state: 'validated', decidedBy: 'someone' },
        [{ field: 'date', action: 'accept' }],
        ctx,
      ),
    ).toEqual({ ok: false, error: 'SESSION_DECIDED' })
  })

  it('adds an accepted attachment only while it is free', () => {
    const s = analyzed([
      proposal({ field: 'attachment', value: { fileId: 'f1', reason: 'shared-word:consent' } }),
    ])
    const decision = [{ field: 'attachment' as const, fileId: 'f1', action: 'accept' as const }]
    const ctx = { anonymised: false, pseudonyms: new Map(), now: NOW, newId }
    const r = decideProposals(s, decision, { ...ctx, available: new Set(['f1']) })
    expect(r.ok && r.value.attachments).toEqual([{ fileId: 'f1', label: null }])
    expect(decideProposals(s, decision, { ...ctx, available: new Set() })).toEqual({
      ok: false,
      error: 'MEDIA_UNAVAILABLE',
    })
  })
})

describe('attachments', () => {
  it('proposes other files of the group sharing the meeting title or a rare word', () => {
    const files = [
      file('t', 'Interview Sam Example.txt', 'transcript', 'Week 1'),
      file('c', 'Sam Example consent.pdf', 'other', 'Week 1', 'application/pdf'),
      file('o', 'Budget.xlsx', 'other', 'Week 1', 'application/vnd.ms-excel'),
      file('w', 'Sam Example slides.pdf', 'other', 'Week 2', 'application/pdf'),
      file('h', 'Sam Example held.pdf', 'other', 'Week 1', 'application/pdf'),
    ]
    expect(attachmentCandidates(session({ transcriptFileId: 't' }), files, new Set(['h']))).toEqual(
      [{ fileId: 'c', reason: 'shared-word:example' }],
    )
  })
})

describe('file names in Drive follow the accepted name (spec 009 FR-028)', () => {
  const files = [
    file('t', 'Interview Sam Example.txt', 'transcript'),
    file('v', 'Interview Sam Example.mp4', 'media'),
  ]
  const named = (proposals: Proposal[]) =>
    session({
      transcriptFileId: 't',
      media: [{ fileId: 'v', confidence: 'high', reason: 'same-time' }],
      analysis: {
        state: 'done',
        failure: null,
        runId: null,
        by: 'me',
        at: NOW,
        filesRead: [],
        usedAi: false,
        proposals,
      },
    })

  it('says nothing until a name is accepted', () => {
    expect(
      fileNamesState(named([proposal({ field: 'name', value: '2026-10-21 – Sam' })]), files),
    ).toBeNull()
  })

  it('counts the files whose name in Drive differs from the accepted name', () => {
    const s = named([proposal({ field: 'name', value: '2026-10-21 – Sam', status: 'accepted' })])
    expect(fileNamesState(s, files)).toEqual({ inSync: false, differing: 2 })
    const renamed = [
      file('t', '2026-10-21 – Sam – Transcript.txt', 'transcript'),
      file('v', '2026-10-21 – Sam – Video.mp4', 'media'),
    ]
    expect(fileNamesState(s, renamed)).toEqual({ inSync: true, differing: 0 })
    // Someone renamed the video in Drive afterwards: no longer in sync.
    const drifted = [renamed[0] as InventoryFile, file('v', 'my video.mp4', 'media')]
    expect(fileNamesState(s, drifted)).toEqual({ inSync: false, differing: 1 })
  })
})

describe('attachment names stay stable across renames (review of PR #9)', () => {
  it('keeps the label taken from the original name, whatever the base', () => {
    const s = session({
      transcriptFileId: 't',
      attachments: [{ fileId: 'a', label: 'Consent form' }],
      analysis: {
        state: 'done',
        failure: null,
        runId: null,
        by: 'me',
        at: NOW,
        filesRead: [],
        usedAi: false,
        proposals: [
          proposal({ field: 'name', value: '2026-01-02 – P01 – Ana Member', status: 'accepted' }),
        ],
      },
    })
    const first = [
      file('t', 'x.txt', 'transcript'),
      file('a', 'Consent form.pdf', 'other', 'Root', 'application/pdf'),
    ]
    const once = expectedNames(s, first)
    expect(once?.map((f) => f.next)).toEqual([
      '2026-01-02 – P01 – Ana Member – Transcript.txt',
      '2026-01-02 – P01 – Ana Member – Consent form.pdf',
    ])
    // After the rename, the next plan gives the same names: nothing grows, all in sync.
    const renamed = first.map((f, i) => ({ ...f, name: once?.[i]?.next ?? f.name }))
    expect(expectedNames(s, renamed)?.map((f) => f.next)).toEqual(once?.map((f) => f.next))
    expect(fileNamesState(s, renamed)).toEqual({ inSync: true, differing: 0 })
  })
})
