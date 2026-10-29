import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeAnalysisCommands } from '../application/commands/analysis-commands.ts'
import { makeFactCommands } from '../application/commands/fact-commands.ts'
import { fakeFactsAi, fakeSources, makeDeps } from './fakes/in-memory-evidence.ts'

const NOW = new Date('2026-10-28T10:00:00Z')
const actor = { id: 'a1' }
const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const lee = { name: 'Lee Sample', role: 'interviewee' as const, code: 'P02' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }

const turns = [
  { id: 'g1', speaker: 'Alex Martin', start: null, text: 'How do you find the data?' },
  {
    id: 'g2',
    speaker: 'Sam Example',
    start: null,
    text: 'I never find the data of my team quickly. It takes three tools.',
  },
  { id: 'g3', speaker: 'Speaker 2', start: null, text: 'For me the newsletter helps every week.' },
]

const setup = (people = [sam, alex]) => {
  const src = fakeSources({
    interviews: [{ id: 's1', title: 'Interview 1', people, turns }],
    themes: [{ id: 'sec-1', title: 'Finding data' }],
  })
  const fake = fakeFactsAi()
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  const analysis = makeAnalysisCommands(made.deps)
  const facts = makeFactCommands(made.deps)
  const read = async () => {
    const started = await analysis.start('a1', 'st', { all: true, consent: true })
    if (!started.ok) throw new Error(started.error)
    await analysis.runJob({ runId: started.value.runId, studyId: 'st', all: true })
  }
  return { ...made, ...fake, src, facts, read }
}

const firstFact = (s: ReturnType<typeof setup>) => {
  const [f] = [...s.memory.facts.values()]
  if (!f) throw new Error('no fact')
  return f
}

