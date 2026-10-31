import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeReviewCommands } from '../application/commands/review-commands.ts'
import type { ReviewRequest } from '../application/ports.ts'
import { makeQualityQueries } from '../application/queries/quality-queries.ts'
import type { SentAnswer } from '../domain/remarks.ts'
import { RUN_STALE_MS } from '../domain/review-run.ts'
import { fakeQualityAi, fakeSources, makeDeps } from './fakes/in-memory-quality.ts'

const NOW = new Date('2026-10-31T10:00:00Z')
const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }

const turns = [
  { id: 'g1', speaker: 'Alex Martin', start: null, text: 'How do you export the data, Sam?' },
  {
    id: 'g2',
    speaker: 'Sam Example',
    start: null,
    text: 'I export the file every week, and I hate waiting for it.',
  },
  {
    id: 'g3',
    speaker: 'Alex Martin',
    start: null,
    text: 'So you export it every week? You find this tool too slow, right? OK.',
  },
  { id: 'g4', speaker: 'Sam Example', start: null, text: 'Yes, somewhat slow, I would say so.' },
]

const flag = (over: Partial<NonNullable<SentAnswer['flag']>> = {}) => ({
  kind: 'leading-question' as const,
  reason: { en: 'It suggests the answer.', fr: 'Elle suggère la réponse.' },
  recommendation: 'How does this tool feel to you?',
  addedElement: null,
  excerpt: null,
  ...over,
})

/** Answers by the text of a sentence, whatever its id. */
const byText =
  (rules: Record<string, Omit<SentAnswer, 'id'>>) =>
  (request: ReviewRequest): SentAnswer[] =>
    request.turns.flatMap((t) =>
      t.sentences.flatMap((s) => {
        const rule = rules[s.text]
        return rule ? [{ id: s.id, ...rule }] : []
      }),
    )

const standard = byText({
  'How do you export the data, [Person 1]?': { kind: 'question' },
  'So you export it every week?': { kind: 'simple-reformulation' },
  'You find this tool too slow, right?': { kind: 'question', flag: flag() },
})

const setup = (
  over: {
    interviews?: Parameters<typeof fakeSources>[0]['interviews']
    answer?: (request: ReviewRequest) => readonly SentAnswer[]
    access?: (accountId: string) => boolean
    folderAccess?: (accountId: string) => boolean
    names?: string[]
  } = {},
) => {
  const src = fakeSources({
    interviews: over.interviews ?? [{ id: 's1', title: 'Interview 1', people: [sam, alex], turns }],
    names: over.names ?? [],
    ...(over.access ? { access: over.access } : {}),
    ...(over.folderAccess ? { folderAccess: over.folderAccess } : {}),
  })
  const fake = fakeQualityAi(over.answer ?? standard)
  const clock = { now: fixedClock(NOW).now }
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock })
  const commands = makeReviewCommands(made.deps)
  const queries = makeQualityQueries(made.deps)
  return { ...made, ...fake, src, commands, queries, clock }
}

const review = async (s: ReturnType<typeof setup>, input = { all: false, consent: true }) => {
  const started = await s.commands.start('a1', 'st', input)
  if (!started.ok) throw new Error(started.error)
  await s.commands.runJob({ runId: started.value.runId, studyId: 'st', anyway: false })
  return started.value.runId
}

