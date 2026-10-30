import { describe, expect, it } from 'vitest'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import type { SourceSession } from '../application/ports.ts'
import { fakeAi, fakeSources, testDeps } from './fakes/in-memory-transcripts.ts'

const ACTOR = { id: 'p1', role: 'member' as const }

const session = (id: string, text: string, modifiedAt = '2026-10-20T10:00:00Z') => ({
  id,
  title: `Interview ${id}`,
  interviewDate: '2026-10-20',
  language: 'en' as const,
  transcript: { fileId: `f-${id}`, name: `${id}.txt`, mimeType: 'text/plain', modifiedAt },
  text,
})

const DEMO = [
  session(
    'a',
    'Lee: Hello Sam Example, welcome.\nSam Example: We use Goodresearch every day, Sam said. Hmm.',
  ),
  session('b', 'Lee: And the tool?\nSam Example: Gooresearch is good, our NPS went up. Hmm.'),
  session('c', 'Lee: Really?\nSam Example: Yes, the NPS again. Hmm.'),
]

const setup = (sessions: (SourceSession & { text?: string })[] = DEMO, ai = fakeAi()) => {
  const sources = fakeSources({ sessions: [...sessions], names: ['Sam Example', 'Lee Member'] })
  const t = testDeps({ sources: sources.sources, ai: ai.ai })
  return { ...t, ...sources, ai, commands: makeLexiconCommands(t.deps) }
}

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

const readAll = async (s: ReturnType<typeof setup>, options = { consent: true }) => {
  const { runId } = value(await s.commands.startRun(ACTOR, 'study', options))
  await s.commands.runJob({ runId, studyId: 'study' })
  return runId
}

describe('startRun', () => {
  it('needs validated interviews, an AI connection and consent', async () => {
    expect(await setup([]).commands.startRun(ACTOR, 'study', {})).toEqual({
      ok: false,
      error: 'NO_VALIDATED_INTERVIEW',
    })
    const noAi = setup(DEMO, fakeAi({ provider: null }))
    expect((await noAi.commands.startRun(ACTOR, 'study', {})).ok).toBe(false)
    const s = setup()
    expect(await s.commands.startRun(ACTOR, 'study', {})).toEqual({
      ok: false,
      error: 'LEXICON_CONSENT_REQUIRED',
    })
    expect((await s.commands.startRun(ACTOR, 'study', { consent: true })).ok).toBe(true)
    expect(await s.commands.startRun(ACTOR, 'study', {})).toEqual({
      ok: false,
      error: 'LEXICON_RUNNING',
    })
    expect(s.jobs).toHaveLength(1)
  })

  it('replaces a stale run and reads nothing twice', async () => {
    const s = setup()
    value(await s.commands.startRun(ACTOR, 'study', { consent: true }))
    s.clock.advance(11 * 60_000)
    const runId = value(await s.commands.startRun(ACTOR, 'study', {})).runId
    await s.commands.runJob({ runId, studyId: 'study' })
    expect(await s.commands.startRun(ACTOR, 'study', {})).toEqual({
      ok: false,
      error: 'NOTHING_TO_READ',
    })
    expect((await s.commands.startRun(ACTOR, 'study', { all: true })).ok).toBe(true)
  })

  it('takes one interview out while it waits or is imported, never after', async () => {
    const s = setup()
    const { runId } = value(await s.commands.startRun(ACTOR, 'study', { consent: true }))
    expect((await s.commands.stopSession(ACTOR, 'study', runId, 'a')).ok).toBe(true)
    // A second click gives the same answer.
    expect((await s.commands.stopSession(ACTOR, 'study', runId, 'a')).ok).toBe(true)
    // "b" is stopped while its transcript is imported: its words are not sent.
    const read = s.sources.readTranscript
    s.sources.readTranscript = async (a, st, id) => {
      if (id === 'b') await s.commands.stopSession(ACTOR, 'study', runId, 'b')
      return read(a, st, id)
    }
    await s.commands.runJob({ runId, studyId: 'study' })
    expect(s.memory.runs.get(runId)?.sessions).toEqual([
      { sessionId: 'a', state: 'failed', failure: 'STOPPED' },
      { sessionId: 'b', state: 'failed', failure: 'STOPPED' },
      { sessionId: 'c', state: 'done' },
    ])
    expect(s.reads).not.toContain('a')
    expect(s.ai.batches.flat().some((c) => JSON.stringify(c).includes('Gooresearch'))).toBe(false)
    expect(await s.commands.stopSession(ACTOR, 'study', runId, 'c')).toEqual({
      ok: false,
      error: 'TOO_LATE_TO_STOP',
    })
    expect(await s.commands.stopSession(ACTOR, 'study', runId, 'other')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    })
    // Stopped interviews stay to read.
    expect(value(await s.commands.estimate(ACTOR.id, 'study', false)).interviews).toBe(2)
  })

  it('reads one interview again, whatever its state', async () => {
    const s = setup()
    await readAll(s)
    expect(value(await s.commands.estimate(ACTOR.id, 'study', false, 'b')).interviews).toBe(1)
    const { runId } = value(await s.commands.startRun(ACTOR, 'study', { sessionIds: ['b'] }))
    expect(s.memory.runs.get(runId)?.sessions.map((x) => x.sessionId)).toEqual(['b'])
    await s.commands.runJob({ runId, studyId: 'study' })
    expect(s.memory.runs.get(runId)?.sessions.map((x) => x.state)).toEqual(['done'])
    expect(await s.commands.startRun(ACTOR, 'study', { sessionIds: ['unknown'] })).toEqual({
      ok: false,
      error: 'NOTHING_TO_READ',
    })
  })
})

