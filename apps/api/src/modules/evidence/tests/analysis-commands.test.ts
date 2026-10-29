import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeAnalysisCommands } from '../application/commands/analysis-commands.ts'
import { fakeFactsAi, fakeSources, makeDeps } from './fakes/in-memory-evidence.ts'

const NOW = new Date('2026-10-28T10:00:00Z')
const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }

const turns = [
  { id: 'g1', speaker: 'Alex Martin', start: null, text: 'How do you find the data of your team?' },
  {
    id: 'g2',
    speaker: 'Sam Example',
    start: null,
    text: 'I never find the data of my team quickly. Alex knows it.',
  },
  { id: 'g3', speaker: 'Alex Martin', start: null, text: 'And the newsletter, is it useful?' },
  {
    id: 'g4',
    speaker: 'Sam Example',
    start: null,
    text: 'The newsletter helps me every single week. Really.',
  },
]

const setup = (over: { interviews?: Parameters<typeof fakeSources>[0]['interviews'] } = {}) => {
  const src = fakeSources({
    interviews: over.interviews ?? [
      { id: 's1', title: 'Interview 1', people: [sam, alex], turns },
      { id: 's2', title: 'Interview 2', people: [sam, alex], turns: null },
    ],
    themes: [{ id: 'sec-1', title: 'Finding data' }],
  })
  const fake = fakeFactsAi()
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  const commands = makeAnalysisCommands(made.deps)
  return { ...made, ...fake, src, commands }
}

const runAll = async (s: ReturnType<typeof setup>, input = { all: false, consent: true }) => {
  const started = await s.commands.start('a1', 'st', input)
  if (!started.ok) throw new Error(started.error)
  await s.commands.runJob({ runId: started.value.runId, studyId: 'st', all: input.all })
  return started.value.runId
}