describe('the review of the interviews (US1)', () => {
  it('counts sentences and questions by label, keeps remarks and simple reformulations', async () => {
    const s = setup()
    await review(s)
    expect(s.memory.counts()).toEqual([
      {
        sessionId: 's1',
        studyId: 'st',
        speakerLabel: 'Alex Martin',
        sentences: 3,
        questions: 2,
      },
    ])
    expect(s.memory.reformulations().map((r) => [r.segmentId, r.text])).toEqual([
      ['g3', 'So you export it every week?'],
    ])
    const [remark] = s.memory.remarks()
    expect(remark?.text).toBe('You find this tool too slow, right?')
    expect(remark?.kind).toBe('leading-question')
    expect(remark?.stance).toBeNull()
    const text = turns[2]?.text ?? ''
    expect(text.slice(remark?.offset, (remark?.offset ?? 0) + (remark?.length ?? 0))).toBe(
      remark?.text,
    )
  })

  it('leaves out fragments and sends no sentence for interviewee turns', async () => {
    const s = setup()
    await review(s)
    const sent = s.requests.flatMap((r) => r.turns)
    expect(sent.find((t) => t.speaker.startsWith('interviewee'))?.sentences).toEqual([])
    expect(sent.flatMap((t) => t.sentences.map((x) => x.text))).not.toContain('OK.')
  })

  it('sends no name the app knows, and reads placeholders back (SC-005)', async () => {
    const s = setup({
      answer: (request) => {
        const id = request.turns[0]?.sentences[0]?.id ?? ''
        return [
          {
            id,
            kind: 'question',
            flag: flag({
              recommendation: 'How do you export the data, [Person 3]?',
              reason: { en: 'About [Person 3].', fr: 'Sur [Person 3].' },
            }),
          },
        ]
      },
      names: ['Lee Sample'],
      interviews: [
        {
          id: 's1',
          title: 'Interview 1',
          people: [sam, alex],
          turns: [
            ...turns,
            { id: 'g5', speaker: 'Sam Example', start: null, text: 'Lee Sample told me so.' },
          ],
        },
      ],
    })
    await review(s)
    const sent = JSON.stringify(s.requests)
    for (const name of ['Sam', 'Example', 'Alex', 'Martin', 'Lee', 'Sample'])
      expect(sent).not.toContain(name)
    const [remark] = s.memory.remarks()
    expect(remark?.text).toBe('How do you export the data, Sam?')
    expect(remark?.recommendation).toContain('Lee Sample')
  })

  it('records every call under its interview and shows their sum (SC-006)', async () => {
    const s = setup()
    const runId = await review(s)
    expect(s.refs).toEqual([`quality:${runId}:s1`])
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.cost).toBeCloseTo(0.01)
    expect(view.value.lastRunCost).toBeCloseTo(0.01)
    expect(view.value.interviews[0]?.cost).toBeCloseTo(0.01)
  })

  it('makes no call for a part without interviewer sentence', async () => {
    const s = setup({
      interviews: [
        {
          id: 's1',
          title: 'I',
          people: [sam, alex],
          turns: [
            { id: 'g1', speaker: 'Alex Martin', start: null, text: 'OK.' },
            { id: 'g2', speaker: 'Sam Example', start: null, text: 'I export every week.' },
          ],
        },
      ],
    })
    await review(s)
    expect(s.requests).toEqual([])
    expect(s.memory.evaluations.get('s1')).toBeDefined()
  })

  it('skips the turns of an unidentified speaker and counts them', async () => {
    const lee = { name: 'Lee Sample', role: 'interviewee' as const, code: 'P02' }
    const s = setup({
      interviews: [
        {
          id: 's1',
          title: 'I',
          people: [sam, lee, alex],
          turns: [
            ...turns,
            { id: 'g5', speaker: 'Speaker 3', start: null, text: 'Is that really what you do?' },
          ],
        },
      ],
    })
    await review(s)
    expect(s.memory.evaluations.get('s1')?.turnsSkipped).toBe(1)
    const texts = s.requests.flatMap((r) => r.turns).flatMap((t) => t.sentences.map((x) => x.text))
    expect(texts).not.toContain('Is that really what you do?')
  })

  it('retries a part once, and a failed interview does not stop the others', async () => {
    const broken = [
      ...turns,
      { id: 'g5', speaker: 'Alex Martin', start: null, text: 'This part always fails here.' },
    ]
    const s = setup({
      interviews: [
        { id: 's1', title: 'A', people: [sam, alex], turns: broken },
        { id: 's2', title: 'B', people: [sam, alex], turns },
      ],
    })
    s.state.failFor = (request) => JSON.stringify(request).includes('always fails')
    await review(s)
    const run = [...s.memory.runs.values()][0]
    expect(run?.sessions.find((p) => p.sessionId === 's1')?.failure).toBe('AI_FAILED')
    expect(run?.sessions.find((p) => p.sessionId === 's2')?.state).toBe('done')
    expect(s.state.failures).toBe(2)
    expect(run?.finishedAt).not.toBeNull()
    expect(s.memory.evaluations.has('s1')).toBe(false)
  })

  it('goes on when the second try of a part works', async () => {
    const s = setup()
    let calls = 0
    s.state.failFor = () => ++calls === 1
    await review(s)
    expect([...s.memory.runs.values()][0]?.sessions[0]?.state).toBe('done')
  })

  it('imports the transcripts first and keeps a failed import as the failure', async () => {
    const s = setup({
      interviews: [{ id: 's1', title: 'A', people: [sam, alex], turns: null, file: true }],
    })
    s.src.state.importFailures.set('s1', 'DRIVE_UNAVAILABLE')
    await review(s)
    expect(s.src.state.imports).toEqual(['s1'])
    expect([...s.memory.runs.values()][0]?.sessions[0]?.failure).toBe('DRIVE_UNAVAILABLE')
  })

  it('reads nothing of an interview not measurable, unless a person asks', async () => {
    const speech = Array.from({ length: 200 }, () => 'word').join(' ')
    const talky = [
      { id: 'g1', speaker: 'Alex Martin', start: null, text: `${speech}?` },
      { id: 'g2', speaker: 'Sam Example', start: null, text: 'Yes I do.' },
    ]
    const s = setup({ interviews: [{ id: 's1', title: 'A', people: [sam, alex], turns: talky }] })
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'NOTHING_TO_REVIEW',
    })
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.interviews[0]?.state).toBe('not-measurable')
    expect(view.value.overall).toBeNull()
    const anyway = await s.commands.start('a1', 'st', {
      all: false,
      consent: true,
      sessionIds: ['s1'],
    })
    expect(anyway.ok).toBe(true)
    expect(s.jobs[0]?.anyway).toBe(true)
  })

  it('stops: the interviews still open are interrupted', async () => {
    const s = setup()
    const started = await s.commands.start('a1', 'st', { all: false, consent: true })
    if (!started.ok) throw new Error(started.error)
    await s.commands.stop('a1', 'st', started.value.runId)
    await s.commands.runJob({ runId: started.value.runId, studyId: 'st', anyway: false })
    const run = s.memory.runs.get(started.value.runId)
    expect(run?.sessions[0]?.failure).toBe('INTERRUPTED')
    expect(s.requests).toEqual([])
    expect(s.memory.remarks()).toEqual([])
  })

  it('estimates the interviews, parts and cost before running', async () => {
    const s = setup()
    const estimate = await s.commands.estimate('a1', 'st', { all: false })
    expect(estimate).toEqual({
      ok: true,
      value: { interviews: 1, chunks: 1, cost: 0.5, consentNeeded: true, aiConnected: true },
    })
    expect(s.requests).toEqual([])
  })
})

