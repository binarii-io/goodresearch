import { describe, expect, it } from 'vitest'
import type { StoredVerbatim } from '../application/ports.ts'
import { makeSynthesisReads } from '../application/queries/synthesis-reads.ts'
import type { Fact, FactStatus } from '../domain/facts.ts'
import { inMemoryEvidenceStore } from './fakes/in-memory-evidence.ts'

const at = new Date('2026-10-29T10:00:00Z')
const verbatim = (id: string, participant: string | null, setAside = false): StoredVerbatim => ({
  id,
  sessionId: 's1',
  studyId: 'st',
  segmentId: 'g1',
  offset: 0,
  length: 4,
  text: 'text',
  speaker: 'Speaker',
  participant,
  reason: null,
  origin: 'ai',
  runId: null,
  setAside,
  createdBy: 'p1',
  createdAt: at,
})
const fact = (id: string, status: FactStatus, verbatimIds: string[], studyId = 'st'): Fact => ({
  id,
  sessionId: 's1',
  studyId,
  statement: { en: `Fact ${id}`, fr: `Fait ${id}` },
  translation: 'done',
  polarity: 'negative',
  theme: { id: 't1', title: 'Finding data' },
  verbatimIds,
  origin: 'ai',
  status,
  runId: null,
  decidedBy: 'p1',
  decidedAt: at,
  version: 2,
})

const setup = () => {
  const memory = inMemoryEvidenceStore()
  for (const v of [verbatim('v1', 'P01'), verbatim('v2', 'P02'), verbatim('v3', 'P03', true)])
    memory.verbatims.set(v.id, v)
  for (const f of [
    fact('f1', 'accepted', ['v1', 'v2']),
    fact('f2', 'edited', ['v3', 'v1']),
    fact('f3', 'proposed', ['v1']),
    fact('f4', 'rejected', ['v2']),
    fact('f5', 'accepted', ['v1'], 'other-study'),
  ])
    memory.facts.set(f.id, f)
  return makeSynthesisReads(memory.store)
}

describe('Evidence reads for Synthesis (spec 013 research R1)', () => {
  it('gives the facts of the studies not rejected, with their participants', async () => {
    const facts = await setup().projectFacts(['st'])
    expect(facts.map((f) => f.id)).toEqual(['f1', 'f2', 'f3'])
    expect(facts[0]).toMatchObject({
      studyId: 'st',
      sessionId: 's1',
      statement: { en: 'Fact f1', fr: 'Fait f1' },
      polarity: 'negative',
      theme: { id: 't1', title: 'Finding data' },
      status: 'accepted',
      participants: ['P01', 'P02'],
      version: 2,
    })
  })

  it('leaves out the participants of verbatims set aside', async () => {
    const facts = await setup().projectFacts(['st'])
    expect(facts[1]?.participants).toEqual(['P01'])
  })

  it('counts in the Overview only the facts of the interviews Analysis shows', async () => {
    const memory = inMemoryEvidenceStore()
    for (const f of [
      fact('f1', 'accepted', []),
      fact('f2', 'edited', []),
      fact('f3', 'proposed', []),
      fact('f4', 'rejected', []),
      { ...fact('f5', 'proposed', []), sessionId: 'excluded-since' },
      fact('f6', 'proposed', [], 'other-study'),
    ])
      memory.facts.set(f.id, f)
    // Counting must not read any fact.
    memory.store.factsOfStudy = async () => {
      throw new Error('facts read')
    }
    const counts = await makeSynthesisReads(memory.store).studyCounts('st', ['s1'])
    expect([...counts].sort((a, b) => a.status.localeCompare(b.status))).toEqual([
      { status: 'accepted', count: 1 },
      { status: 'edited', count: 1 },
      { status: 'proposed', count: 1 },
      { status: 'rejected', count: 1 },
    ])
  })

  it('gives any fact by id, whatever its status; a deleted one is absent', async () => {
    const facts = await setup().factsByIds(['f4', 'f3', 'gone'])
    expect(facts.map((f) => [f.id, f.status])).toEqual([
      ['f4', 'rejected'],
      ['f3', 'proposed'],
    ])
  })

  it('keeps in the costs the translations of a session read and deleted since', async () => {
    const memory = inMemoryEvidenceStore()
    memory.store.runsOf = async () => [{ id: 'r', sessions: [{ sessionId: 'gone' }] }] as never
    const refs = await makeSynthesisReads(memory.store).studyCostRefs('st', ['s1'])
    expect(refs).toHaveLength(3)
    expect(refs.filter((r) => r.includes('gone'))).toHaveLength(2)
  })
})