describe('Find facts (US1)', () => {
  it('asks for consent once, then reads interviewee verbatims and proposes a fact over them', async () => {
    const s = setup()
    expect(await s.commands.start('a1', 'st', { all: false, consent: false })).toEqual({
      ok: false,
      error: 'FACTS_CONSENT_REQUIRED',
    })
    const runId = await runAll(s)
    const verbatims = [...s.memory.verbatims.values()]
    expect(verbatims.map((v) => [v.segmentId, v.text, v.participant])).toEqual([
      ['g2', 'I never find the data of my team quickly.', 'P01'],
      ['g4', 'The newsletter helps me every single week.', 'P01'],
    ])
    const facts = [...s.memory.facts.values()]
    // The fake's second fact names a person: dropped (FR-006).
    expect(facts.map((f) => [f.status, f.theme?.id ?? null, f.verbatimIds.length])).toEqual([
      ['proposed', 'sec-1', 2],
    ])
    const run = s.memory.runs.get(runId)
    expect(run?.sessions.map((x) => [x.sessionId, x.state, x.failure ?? null])).toEqual([
      ['s1', 'done', null],
      ['s2', 'failed', 'NO_TRANSCRIPT'],
    ])
    // One quote not in the text per chunk; one fact with a name.
    expect(run?.leftOut).toEqual({ verbatims: 1, facts: 1 })
    expect(s.src.state.imports).toEqual(['s1', 's2'])
  })

  it('never sends a known name or a speaker label to the AI (FR-007, SC-003)', async () => {
    const s = setup()
    await runAll(s)
    const sent = s.requests.map((r) => r.body).join('\n')
    expect(sent).not.toMatch(/Sam|Alex|Example|Martin/)
    expect(sent).toContain('[Person')
    expect(s.requests.every((r) => r.ref === `facts:${s.memory.runs.keys().next().value}:s1`)).toBe(
      true,
    )
  })

  it('keeps generic speaker labels: they are no names (FR-007)', async () => {
    const s = setup({
      interviews: [
        {
          id: 's1',
          title: 'Interview 1',
          people: [sam, alex],
          turns: [
            { id: 'g1', speaker: 'Interviewer', start: null, text: 'How do you find the data?' },
            {
              id: 'g2',
              speaker: 'Interviewee',
              start: null,
              text: 'I never find the data of my team quickly. It takes three tools.',
            },
          ],
        },
      ],
    })
    s.state.facts = [
      {
        statement: {
          en: 'The interviewee needs three tools',
          fr: "L'interviewé utilise trois outils",
        },
        polarity: 'negative',
        theme: 'other',
        verbatims: ['v1'],
      },
    ]
    await runAll(s)
    // "Interviewer" is an interviewer's turn; "Interviewee" the only interviewee.
    const verbatims = [...s.memory.verbatims.values()]
    expect(verbatims.map((v) => [v.segmentId, v.participant])).toEqual([['g2', 'P01']])
    expect([...s.memory.facts.values()].map((f) => f.statement.en)).toEqual([
      'The interviewee needs three tools',
    ])
  })

  it('keeps two facts that share a verbatim (R7 applies to decided facts)', async () => {
    const s = setup()
    s.state.facts = [
      {
        statement: { en: 'Finding the data takes time', fr: 'Trouver les données prend du temps' },
        polarity: 'negative',
        theme: 'other',
        verbatims: ['v1', 'v2'],
      },
      {
        statement: { en: 'Colleagues hold the knowledge', fr: 'Les collègues savent' },
        polarity: 'neutral',
        theme: 'other',
        verbatims: ['v1'],
      },
    ]
    await runAll(s)
    expect(s.memory.facts.size).toBe(2)
  })

  it('closes the run when the queue refuses it, so the study is not blocked', async () => {
    const s = setup()
    s.queue.accept = false
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'FACTS_RUNNING',
    })
    expect([...s.memory.runs.values()].every((r) => r.finishedAt !== null)).toBe(true)
    s.queue.accept = true
    expect((await s.commands.start('a1', 'st', { all: false, consent: true })).ok).toBe(true)
  })

  it('takes one interview out of a reading: nothing of it is kept, the others go on', async () => {
    const s = setup({
      interviews: [
        { id: 's1', title: 'Interview 1', people: [sam, alex], turns },
        { id: 's3', title: 'Interview 3', people: [sam, alex], turns },
      ],
    })
    const started = await s.commands.start('a1', 'st', { all: false, consent: true })
    if (!started.ok) throw new Error(started.error)
    const runId = started.value.runId
    expect(await s.commands.stopSession('a1', 'st', runId, 's1')).toEqual({
      ok: true,
      value: undefined,
    })
    // A second click gives the same answer; an interview not in the run is not found.
    expect((await s.commands.stopSession('a1', 'st', runId, 's1')).ok).toBe(true)
    expect(await s.commands.stopSession('a1', 'st', 'other-run', 's1')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    })
    expect(await s.commands.stopSession('a1', 'st', runId, 's9')).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    })
    await s.commands.runJob({ runId, studyId: 'st', all: false })
    const run = s.memory.runs.get(runId)
    expect(run?.sessions.map((x) => [x.sessionId, x.state, x.failure ?? null])).toEqual([
      ['s1', 'failed', 'STOPPED'],
      ['s3', 'done', null],
    ])
    expect([...s.memory.verbatims.values()].every((v) => v.sessionId === 's3')).toBe(true)
    // Taken out before the job started: its transcript is not even imported.
    expect(s.src.state.imports).toEqual(['s3'])
    expect(await s.commands.stopSession('a1', 'st', runId, 's3')).toEqual({
      ok: false,
      error: 'TOO_LATE_TO_STOP',
    })
  })

  it('refuses while an Enrichment run or another reading runs, and without provider', async () => {
    const s = setup()
    s.src.state.enrichmentLive = true
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'ENRICHMENT_RUNNING',
    })
    s.src.state.enrichmentLive = false
    expect((await s.commands.start('a1', 'st', { all: false, consent: true })).ok).toBe(true)
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'FACTS_RUNNING',
    })
  })

  it('follows the study access rules (FR-019)', async () => {
    const src = fakeSources({ interviews: [], access: (a) => a === 'a1' })
    const commands = makeAnalysisCommands(
      makeDeps({ sources: src.sources, ai: fakeFactsAi().ai, clock: fixedClock(NOW) }).deps,
    )
    expect(await commands.start('zoe', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
    expect(await commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'NOTHING_TO_ANALYSE',
    })
  })

  it('keeps decided facts and never proposes a rejected one again (FR-010, SC-008)', async () => {
    const s = setup()
    await runAll(s)
    const [first] = [...s.memory.facts.values()]
    if (!first) throw new Error('no fact')
    s.memory.facts.set(first.id, { ...first, status: 'rejected', version: 2 })
    await runAll(s, { all: true, consent: true })
    const facts = [...s.memory.facts.values()]
    expect(facts.map((f) => f.status)).toEqual(['rejected'])
    // The verbatims of the rejected fact are kept with it.
    expect(s.memory.verbatims.size).toBe(2)
  })

  it('fails the interviews left when the provider goes away', async () => {
    const s = setup({
      interviews: [
        { id: 's1', title: 'Interview 1', people: [sam, alex], turns },
        { id: 's3', title: 'Interview 3', people: [sam, alex], turns },
      ],
    })
    s.state.unavailable = true
    const runId = await runAll(s)
    expect(s.memory.runs.get(runId)?.sessions.map((x) => x.failure)).toEqual([
      'AI_PROVIDER_REQUIRED',
      'AI_PROVIDER_REQUIRED',
    ])
    expect(s.memory.facts.size).toBe(0)
  })

  it('estimates the parts and the cost of the interviews to read', async () => {
    const s = setup()
    const estimate = await s.commands.estimate('a1', 'st', { all: false })
    expect(estimate.ok && estimate.value).toMatchObject({
      interviews: 2,
      chunks: 1,
      consentNeeded: true,
      aiConnected: true,
    })
  })
})