describe('the rules of a review', () => {
  it('counts a reformulation with opinion failing the check as simple (US3)', async () => {
    const s = setup({
      answer: byText({
        'So you export it every week?': {
          kind: 'question',
          flag: flag({ kind: 'reformulation-with-opinion', addedElement: 'export every week' }),
        },
      }),
    })
    await review(s)
    expect(s.memory.remarks()).toEqual([])
    expect(s.memory.reformulations().map((r) => r.text)).toEqual(['So you export it every week?'])
    expect(s.memory.evaluations.get('s1')?.leftOut).toBe(1)
  })

  it('checks what a reformulation adds only against what was said before it', async () => {
    const s = setup({
      answer: byText({
        'You find this tool too slow, right?': {
          kind: 'question',
          // "slow" is said, but only after the sentence.
          flag: flag({ kind: 'reformulation-with-opinion', addedElement: 'slow' }),
        },
      }),
    })
    await review(s)
    expect(s.memory.remarks().map((r) => r.kind)).toEqual(['reformulation-with-opinion'])
  })

  it('drops what the AI says about a sentence never sent', async () => {
    const s = setup({ answer: () => [{ id: 't99.1', kind: 'question', flag: flag() }] })
    await review(s)
    expect(s.memory.remarks()).toEqual([])
    expect(s.memory.evaluations.get('s1')?.leftOut).toBe(1)
  })

  it('keeps a remark with an opinion when the interview is reviewed again', async () => {
    const s = setup()
    await review(s)
    const first = s.memory.remarks()[0]
    s.memory.setStance(first?.id ?? '', 'agree')
    await review(s, { all: true, consent: true })
    expect(s.memory.remarks().map((r) => r.id)).toContain(first?.id)
  })
})

