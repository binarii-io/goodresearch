import { fixedClock, type Person } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeRemarkCommands } from '../application/commands/remark-commands.ts'
import { makeReviewCommands } from '../application/commands/review-commands.ts'
import type { ReviewRequest } from '../application/ports.ts'
import { makeQualityQueries } from '../application/queries/quality-queries.ts'
import type { SentAnswer } from '../domain/remarks.ts'
import { fakeQualityAi, fakeSources, makeDeps } from './fakes/in-memory-quality.ts'

const NOW = new Date('2026-10-31T10:00:00Z')
const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }
const lee = { name: 'Lee Sample', role: 'interviewer' as const, code: 'I02' }

const turn = (id: string, speaker: string, text: string) => ({ id, speaker, start: null, text })
const conducted = [
  turn('g1', 'Alex Martin', 'How do you export the data here?'),
  turn('g2', 'Sam Example', 'I export the file every single week, and I hate waiting for it.'),
  turn('g3', 'Alex Martin', 'So you export it every week? You find this tool too slow, right?'),
  turn('g4', 'Sam Example', 'Yes, somewhat slow, I would say so, and that is about all of it.'),
]
const flag = {
  kind: 'leading-question' as const,
  reason: { en: 'It suggests the answer.', fr: 'Elle suggère la réponse.' },
  recommendation: 'How does this tool feel to you?',
  addedElement: null,
  excerpt: null,
}
const answer = (request: ReviewRequest): SentAnswer[] =>
  request.turns.flatMap((t) =>
    t.sentences.flatMap((s): SentAnswer[] => {
      if (s.text.startsWith('So you')) return [{ id: s.id, kind: 'simple-reformulation' }]
      if (s.text.startsWith('You find')) return [{ id: s.id, kind: 'question', flag }]
      return s.text.endsWith('?') ? [{ id: s.id, kind: 'question' }] : []
    }),
  )

const setup = (over: { anonymised?: boolean; interviews?: never[] } = {}) => {
  const src = fakeSources({
    anonymised: over.anonymised ?? false,
    interviews: [{ id: 's1', title: 'Interview 1', people: [sam, alex], turns: conducted }],
    access: (who) => who !== 'outsider',
  })
  const fake = fakeQualityAi(answer)
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  return {
    ...made,
    ...fake,
    src,
    review: makeReviewCommands(made.deps),
    remarks: makeRemarkCommands(made.deps),
    queries: makeQualityQueries(made.deps),
  }
}
type Setup = ReturnType<typeof setup>

const reviewed = async (s: Setup, all = false) => {
  const started = await s.review.start('a1', 'st', { all, consent: true })
  if (!started.ok) throw new Error(started.error)
  await s.review.runJob({ runId: started.value.runId, studyId: 'st', anyway: false })
}
const overall = async (s: Setup) => {
  const view = await s.queries.overview('a1', 'st')
  if (!view.ok) throw new Error(view.error)
  return view.value
}