describe('runJob', () => {
  it('imports, proposes grouped terms with checked quotes, and counts them', async () => {
    const s = setup()
    const runId = await readAll(s)
    const run = s.memory.runs.get(runId)
    expect(run?.phase).toBe('finished')
    expect(run?.sessions.map((x) => x.state)).toEqual(['done', 'done', 'done'])
    const terms = [...s.memory.terms.values()]
    const good = terms.find((t) => t.form === 'Goodresearch')
    expect(good?.variants.map((v) => v.spelling)).toEqual(['Gooresearch'])
    expect(good?.status).toBe('proposed')
    expect(terms.find((t) => t.form === 'NPS')?.category).toBe('acronym')
    expect(terms.some((t) => /sam|example|lee/i.test(t.form))).toBe(false)
    const rows = s.memory.occurrences.get('study') ?? []
    expect(rows.filter((r) => r.spelling === 'NPS').map((r) => r.sessionId)).toEqual(['b', 'c'])
    expect(s.ai.refs.every((r) => r === `lexicon-reading:${runId}`)).toBe(true)
  })

  it('counts the batches sent to the AI, so a reading shows where it stands', async () => {
    const s = setup()
    const runId = await readAll(s)
    const run = await s.deps.store.getRun(runId)
    expect(run?.batchesTotal).toBeGreaterThan(0)
    expect(run?.batchesDone).toBe(run?.batchesTotal)
  })

  it('keeps the batch count when the reading is stopped during the AI step', async () => {
    const ai = fakeAi()
    // More rare words than one batch holds.
    const rare = Array.from(
      { length: 40 },
      (_, i) =>
        `qzx${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}qz`,
    )
    const s = setup([session('a', `Sam Example: ${rare.join(' ')}.`)], ai)
    const { runId } = value(await s.commands.startRun(ACTOR, 'study', { consent: true }))
    const propose = ai.ai.propose
    ai.ai.propose = async (...args) => {
      const answer = await propose(...args)
      await s.commands.stopRun(ACTOR, 'study', runId)
      return answer
    }
    await s.commands.runJob({ runId, studyId: 'study' })
    const run = await s.deps.store.getRun(runId)
    expect(run?.batchesTotal).toBe(2)
    expect(run?.batchesDone).toBe(1)
    expect(run?.finishedAt).not.toBeNull()
  })

  it('never sends a known name nor a whole transcript', async () => {
    const s = setup()
    await readAll(s)
    const sent = JSON.stringify(s.ai.batches)
    expect(sent).not.toMatch(/Sam|Example|Lee/)
    expect(sent).toContain('[Person 1]')
    for (const b of s.ai.batches)
      for (const c of b.candidates)
        for (const e of c.excerpts) expect(e.length).toBeLessThanOrEqual(200)
  })

  it('never changes a decision and never proposes a rejected term again', async () => {
    const s = setup()
    await readAll(s)
    const byForm = (form: string) => [...s.memory.terms.values()].find((t) => t.form === form)
    const good = byForm('Goodresearch')
    const hmm = byForm('Hmm')
    if (!good || !hmm) throw new Error('terms missing')
    value(await s.commands.decide(ACTOR, 'study', good.id, good.version, { decision: 'accept' }))
    value(await s.commands.decide(ACTOR, 'study', hmm.id, hmm.version, { decision: 'reject' }))

    s.sessions.push(session('d', 'Lee: So?\nSam Example: Goodreserch and good research. Hmm.'))
    await readAll(s, { consent: false } as never)
    const after = byForm('Goodresearch')
    expect(after?.status).toBe('accepted')
    expect(after?.variants.map((v) => [v.spelling, v.status])).toEqual(
      expect.arrayContaining([
        ['Gooresearch', 'accepted'],
        ['Goodreserch', 'proposed'],
        ['good research', 'proposed'],
      ]),
    )
    expect(after?.variants).toHaveLength(3)
    expect(byForm('Hmm')?.status).toBe('rejected')
    expect(s.ai.batches.at(-1)?.candidates.map((c) => c.spelling)).not.toContain('Hmm')
    expect(s.ai.batches.at(-1)?.knownForms).toEqual(['Goodresearch'])
  })

  it('keeps the others when one interview cannot be read', async () => {
    const s = setup([DEMO[0] as never, { ...DEMO[1], failure: 'UNREADABLE_FORMAT' } as never])
    const runId = await readAll(s)
    expect(s.memory.runs.get(runId)?.sessions).toEqual([
      { sessionId: 'a', state: 'done' },
      { sessionId: 'b', state: 'failed', failure: 'UNREADABLE_FORMAT' },
    ])
  })

  it('stops between steps, keeping what was read', async () => {
    const s = setup()
    const { runId } = value(await s.commands.startRun(ACTOR, 'study', { consent: true }))
    value(await s.commands.stopRun(ACTOR, 'study', runId))
    await s.commands.runJob({ runId, studyId: 'study' })
    const run = s.memory.runs.get(runId)
    expect(run?.finishedAt).not.toBeNull()
    expect(run?.sessions.every((x) => x.state === 'failed' && x.failure === 'INTERRUPTED')).toBe(
      true,
    )
    expect(s.ai.batches).toHaveLength(0)
  })

  it('records an AI failure on the run, the interviews read', async () => {
    const s = setup(DEMO, fakeAi({ fail: 'failed' }))
    const runId = await readAll(s)
    expect(s.memory.runs.get(runId)?.failure).toBe('AI_FAILED')
    expect(s.memory.transcripts.size).toBe(3)
    // Not read to the end: offered again without "read all again", and not imported again.
    expect([...s.memory.transcripts.values()].every((t) => t.readAt === null)).toBe(true)
    expect((await s.commands.startRun(ACTOR, 'study', {})).ok).toBe(true)
  })

  it('imports again a changed file, keeping the ids of unchanged turns', async () => {
    const s = setup([session('a', 'Lee: Hello\nSam Example: Goodresearch')])
    await readAll(s)
    const before = s.memory.transcripts.get('a')?.segments.map((x) => x.id) ?? []
    s.sessions.splice(
      0,
      1,
      session('a', 'Lee: Hello\nSam Example: Goodresearch, really', '2026-10-21T10:00:00Z'),
    )
    await readAll(s)
    const after = s.memory.transcripts.get('a')?.segments.map((x) => x.id) ?? []
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(s.reads).toEqual(['a', 'a'])
  })
})