describe('Decide the facts (US2)', () => {
  it('accepts, then refuses a decision on a version seen before', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    const accepted = await s.facts.decide(actor, 'st', fact.id, {
      decision: 'accept',
      version: fact.version,
    })
    expect(accepted.ok && accepted.value.status).toBe('accepted')
    expect(
      await s.facts.decide(actor, 'st', fact.id, { decision: 'reject', version: fact.version }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('edits one language and translates the other in the background (FR-016)', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    const edited = await s.facts.decide(actor, 'st', fact.id, {
      decision: 'edit',
      version: fact.version,
      statement: { fr: 'Les données sont introuvables' },
      themeId: null,
    })
    expect(edited.ok && edited.value).toMatchObject({
      status: 'edited',
      translation: 'translating',
      theme: null,
    })
    expect(s.translations).toHaveLength(1)
    const job = s.translations[0]
    if (!job) throw new Error('no job')
    await s.facts.translateJob(job)
    expect(s.memory.facts.get(fact.id)).toMatchObject({
      statement: { en: '[en] Les données sont introuvables', fr: 'Les données sont introuvables' },
      translation: 'done',
    })
    expect(s.requests.at(-1)?.ref).toBe('facts-translation:s1')
  })

  it('marks a failed translation, and tries it again on request', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    await s.facts.decide(actor, 'st', fact.id, {
      decision: 'edit',
      version: fact.version,
      statement: { en: 'Data is hard to find' },
    })
    s.state.unavailable = true
    const job = s.translations[0]
    if (!job) throw new Error('no job')
    await s.facts.translateJob(job)
    expect(s.memory.facts.get(fact.id)?.translation).toBe('not-translated')
    expect(await s.facts.retryTranslation(actor, 'st', fact.id)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(s.translations).toHaveLength(2)
  })

  it('creates an accepted fact from a highlighted verbatim; refuses an interviewer turn or a short one', async () => {
    const s = setup()
    const added = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 42,
      length: 21,
    })
    expect(added.ok && added.value).toMatchObject({
      text: 'It takes three tools.',
      participant: 'P01',
      origin: 'person',
    })
    expect(
      await s.facts.addVerbatim(actor, 'st', 's1', { segmentId: 'g1', offset: 0, length: 25 }),
    ).toEqual({ ok: false, error: 'INTERVIEWER_TURN' })
    expect(
      await s.facts.addVerbatim(actor, 'st', 's1', { segmentId: 'g2', offset: 0, length: 7 }),
    ).toEqual({ ok: false, error: 'VERBATIM_LENGTH' })
    if (!added.ok) throw new Error('not added')
    const made = await s.facts.create(actor, 'st', {
      sessionId: 's1',
      statement: { en: 'Three tools are needed', fr: 'Trois outils sont nécessaires' },
      polarity: 'negative',
      themeId: 'sec-1',
      verbatims: [added.value.id],
    })
    expect(made.ok && made.value).toMatchObject({
      status: 'accepted',
      origin: 'person',
      theme: { id: 'sec-1', title: 'Finding data' },
      translation: 'done',
    })
    expect(
      await s.facts.create(actor, 'st', {
        sessionId: 's1',
        statement: { en: 'Sam needs tools' },
        polarity: 'negative',
        themeId: null,
        verbatims: [added.value.id],
      }),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })

  it('waits for a person to attribute an unknown speaker before a fact counts (research R8)', async () => {
    const s = setup([sam, lee, alex])
    const added = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g3',
      offset: 0,
      length: 39,
    })
    if (!added.ok) throw new Error(added.error)
    expect(added.value.participant).toBeNull()
    const input = {
      sessionId: 's1',
      statement: { en: 'The newsletter helps', fr: 'La lettre aide' },
      polarity: 'positive' as const,
      themeId: null,
      verbatims: [added.value.id],
    }
    expect(await s.facts.create(actor, 'st', input)).toEqual({
      ok: false,
      error: 'SPEAKER_TO_ATTRIBUTE',
    })
    expect(
      (
        await s.facts.attributeSpeaker(actor, 'st', 's1', {
          label: 'Speaker 2',
          participant: 'P02',
        })
      ).ok,
    ).toBe(true)
    expect((await s.facts.create(actor, 'st', input)).ok).toBe(true)
  })

  it('sets a verbatim aside: gone from facts to decide, never found again (FR-010)', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    const [v] = fact.verbatimIds
    if (!v) throw new Error('no verbatim')
    await s.facts.setAside(actor, 'st', 's1', v)
    expect(s.memory.facts.get(fact.id)?.verbatimIds ?? []).not.toContain(v)
    await s.read()
    const again = [...s.memory.verbatims.values()].filter((x) => !x.setAside)
    expect(again.some((x) => x.segmentId === s.memory.verbatims.get(v)?.segmentId)).toBe(false)
  })

  it('adds a highlighted verbatim to a fact without deciding it', async () => {
    const s = setup()
    await s.read()
    const fact = [...s.memory.facts.values()].find((f) => f.status === 'proposed')
    if (!fact) throw new Error('no proposed fact')
    const added = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 42,
      length: 21,
      fact: { id: fact.id, version: fact.version },
    })
    expect(added.ok).toBe(true)
    expect(s.memory.facts.get(fact.id)).toMatchObject({
      status: 'proposed',
      version: fact.version + 1,
    })
    expect(s.memory.facts.get(fact.id)?.verbatimIds).toContain(added.ok && added.value.id)
    expect(
      await s.facts.addVerbatim(actor, 'st', 's1', {
        segmentId: 'g2',
        offset: 0,
        length: 41,
        fact: { id: fact.id, version: fact.version },
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    // The fact changed meanwhile: no verbatim is left behind.
    expect(
      [...s.memory.verbatims.values()].filter((v) => v.origin === 'person' && v.offset === 0),
    ).toEqual([])
  })

  it('narrows a verbatim to the words a person selects, keeping its facts', async () => {
    const s = setup()
    const added = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 0,
      length: 63,
    })
    if (!added.ok) throw new Error('not added')
    const made = await s.facts.create(actor, 'st', {
      sessionId: 's1',
      statement: { en: 'Data is slow to find', fr: 'Les données sont longues à trouver' },
      polarity: 'negative',
      themeId: null,
      verbatims: [added.value.id],
    })
    if (!made.ok) throw new Error('no fact')
    const narrowed = await s.facts.resizeVerbatim(actor, 'st', 's1', added.value.id, {
      offset: 0,
      length: 41,
    })
    expect(narrowed.ok).toBe(true)
    expect(s.memory.verbatims.get(added.value.id)).toMatchObject({
      offset: 0,
      length: 41,
      text: 'I never find the data of my team quickly.',
      origin: 'person',
    })
    expect(s.memory.facts.get(made.value.id)?.verbatimIds).toEqual([added.value.id])
    expect(
      await s.facts.resizeVerbatim(actor, 'st', 's1', added.value.id, { offset: 0, length: 7 }),
    ).toEqual({ ok: false, error: 'VERBATIM_LENGTH' })
    expect(
      await s.facts.resizeVerbatim(actor, 'st', 's1', 'missing', { offset: 0, length: 41 }),
    ).toEqual({ ok: false, error: 'VERBATIM_NOT_FOUND' })
  })

  it('accepts all shown, counting those changed meanwhile', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    expect(
      await s.facts.acceptMany(actor, 'st', [
        { id: fact.id, version: fact.version },
        { id: 'gone', version: 1 },
      ]),
    ).toEqual({ ok: true, value: { done: 1, changed: 1 } })
  })

  it("refuses another study's interview: no speaker attributed, nothing set aside", async () => {
    const s = setup()
    expect(
      await s.facts.attributeSpeaker(actor, 'st', 'elsewhere', {
        label: 'Sam Example',
        participant: 'interviewer',
      }),
    ).toEqual({ ok: false, error: 'SESSION_NOT_FOUND' })
    expect((await s.memory.store.speakersOf('elsewhere')).size).toBe(0)
    expect(await s.facts.setAside(actor, 'st', 'elsewhere', 'any')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    })
  })

  it('translates from the language the person wrote, whatever is decided meanwhile', async () => {
    const s = setup()
    await s.read()
    const fact = firstFact(s)
    const edited = await s.facts.decide(actor, 'st', fact.id, {
      decision: 'edit',
      version: fact.version,
      statement: { en: 'Data is hard to find' },
    })
    if (!edited.ok) throw new Error(edited.error)
    // A polarity change before the translation runs: no new job, the first one still applies.
    const again = await s.facts.decide(actor, 'st', fact.id, {
      decision: 'edit',
      version: edited.value.version,
      polarity: 'neutral',
    })
    expect(again.ok).toBe(true)
    expect(s.translations).toHaveLength(1)
    const job = s.translations[0]
    if (!job) throw new Error('no job')
    await s.facts.translateJob(job)
    expect(s.memory.facts.get(fact.id)).toMatchObject({
      statement: { en: 'Data is hard to find', fr: '[fr] Data is hard to find' },
      polarity: 'neutral',
      translation: 'done',
    })
  })

  it('still decides a fact once one of its verbatims is set aside', async () => {
    const s = setup()
    const one = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 0,
      length: 41,
    })
    const two = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 42,
      length: 21,
    })
    if (!one.ok || !two.ok) throw new Error('not added')
    const made = await s.facts.create(actor, 'st', {
      sessionId: 's1',
      statement: { en: 'Data is slow to find', fr: 'Les données sont longues à trouver' },
      polarity: 'negative',
      themeId: null,
      verbatims: [one.value.id, two.value.id],
    })
    if (!made.ok) throw new Error('no fact')
    await s.facts.setAside(actor, 'st', 's1', one.value.id)
    const rejected = await s.facts.decide(actor, 'st', made.value.id, {
      decision: 'reject',
      version: made.value.version,
    })
    expect(rejected.ok && rejected.value.status).toBe('rejected')
  })

  it("moving a verbatim to another turn takes that turn's speaker", async () => {
    const s = setup([sam, lee, alex])
    await s.facts.attributeSpeaker(actor, 'st', 's1', { label: 'Speaker 2', participant: 'P02' })
    const added = await s.facts.addVerbatim(actor, 'st', 's1', {
      segmentId: 'g2',
      offset: 0,
      length: 41,
    })
    if (!added.ok) throw new Error('not added')
    expect(
      (
        await s.facts.resizeVerbatim(actor, 'st', 's1', added.value.id, {
          segmentId: 'g3',
          offset: 0,
          length: 39,
        })
      ).ok,
    ).toBe(true)
    expect(s.memory.verbatims.get(added.value.id)).toMatchObject({
      segmentId: 'g3',
      speaker: 'Speaker 2',
      participant: 'P02',
    })
  })
})