describe('an opinion on a remark (US2, SC-007)', () => {
  it('changes the counts and nothing else, and can be withdrawn', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    const before = s.memory.counts()
    expect(
      await s.remarks.stance('a1', 'st', remark.id, {
        stance: 'disagree',
        version: remark.version,
      }),
    ).toEqual({ ok: true, value: undefined })
    expect(s.memory.counts()).toEqual(before)
    expect(s.requests).toHaveLength(1)
    expect((await overall(s)).overall?.leading.questions).toEqual({
      agreed: 0,
      noOpinion: 0,
      disagreed: 1,
    })
    await s.remarks.stance('a1', 'st', remark.id, { stance: null, version: remark.version + 1 })
    expect((await overall(s)).overall?.leading.questions.noOpinion).toBe(1)
  })

  it('tells the second person it changed meanwhile', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    await s.remarks.stance('a1', 'st', remark.id, { stance: 'agree', version: 1 })
    expect(
      await s.remarks.stance('a2', 'st', remark.id, { stance: 'disagree', version: 1 }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('never flags again a sentence someone disagreed with (FR-011)', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    await s.remarks.stance('a1', 'st', remark.id, { stance: 'disagree', version: 1 })
    await reviewed(s, true)
    expect(s.memory.remarks().map((r) => r.id)).toEqual([remark.id])
  })

  it('replaces what nobody gave an opinion on', async () => {
    const s = setup()
    await reviewed(s)
    const first = s.memory.remarks()[0]?.id
    await reviewed(s, true)
    expect(s.memory.remarks()).toHaveLength(1)
    expect(s.memory.remarks()[0]?.id).not.toBe(first)
  })

  it('gives nothing to a person outside the study (FR-016)', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    expect(
      await s.remarks.stance('outsider', 'st', remark.id, { stance: 'agree', version: 1 }),
    ).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
    for (const read of [
      s.queries.overview('outsider', 'st'),
      s.queries.remarks('outsider', 'st', {}),
      s.queries.reformulations('outsider', 'st', {}),
      s.queries.interview('outsider', 'st', 's1'),
    ])
      expect(await read).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
  })

  it('refuses a remark of another study', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    expect(
      await s.remarks.stance('a1', 'other', remark.id, { stance: 'agree', version: 1 }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' })
  })
})

describe('requalifying a simple reformulation (FR-008a)', () => {
  it('makes it a person remark, counted, with no AI call; withdrawing undoes it', async () => {
    const s = setup()
    await reviewed(s)
    const calls = s.refs.length
    const simple = s.memory.reformulations()[0]
    if (!simple) throw new Error('none')
    const done = await s.remarks.requalify('a1', 'st', simple.id, { reason: 'It adds a cause.' })
    if (!done.ok) throw new Error(done.error)
    expect(s.refs).toHaveLength(calls)
    let view = (await overall(s)).overall
    expect(view?.simpleReformulations).toBe(0)
    expect(view?.leading.reformulations.agreed).toBe(1)
    expect(await s.remarks.requalify('a1', 'st', simple.id, { reason: 'Again' })).toEqual({
      ok: false,
      error: 'ALREADY_REQUALIFIED',
    })
    expect(
      await s.remarks.stance('a1', 'st', done.value.remarkId, { stance: 'disagree', version: 1 }),
    ).toEqual({ ok: false, error: 'PERSON_REMARK_STANCE' })

    // A new review keeps it, and does not count its sentence as simple again.
    await reviewed(s, true)
    view = (await overall(s)).overall
    expect(view?.simpleReformulations).toBe(0)
    expect(view?.leading.reformulations.agreed).toBe(1)

    expect(await s.remarks.withdraw('a1', 'st', done.value.remarkId, 1)).toEqual({
      ok: true,
      value: undefined,
    })
    view = (await overall(s)).overall
    expect(view?.leading.reformulations.agreed).toBe(0)
    expect(view?.simpleReformulations).toBe(1)
  })

  it("refuses to withdraw the AI's remark", async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    expect(await s.remarks.withdraw('a1', 'st', remark.id, 1)).toEqual({
      ok: false,
      error: 'AI_REMARK',
    })
  })
})

describe('reading the remarks', () => {
  it('gives the sentence, what was said around it, and filters', async () => {
    const s = setup()
    await reviewed(s)
    const list = await s.queries.remarks('a1', 'st', {})
    if (!list.ok) throw new Error(list.error)
    expect(list.value.total).toBe(1)
    expect(list.value.remarks[0]).toMatchObject({
      person: 'Alex Martin',
      personKey: 'I01',
      segmentId: 'g3',
      text: 'You find this tool too slow, right?',
      before: conducted[1]?.text,
      after: conducted[3]?.text,
      lost: false,
    })
    const none = await s.queries.remarks('a1', 'st', { stance: 'agree' })
    expect(none.ok && none.value.total).toBe(0)
    const other = await s.queries.remarks('a1', 'st', { person: 'I02' })
    expect(other.ok && other.value.total).toBe(0)
    const simple = await s.queries.reformulations('a1', 'st', {})
    expect(simple.ok && simple.value.reformulations[0]?.text).toBe('So you export it every week?')
  })
})