describe('exclusive runs (FR-013)', () => {
  it('waits for the Enrichment runs and the facts reading', async () => {
    const s = setup()
    s.src.state.enrichmentLive = true
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'ENRICHMENT_RUNNING',
    })
    s.src.state.enrichmentLive = false
    s.src.state.factsLive = true
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'FACTS_RUNNING',
    })
  })

  it('has one review per study, and frees the study when a run dies or the queue refuses', async () => {
    const s = setup()
    await s.commands.start('a1', 'st', { all: false, consent: true })
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'QUALITY_RUNNING',
    })
    s.clock.now = () => new Date(NOW.getTime() + RUN_STALE_MS + 1)
    expect((await s.commands.start('a1', 'st', { all: false, consent: true })).ok).toBe(true)
    const fresh = setup()
    fresh.queue.refuse = true
    expect(await fresh.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'QUALITY_RUNNING',
    })
    expect(await fresh.memory.store.openRun('st')).toBeNull()
  })
})

describe('consent (FR-014)', () => {
  it('is asked once, and again when the provider changes', async () => {
    const s = setup()
    expect(await s.commands.start('a1', 'st', { all: false, consent: false })).toEqual({
      ok: false,
      error: 'QUALITY_CONSENT_REQUIRED',
    })
    await s.commands.giveConsent('a1', 'st')
    expect(await s.commands.estimate('a1', 'st', { all: false })).toMatchObject({
      value: { consentNeeded: false },
    })
    s.state.provider = 'openai'
    expect(await s.commands.estimate('a1', 'st', { all: false })).toMatchObject({
      value: { consentNeeded: true },
    })
  })

  it('refuses without a provider', async () => {
    const s = setup()
    s.state.provider = null
    expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual({
      ok: false,
      error: 'AI_PROVIDER_REQUIRED',
    })
  })
})

describe('study access (FR-016)', () => {
  it('gives nothing to a person outside the study, or without its folder', async () => {
    for (const denied of [{ access: () => false }, { folderAccess: () => false }]) {
      const s = setup(denied)
      const error = denied.access ? 'STUDY_NOT_FOUND' : 'FOLDER_ACCESS_REQUIRED'
      const out = { ok: false, error }
      expect(await s.queries.overview('a1', 'st')).toEqual(out)
      expect(await s.commands.estimate('a1', 'st', { all: false })).toEqual(out)
      expect(await s.commands.giveConsent('a1', 'st')).toEqual(out)
      expect(await s.commands.start('a1', 'st', { all: false, consent: true })).toEqual(out)
      expect(await s.commands.stop('a1', 'st', 'r')).toEqual(out)
    }
  })
})

describe('the overview', () => {
  it('makes no AI call and shows no figure nor cost before a review', async () => {
    const s = setup()
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect(s.requests).toEqual([])
    expect(view.value.overall).toBeNull()
    expect(view.value.cost).toBeNull()
    expect(view.value.interviews[0]?.state).toBe('not-reviewed')
  })

  it('gives figures that add up: a disagreed remark no longer counts, and stays shown', async () => {
    const s = setup()
    await review(s)
    s.memory.setStance(s.memory.remarks()[0]?.id ?? '', 'disagree')
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.overall?.questions).toBe(2)
    expect(view.value.overall?.simpleReformulations).toBe(1)
    expect(view.value.overall?.leading.questions).toEqual({ agreed: 0, noOpinion: 0, disagreed: 1 })
    expect(view.value.interviews[0]?.state).toBe('reviewed')
  })

  it('shows no name under anonymisation', async () => {
    const s = setup()
    s.src.state.anonymised = true
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.interviews[0]?.interviewers).toEqual(['I01'])
  })
})