describe('decisions', () => {
  it('checks the version, the team and merges', async () => {
    const s = setup()
    await readAll(s)
    const [a, b] = [...s.memory.terms.values()]
    if (!a || !b) throw new Error('terms missing')
    expect(
      await s.commands.decide(ACTOR, 'study', a.id, a.version + 1, { decision: 'accept' }),
    ).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    expect(
      await s.commands.decide(ACTOR, 'other-team', a.id, a.version, { decision: 'accept' }),
    ).toEqual({
      ok: false,
      error: 'TERM_NOT_FOUND',
    })
    const into = value(
      await s.commands.merge(ACTOR, 'study', b.id, b.version, { termId: a.id, version: a.version }),
    )
    expect(into.variants.map((v) => v.spelling)).toContain(b.form)
    expect(s.memory.terms.get(b.id)?.status).toBe('merged')
    expect(
      await s.commands.decide(ACTOR, 'study', b.id, b.version + 1, { decision: 'accept' }),
    ).toEqual({
      ok: false,
      error: 'TERM_NOT_FOUND',
    })
  })

  it('refuses an edited form another term has', async () => {
    const s = setup()
    await readAll(s)
    const [a, b] = [...s.memory.terms.values()]
    if (!a || !b) throw new Error('terms missing')
    const fields = {
      form: b.form,
      kind: 'domain' as const,
      correction: null,
      category: 'other' as const,
      definition: null,
    }
    expect(
      await s.commands.decide(ACTOR, 'study', a.id, a.version, { decision: 'edit', fields }),
    ).toEqual({
      ok: false,
      error: 'TERM_EXISTS',
    })
  })

  it('decides many, counting those changed meanwhile', async () => {
    const s = setup()
    await readAll(s)
    const terms = [...s.memory.terms.values()].map((t) => ({ termId: t.id, version: t.version }))
    const first = terms[0]
    if (!first) throw new Error('terms missing')
    const r = value(
      await s.commands.decideMany(ACTOR, 'study', 'accept', [...terms, { ...first, version: 99 }]),
    )
    expect(r).toEqual({ done: terms.length, changed: 1 })
  })
})