describe('the views (US4)', () => {
  const two = () => {
    const src = fakeSources({
      interviews: [
        {
          id: 's1',
          title: 'Shared',
          people: [sam, alex, lee],
          turns: [
            turn('a1', 'Alex Martin', 'How do you do it?'),
            turn('a2', 'Sam Example', 'With a file that I send every week to them all.'),
            turn('a3', 'Lee Sample', 'And who reads the file?'),
            turn('a4', 'Sam Example', 'The whole team reads it when they come in the morning.'),
          ],
        },
        {
          id: 's2',
          title: 'Alone',
          people: [sam, lee],
          turns: [
            turn('b1', 'Lee Sample', 'You find this tool too slow, right?'),
            turn('b2', 'Sam Example', 'Sometimes it is slow, when the export is really big.'),
          ],
        },
      ],
    })
    const fake = fakeQualityAi(answer)
    const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
    return {
      ...made,
      ...fake,
      src,
      review: makeReviewCommands(made.deps),
      remarks: makeRemarkCommands(made.deps),
      queries: makeQualityQueries(made.deps),
    }
  }

  it('adds up, in name order, each person with their own sentences', async () => {
    const s = two()
    await reviewed(s as unknown as Setup)
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    const { people, interviews, overall: all } = view.value
    expect(people.map((p) => [p.name, p.interviews])).toEqual([
      ['Alex Martin', 1],
      ['Lee Sample', 2],
    ])
    const total = (rows: { figures: { sentences: number } | null }[]) =>
      rows.reduce((n, r) => n + (r.figures?.sentences ?? 0), 0)
    expect(total(people)).toBe(all?.sentences)
    expect(total(interviews)).toBe(all?.sentences)
    expect(people.reduce((n, p) => n + p.figures.words.interviewers, 0)).toBe(
      all?.words.interviewers,
    )
    const lees = await s.queries.remarks('a1', 'st', { person: 'I02' })
    expect(lees.ok && lees.value.total).toBe(1)
  })

  it('shows no name under anonymisation', async () => {
    const s = setup({ anonymised: true })
    await reviewed(s)
    const view = await overall(s)
    expect(view.people.map((p) => p.name)).toEqual(['I01'])
  })

  it('no longer counts an interview taken out of the validated ones, its remarks kept', async () => {
    const s = setup()
    await reviewed(s)
    const kept = s.memory.remarks().length
    s.deps.sources.sessions = async () => []
    const view = await overall(s)
    expect(view.overall).toBeNull()
    expect(view.total).toBe(0)
    expect(s.memory.remarks()).toHaveLength(kept)
    const list = await s.queries.remarks('a1', 'st', {})
    expect(list.ok && list.value.total).toBe(0)
  })
})

describe('no figure before a review (feedback from testing)', () => {
  it('shows nothing to read but the state, and no cost', async () => {
    const s = setup()
    const view = await overall(s)
    expect(view.overall).toBeNull()
    expect([view.reviewed, view.total]).toEqual([0, 1])
    expect(view.people).toEqual([])
    expect(view.cost).toBeNull()
    expect(view.interviews[0]).toMatchObject({ state: 'not-reviewed', figures: null, cost: null })
  })

  it('says how many are reviewed, and covers only them', async () => {
    const src = fakeSources({
      interviews: [
        { id: 's1', title: 'One', people: [sam, alex], turns: conducted },
        { id: 's2', title: 'Two', people: [sam, alex], turns: conducted },
      ],
    })
    const fake = fakeQualityAi(answer)
    const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
    const review = makeReviewCommands(made.deps)
    const started = await review.start('a1', 'st', {
      all: false,
      consent: true,
      sessionIds: ['s1'],
    })
    if (!started.ok) throw new Error(started.error)
    await review.runJob({ runId: started.value.runId, studyId: 'st', anyway: true })
    const view = await makeQualityQueries(made.deps).overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect([view.value.reviewed, view.value.total]).toEqual([1, 2])
    expect(view.value.overall?.sentences).toBe(view.value.interviews[0]?.figures?.sentences)
    expect(view.value.interviews[1]?.figures).toBeNull()
  })
})