describe('review of PR #25', () => {
  const overview = async (s: ReturnType<typeof setup>) => {
    const view = await s.queries.overview('a1', 'st')
    if (!view.ok) throw new Error(view.error)
    return view.value
  }

  it('shows a run no heartbeat reaches as interrupted, its own row included', async () => {
    const s = setup()
    await s.commands.start('a1', 'st', { all: false, consent: true })
    expect((await overview(s)).run?.finished).toBe(false)
    const later = new Date(NOW.getTime() + RUN_STALE_MS + 1)
    s.clock.now = () => later
    const view = await overview(s)
    expect(view.run).toMatchObject({ finished: true, failed: 1 })
    expect(view.interviews[0]).toMatchObject({ reading: null, failure: 'INTERRUPTED' })
    // Only shown so: the run itself is left as it is, and comes back if it wakes.
    expect(view.interviews[0]?.state).toBe('not-reviewed')
  })

  it('shows on its interview what "Review anyway" found, and leaves it out of the totals', async () => {
    const talks = [
      { id: 'g1', speaker: 'Alex Martin', start: null, text: `${'word '.repeat(99)}right?` },
      { id: 'g2', speaker: 'Sam Example', start: null, text: 'Yes.' },
    ]
    const s = setup({
      interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: talks }],
      answer: (request) =>
        request.turns.flatMap((t) =>
          t.sentences.map((x) => ({ id: x.id, kind: 'question' as const, flag: flag() })),
        ),
    })
    const started = await s.commands.start('a1', 'st', {
      all: false,
      consent: true,
      sessionIds: ['s1'],
    })
    if (!started.ok) throw new Error(started.error)
    await s.commands.runJob({ runId: started.value.runId, studyId: 'st', anyway: true })
    const view = await overview(s)
    expect(view.interviews[0]?.state).toBe('not-measurable')
    expect(view.interviews[0]?.figures?.leading.questions.noOpinion).toBe(1)
    expect(view).toMatchObject({ overall: null, reviewed: 0 })
    const one = await s.queries.interview('a1', 'st', 's1')
    expect(one.ok && one.value.remarks).toHaveLength(1)
  })

  it('estimates interviews not imported from one it imports, or says it does not know', async () => {
    const pending = [
      { id: 's1', title: 'A', people: [sam, alex], turns: null, file: true },
      { id: 's2', title: 'B', people: [sam, alex], turns: null, file: true },
    ]
    const s = setup({ interviews: pending })
    const unknown = await s.commands.estimate('a1', 'st', { all: false })
    expect(s.src.state.imports).toEqual(['s1'])
    expect(unknown).toMatchObject({ ok: true, value: { interviews: 2, chunks: 0, cost: null } })
    const imports = s.deps.sources.importTranscripts
    s.deps.sources.importTranscripts = async (a, b, ids) => {
      const list = pending as { id: string; turns: unknown }[]
      for (const p of list) if (ids.includes(p.id)) p.turns = turns
      return imports(a, b, ids)
    }
    const known = await s.commands.estimate('a1', 'st', { all: false })
    expect(known).toMatchObject({ ok: true, value: { interviews: 2, chunks: 2, cost: 0.5 } })
  })

  it('shows no name a review stored once anonymisation is on, nor keeps one read back', async () => {
    const answer = byText({
      'You find this tool too slow, right?': {
        kind: 'question',
        flag: flag({ recommendation: 'Ask [Person 1] how it feels.' }),
      },
    })
    const named = [
      turns[0],
      turns[1],
      {
        id: 'g3',
        speaker: 'Alex Martin',
        start: null,
        text: 'You find this tool too slow, right?',
      },
    ].filter((t) => t !== undefined)
    const s = setup({
      interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: named }],
      answer,
    })
    await review(s)
    expect(s.memory.remarks()[0]?.recommendation).toBe('Ask Sam Example how it feels.')
    s.src.state.anonymised = true
    const shown = await s.queries.interview('a1', 'st', 's1')
    expect(shown.ok && shown.value.remarks[0]?.recommendation).toBe('Ask P01 how it feels.')
    await review(s, { all: true, consent: true })
    expect(s.memory.remarks()[0]?.recommendation).toBe('Ask P01 how it feels.')
  })

  it('finds an excerpt holding a first name, and adds nothing with a name already said', async () => {
    const said = [
      { id: 'g1', speaker: 'Sam Example', start: null, text: 'Sam here, and I export every week.' },
      { id: 'g2', speaker: 'Alex Martin', start: null, text: 'So, Sam, you export weekly, right?' },
      { id: 'g3', speaker: 'Alex Martin', start: null, text: 'Well, Sam, this is slow for sure.' },
    ]
    const s = setup({
      interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: said }],
      answer: byText({
        'So, [Person 1], you export weekly, right?': {
          kind: 'question',
          flag: flag({ kind: 'reformulation-with-opinion', addedElement: '[Person 1]' }),
        },
        'Well, [Person 1], this is slow for sure.': {
          kind: 'other',
          flag: flag({ kind: 'opinion', excerpt: '[Person 1], this is slow' }),
        },
      }),
    })
    await review(s)
    expect(s.memory.reformulations().map((r) => r.segmentId)).toEqual(['g2'])
    expect(s.memory.remarks().map((r) => r.text)).toEqual(['Sam, this is slow'])
  })

  it('tells two people apart in what a reformulation adds, and keeps each spelling', async () => {
    const said = [
      { id: 'g1', speaker: 'Sam Example', start: null, text: 'Sam here, and I export every week.' },
      { id: 'g2', speaker: 'Alex Martin', start: null, text: 'So you talked with Lee Kim, right?' },
      { id: 'g3', speaker: 'Alex Martin', start: null, text: "Sam Example, is Sam's tool slow?" },
    ]
    const s = setup({
      names: ['Lee Kim'],
      interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: said }],
      answer: byText({
        'So you talked with [Person 3], right?': {
          kind: 'question',
          flag: flag({ kind: 'reformulation-with-opinion', addedElement: '[Person 3]' }),
        },
        "[Person 1], is [Person 1]'s tool slow?": {
          kind: 'question',
          flag: flag({ excerpt: "[Person 1]'s tool slow" }),
        },
      }),
    })
    await review(s)
    expect(s.memory.remarks().map((r) => r.text)).toEqual([
      'So you talked with Lee Kim, right?',
      "Sam's tool slow",
    ])
    expect(s.memory.remarks()[0]?.addedElement).toBe('Lee Kim')
  })

  it('keeps a dead run looked at, and hides figures until speakers are known', async () => {
    const s = setup()
    await s.commands.start('a1', 'st', { all: false, consent: true })
    const later = new Date(NOW.getTime() + RUN_STALE_MS + 1)
    s.clock.now = () => later
    expect((await overview(s)).run).toMatchObject({ finished: true, dormant: true })
    const other = setup()
    await review(other)
    other.deps.sources.people = async () => ({ s1: [sam] })
    const view = await overview(other)
    expect(view.interviews[0]?.state).toBe('speakers-not-identified')
    expect(view.interviews[0]?.figures).toBeNull()
  })

  it('asks to review again when a person says another speaker is an interviewer', async () => {
    const attributions = new Map<string, string>()
    const talks = [
      { id: 'g1', speaker: 'Alex Martin', start: null, text: 'How do you export your data?' },
      { id: 'g2', speaker: 'Sam Example', start: null, text: 'Every week, with the old tool.' },
      { id: 'g3', speaker: 'Room', start: null, text: 'And is that fine with you all?' },
    ]
    const s = setup({
      interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: talks, attributions }],
    })
    attributions.set('Room', 'P01')
    await review(s)
    expect((await overview(s)).interviews[0]?.state).toBe('reviewed')
    attributions.set('Room', 'interviewer')
    expect((await overview(s)).interviews[0]?.state).toBe('to-review-again')
  })

  it('never asks who speaks the note ending a transcript', async () => {
    const ended = [
      ...turns,
      { id: 'g5', speaker: 'Transcription terminée après', start: null, text: 'Generated.' },
    ]
    const s = setup({ interviews: [{ id: 's1', title: 'I', people: [sam, alex], turns: ended }] })
    const one = await s.queries.interview('a1', 'st', 's1')
    expect(one.ok && one.value.speakers.map((x) => x.label)).toEqual(['Alex Martin', 'Sam Example'])
  })
})