describe('verdicts on occurrences', () => {
  it('judges a place that holds the term, keeps it across readings, moves it with a merge', async () => {
    const s = setup()
    await readAll(s)
    const byForm = (form: string) => [...s.memory.terms.values()].find((t) => t.form === form)
    const nps = byForm('NPS')
    if (!nps) throw new Error('no NPS')
    const transcript = s.memory.transcripts.get('b')
    const segment = transcript?.segments.find((x) => x.text.includes('NPS'))
    if (!segment) throw new Error('no segment')
    const place = { sessionId: 'b', segmentId: segment.id, offset: segment.text.indexOf('NPS') }
    expect(await s.commands.judge(ACTOR, 'study', nps.id, place, 'no')).toEqual({
      ok: true,
      value: undefined,
    })
    expect(
      await s.commands.judge(ACTOR, 'study', nps.id, { ...place, offset: place.offset + 1 }, 'yes'),
    ).toEqual({ ok: false, error: 'OCCURRENCE_NOT_FOUND' })
    expect(
      await s.commands.judge(ACTOR, 'study', nps.id, { ...place, sessionId: 'zz' }, 'yes'),
    ).toEqual({ ok: false, error: 'OCCURRENCE_NOT_FOUND' })

    await readAll(s, { all: true } as never)
    expect([...s.memory.verdicts.values()].map((v) => [v.termId, v.verdict])).toEqual([
      [nps.id, 'no'],
    ])

    const good = byForm('Goodresearch')
    const current = byForm('NPS')
    if (!good || !current) throw new Error('terms missing')
    value(
      await s.commands.merge(ACTOR, 'study', current.id, current.version, {
        termId: good.id,
        version: good.version,
      }),
    )
    expect([...s.memory.verdicts.values()].map((v) => v.termId)).toEqual([good.id])

    value(await s.commands.judge(ACTOR, 'study', good.id, place, null))
    expect(s.memory.verdicts.size).toBe(0)
  })
})

describe('names never sent (review of PR #10)', () => {
  it('replaces the speakers of the transcripts and the person terms in the excerpts', async () => {
    const s = setup([
      session('a', 'Robin Sample: Hello.\nCasey Test: Robin Sample told me Zorblat was good.'),
    ])
    await readAll(s)
    const sent = JSON.stringify(s.ai.batches)
    expect(sent).toContain('Zorblat')
    expect(sent).not.toMatch(/Robin|Sample|Casey/)
  })
})

describe('folder access (review of PR #10)', () => {
  it('refuses decisions without it, and a recount without it keeps the occurrences', async () => {
    const input: Parameters<typeof fakeSources>[0] = { sessions: [...DEMO] }
    const sources = fakeSources(input)
    const t = testDeps({ sources: sources.sources })
    const commands = makeLexiconCommands(t.deps)
    const started = value(await commands.startRun(ACTOR, 'study', { consent: true }))
    await commands.runJob({ runId: started.runId, studyId: 'study' })
    const before = t.memory.occurrences.get('study') ?? []
    expect(before.length).toBeGreaterThan(0)
    const [term] = [...t.memory.terms.values()]
    if (!term) throw new Error('no term')

    input.access = false
    expect(
      await commands.decide(ACTOR, 'study', term.id, term.version, { decision: 'accept' }),
    ).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
    await commands.recount('study', 'team-1', ACTOR.id)
    expect(t.memory.occurrences.get('study')).toEqual(before)
  })
})

describe('runs that cannot go on (review of PR #10)', () => {
  it('a run the queue refuses is closed at once', async () => {
    const sources = fakeSources({ sessions: [...DEMO] })
    const t = testDeps({ sources: sources.sources, enqueue: async () => false })
    const commands = makeLexiconCommands(t.deps)
    expect(await commands.startRun(ACTOR, 'study', { consent: true })).toEqual({
      ok: false,
      error: 'LEXICON_RUNNING',
    })
    expect([...t.memory.runs.values()].every((r) => r.finishedAt !== null)).toBe(true)
  })

  it('a run replaced as stale stops, and its worker cannot open it again', async () => {
    const s = setup()
    const first = value(await s.commands.startRun(ACTOR, 'study', { consent: true }))
    s.clock.advance(11 * 60_000)
    value(await s.commands.startRun(ACTOR, 'study', {}))
    await s.commands.runJob({ runId: first.runId, studyId: 'study' })
    expect(s.memory.runs.get(first.runId)?.sessions.every((r) => r.state !== 'done')).toBe(true)
    expect(s.ai.batches).toHaveLength(0)
  })
})