describe('speakers not identified: never a false 0%', () => {
  const spoken = (label: string) => [
    turn('h1', label, 'How do you export the data every week then?'),
    turn('h2', 'Sam Example', 'I export the file every single week and I hate it.'),
  ]
  const interview = (people: Person[], turns: ReturnType<typeof spoken>) => {
    const src = fakeSources({ interviews: [{ id: 's1', title: 'One', people, turns }] })
    const made = makeDeps({
      sources: src.sources,
      ai: fakeQualityAi(answer).ai,
      clock: fixedClock(NOW),
    })
    return {
      ...made,
      queries: makeQualityQueries(made.deps),
      review: makeReviewCommands(made.deps),
    }
  }

  it('counts the words of the only interviewer spelt otherwise as theirs', async () => {
    const s = interview([sam, alex], spoken('Robin'))
    const view = await s.queries.interview('a1', 'st', 's1')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.state).toBe('not-reviewed')
    expect(view.value.turns?.[0]?.role).toBe('interviewer')
  })

  it('asks who speaks when no interviewer is on the roster, and reads nothing', async () => {
    const s = interview([sam], spoken('Robin'))
    const view = await s.queries.interview('a1', 'st', 's1')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.state).toBe('speakers-not-identified')
    expect(view.value.figures).toBeNull()
    expect(view.value.speakers).toEqual([
      { label: 'Robin', role: 'unknown' },
      { label: 'Sam Example', role: 'interviewee' },
    ])
    expect(await s.review.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'NOTHING_TO_REVIEW',
    })
  })
})

describe('the interview to read', () => {
  it('gives the transcript alone before a review', async () => {
    const s = setup()
    const view = await s.queries.interview('a1', 'st', 's1')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.turns).toHaveLength(4)
    expect(view.value.figures).toBeNull()
    expect(view.value.remarks).toEqual([])
    expect(view.value.reformulations).toEqual([])
    expect(s.refs).toEqual([])
  })

  it('marks in place what was flagged once reviewed, at its place in the text', async () => {
    const s = setup()
    await reviewed(s)
    const view = await s.queries.interview('a1', 'st', 's1')
    if (!view.ok) throw new Error(view.error)
    const [remark] = view.value.remarks
    const text = conducted[2]?.text ?? ''
    expect(text.slice(remark?.offset ?? 0, (remark?.offset ?? 0) + (remark?.length ?? 0))).toBe(
      remark?.text,
    )
    expect(view.value.reformulations[0]?.text).toBe('So you export it every week?')
    expect(view.value.figures?.questions).toBe(2)
  })

  it('says not clean yet under the clean-only setting', async () => {
    const s = setup()
    s.deps.sources.analysedText = async () => 'not-clean'
    const view = await s.queries.interview('a1', 'st', 's1')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.state).toBe('not-clean')
    expect(view.value.turns).toBeNull()
  })

  it('refuses an interview that is not in the study', async () => {
    const s = setup()
    expect(await s.queries.interview('a1', 'st', 'nope')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    })
  })
})

describe('when the text changes (FR-012)', () => {
  const changed = (s: Setup, turns: typeof conducted, fingerprint: string) => {
    s.deps.sources.analysedText = async () => ({
      turns,
      rawImportedAt: new Date('2026-10-01T00:00:00Z'),
      fingerprint,
    })
  }

  it('flags a remark no longer found, never deletes it, and asks to review again', async () => {
    const s = setup()
    await reviewed(s)
    changed(
      s,
      conducted.map((t) =>
        t.id === 'g3' ? { ...t, text: 'Tell me more about it, please now.' } : t,
      ),
      'other',
    )
    const view = await overall(s)
    expect(view.interviews[0]?.state).toBe('to-review-again')
    const list = await s.queries.remarks('a1', 'st', {})
    expect(list.ok && list.value.remarks[0]?.lost).toBe(true)
    expect(s.memory.remarks()).toHaveLength(1)
  })

  it('follows a word corrected elsewhere without asking anything', async () => {
    const s = setup()
    await reviewed(s)
    changed(
      s,
      conducted.map((t) =>
        t.id === 'g1' ? { ...t, text: 'How do you export your data here?' } : t,
      ),
      'other',
    )
    const view = await overall(s)
    expect(view.interviews[0]?.state).toBe('reviewed')
    expect(view.interviews[0]?.figures?.words.interviewers).toBeGreaterThan(0)
  })

  it('does not ask forever for a remark kept for its opinion', async () => {
    const s = setup()
    await reviewed(s)
    const remark = s.memory.remarks()[0]
    if (!remark) throw new Error('no remark')
    await s.remarks.stance('a1', 'st', remark.id, { stance: 'agree', version: 1 })
    changed(
      s,
      conducted.map((t) =>
        t.id === 'g3' ? { ...t, text: 'Tell me more about it, please now.' } : t,
      ),
      'other',
    )
    expect((await overall(s)).interviews[0]?.state).toBe('to-review-again')
    await reviewed(s)
    expect((await overall(s)).interviews[0]?.state).toBe('reviewed')
  })
})
