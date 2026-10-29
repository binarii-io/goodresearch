import { describe, expect, it } from 'vitest'
import type { StoredVerbatim } from '../application/ports.ts'
import type { Fact } from '../domain/facts.ts'
import { inMemoryEvidenceStore } from './fakes/in-memory-evidence.ts'

const at = new Date('2026-10-29T10:00:00Z')
const verbatim = (id: string): StoredVerbatim => ({
  id,
  sessionId: 's1',
  studyId: 'st',
  segmentId: 'g1',
  offset: 0,
  length: 4,
  text: 'text',
  speaker: 'Speaker',
  participant: 'P01',
  reason: null,
  origin: 'ai',
  runId: 'r2',
  setAside: false,
  createdBy: 'p1',
  createdAt: at,
})
const fact = (id: string, status: Fact['status'], verbatimIds: string[]): Fact => ({
  id,
  sessionId: 's1',
  studyId: 'st',
  statement: { en: id, fr: id },
  translation: 'done',
  polarity: 'neutral',
  theme: null,
  verbatimIds,
  origin: 'ai',
  status,
  runId: 'r1',
  decidedBy: null,
  decidedAt: null,
  version: 1,
})

/** A fact decided while a reading ran keeps its own verbatims; none is left behind for it. */
describe('replaceReading with a fact decided meanwhile (review of PR #14)', () => {
  it('skips the fact and the new verbatims only it cited', async () => {
    const memory = inMemoryEvidenceStore()
    memory.facts.set('f1', fact('f1', 'accepted', ['v-old']))
    await memory.store.replaceReading({
      sessionId: 's1',
      keep: [],
      verbatims: [verbatim('v-new'), verbatim('v-shared')],
      facts: [fact('f1', 'proposed', ['v-new', 'v-shared']), fact('f2', 'proposed', ['v-shared'])],
      reading: {
        sessionId: 's1',
        studyId: 'st',
        runId: 'r2',
        readAt: at,
        rawImportedAt: at,
        textAnalysed: 'with-corrections',
        anonymised: false,
        fingerprint: 'x',
      },
    })
    expect(memory.facts.get('f1')?.status).toBe('accepted')
    expect([...memory.verbatims.keys()].sort()).toEqual(['v-shared'])
    expect(memory.facts.has('f2')).toBe(true)
  })
})
