import { ok } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeInterviewWork } from '../application/commands/interview-work.ts'

const ada = { id: 'ada', role: 'member' as const }
const proposal = (field: string, text: string | null, more: object = {}) => ({
  field,
  text,
  people: null,
  attachment: null,
  otherDate: null,
  status: 'proposed',
  ...more,
})
let view: Record<string, unknown>
let accepted: unknown[]
let decided: unknown[]
let failOn: string | null

const session = (id: string, over: object = {}) => ({
  id,
  state: 'proposed',
  title: id,
  defaultTitle: id,
  transcript: {},
  version: 3,
  analysis: {
    proposals: [
      proposal('date', '2026-10-23', { otherDate: '2026-10-24' }),
      proposal('attachment', null, { attachment: { fileId: 'doc', name: 'Notes' } }),
      proposal('language', 'fr', { status: 'accepted' }),
    ],
  },
  ...over,
})

const work = () =>
  makeInterviewWork({
    queries: { fieldwork: async () => ok(view) } as never,
    analysis: {
      decide: async (c: { sessionId: string }) => {
        accepted.push(c)
        return c.sessionId === failOn ? { ok: false, error: 'VERSION_CONFLICT' } : ok({ id: 'x' })
      },
    } as never,
    sessions: {
      decide: async (c: { sessionId: string }) => {
        if (c.sessionId === failOn) throw new Error('down')
        decided.push(c)
        return ok({ id: 'x' })
      },
    } as never,
  })

beforeEach(() => {
  view = { anonymised: false, run: null, sessions: [session('a'), session('b')] }
  accepted = []
  decided = []
  failOn = null
})

describe('spec 025 US3 — accepting suggestions', () => {
  it('builds its lines from the undecided suggestions, only those asked', async () => {
    expect(
      await work().prepare(ada, 's1', 'suggestions', [
        { interviewId: 'a', fields: ['attachment'] },
      ]),
    ).toMatchObject({
      ok: true,
      value: { lines: [{ field: 'attachment', fileId: 'doc', value: 'Notes', flag: null }] },
    })
  })

  it('flags a date found elsewhere', async () => {
    const all = await work().prepare(ada, 's1', 'suggestions', [{ interviewId: 'a' }])
    expect(all).toMatchObject({
      value: { lines: [{ field: 'date', flag: 'other-date:2026-10-24' }, { field: 'attachment' }] },
    })
  })

  it('refuses a run in progress, an unknown interview, and an anonymised study', async () => {
    const prepare = () => work().prepare(ada, 's1', 'suggestions', [{ interviewId: 'a' }])
    view = { ...view, run: { state: 'running' } }
    expect(await prepare()).toEqual({ ok: false, error: 'ANALYSIS_RUNNING' })
    view = { ...view, run: null, anonymised: true }
    expect(await prepare()).toEqual({ ok: false, error: 'STUDY_ANONYMISED' })
    view = { ...view, anonymised: false }
    expect(await work().prepare(ada, 's1', 'suggestions', [{ interviewId: 'x' }])).toEqual({
      ok: false,
      error: 'INTERVIEW_NOT_FOUND',
    })
  })

  it('leaves alone an interview a person decided', async () => {
    view = { ...view, sessions: [session('a', { state: 'validated' })] }
    expect(await work().prepare(ada, 's1', 'suggestions', [{ interviewId: 'a' }])).toEqual({
      ok: false,
      error: 'NOTHING_TO_DECIDE',
    })
  })

  it('accepts only what is ticked, by interview, and leaves the rest to decide', async () => {
    const prepared = await work().prepare(ada, 's1', 'suggestions', [
      { interviewId: 'a' },
      { interviewId: 'b', fields: ['date'] },
    ])
    if (!prepared.ok) throw new Error(prepared.error)
    expect(
      await work().apply(ada, 's1', 'suggestions', prepared.value.lines, new Set([0]), new Map()),
    ).toEqual({ ok: true, value: { outcomes: ['skipped', 'done', 'done'] } })
    expect(accepted).toMatchObject([
      {
        sessionId: 'a',
        version: 3,
        decisions: [{ field: 'attachment', fileId: 'doc', action: 'accept' }],
      },
      { sessionId: 'b', decisions: [{ field: 'date', action: 'accept' }] },
    ])
  })

  it('stops the line of an interview changed since the card', async () => {
    const prepared = await work().prepare(ada, 's1', 'suggestions', [{ interviewId: 'a' }])
    if (!prepared.ok) throw new Error(prepared.error)
    view = { ...view, sessions: [session('a', { version: 4 })] }
    expect(
      await work().apply(ada, 's1', 'suggestions', prepared.value.lines, new Set(), new Map()),
    ).toEqual({ ok: true, value: { outcomes: ['VERSION_CONFLICT', 'VERSION_CONFLICT'] } })
    expect(accepted).toEqual([])
  })

  it('stops only the interview that fails', async () => {
    failOn = 'a'
    const prepared = await work().prepare(ada, 's1', 'suggestions', [
      { interviewId: 'a', fields: ['date'] },
      { interviewId: 'b', fields: ['date'] },
    ])
    if (!prepared.ok) throw new Error(prepared.error)
    expect(
      await work().apply(ada, 's1', 'suggestions', prepared.value.lines, new Set(), new Map()),
    ).toMatchObject({ value: { outcomes: ['VERSION_CONFLICT', 'done'] } })
  })
})

describe('spec 025 US4 — validating and excluding', () => {
  it('flags an interview without transcript', async () => {
    view = { ...view, sessions: [session('a', { transcript: null })] }
    expect(await work().prepare(ada, 's1', 'validate', [{ interviewId: 'a' }])).toMatchObject({
      value: { lines: [{ value: 'a', flag: 'no-transcript' }] },
    })
  })

  it('validates what is ticked, and survives a failure', async () => {
    failOn = 'a'
    const prepared = await work().prepare(ada, 's1', 'validate', [
      { interviewId: 'a' },
      { interviewId: 'b' },
    ])
    if (!prepared.ok) throw new Error(prepared.error)
    expect(
      await work().apply(ada, 's1', 'validate', prepared.value.lines, new Set(), new Map()),
    ).toMatchObject({ value: { outcomes: ['INTERNAL', 'done'] } })
    expect(decided).toMatchObject([{ sessionId: 'b', decision: 'validate' }])
  })

  it('needs a reason to exclude, and takes the one the person corrected', async () => {
    expect(await work().prepare(ada, 's1', 'exclude', [{ interviewId: 'a' }])).toEqual({
      ok: false,
      error: 'REASON_REQUIRED',
    })
    const prepared = await work().prepare(ada, 's1', 'exclude', [
      { interviewId: 'a', reason: 'A test call' },
    ])
    if (!prepared.ok) throw new Error(prepared.error)
    await work().apply(
      ada,
      's1',
      'exclude',
      prepared.value.lines,
      new Set(),
      new Map([[0, 'Not a research interview']]),
    )
    expect(decided).toMatchObject([{ decision: 'exclude', reason: 'Not a research interview' }])
  })
})
