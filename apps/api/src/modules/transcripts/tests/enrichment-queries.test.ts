import { describe, expect, it } from 'vitest'
import { makeLexiconCommands } from '../application/commands/lexicon-commands.ts'
import { makeEnrichmentQueries } from '../application/queries/enrichment-queries.ts'
import { fakeSources, testDeps } from './fakes/in-memory-transcripts.ts'

const ACTOR = { id: 'p1', role: 'member' as const }

const session = (id: string, text: string) => ({
  id,
  title: `Interview ${id}`,
  interviewDate: null,
  language: 'en' as const,
  transcript: { fileId: `f-${id}`, name: `${id}.txt`, mimeType: 'text/plain', modifiedAt: null },
  text,
})

describe('every occurrence of a term (spec 010)', () => {
  it('is counted in the imported text, whatever the places stored', async () => {
    const text = `Lee: ${'We use Goodresearch daily. '.repeat(60)}`
    const sources = fakeSources({ sessions: [session('a', text)] })
    const { deps, memory } = testDeps({ sources: sources.sources })
    const commands = makeLexiconCommands(deps)
    const queries = makeEnrichmentQueries(deps)
    const started = await commands.startRun(ACTOR, 'study', { consent: true })
    if (!started.ok) throw new Error(started.error)
    await commands.runJob({ runId: started.value.runId, studyId: 'study' })
    const term = [...memory.terms.values()].find((t) => t.form === 'Goodresearch')
    if (!term) throw new Error('no term')
    // Places stored by an older version: few, without their length.
    memory.occurrences.set(
      'study',
      (memory.occurrences.get('study') ?? []).map((o) => ({
        ...o,
        anchors: o.anchors.slice(0, 1).map(({ segmentId, offset }) => ({ segmentId, offset })),
      })),
    )
    const page = await queries.lexicon('p1', 'study', { status: 'all' })
    expect(page.ok && page.value.terms.find((t) => t.id === term.id)?.occurrences[0]?.count).toBe(
      60,
    )
    const all = await queries.occurrences('p1', 'study', term.id)
    if (!all.ok) throw new Error(all.error)
    const [found] = all.value.occurrences
    expect(found?.count).toBe(60)
    expect(found?.quotes).toHaveLength(60)
    expect(found?.quotes.every((q) => q.match === 'Goodresearch')).toBe(true)
    expect(await queries.occurrences('p1', 'other-team', term.id)).toMatchObject({
      ok: false,
      error: 'TERM_NOT_FOUND',
    })
  })
})

describe('the lexicon list carries what the table shows (spec 032)', () => {
  it('gives counts without quotes; a term gives its quotes when it is opened', async () => {
    const sources = fakeSources({
      sessions: [
        session('a', `Lee: ${'We use Goodresearch daily. '.repeat(10)}`),
        session('b', 'Lee: Goodresearch again, and Goodresearch once more.'),
      ],
    })
    const { deps, memory } = testDeps({ sources: sources.sources })
    const commands = makeLexiconCommands(deps)
    const queries = makeEnrichmentQueries(deps)
    const started = await commands.startRun(ACTOR, 'study', { consent: true })
    if (!started.ok) throw new Error(started.error)
    await commands.runJob({ runId: started.value.runId, studyId: 'study' })
    const term = [...memory.terms.values()].find((t) => t.form === 'Goodresearch')
    if (!term) throw new Error('no term')

    const page = await queries.lexicon('p1', 'study', { status: 'all' })
    if (!page.ok) throw new Error(page.error)
    const listed = page.value.terms.find((t) => t.id === term.id)
    expect(listed?.occurrences.map((o) => [o.sessionId, o.count, o.quotes])).toEqual([
      ['a', 10, []],
      ['b', 2, []],
    ])

    const opened = await queries.termQuotes('p1', 'study', term.id)
    if (!opened.ok) throw new Error(opened.error)
    const every = await queries.occurrences('p1', 'study', term.id)
    if (!every.ok) throw new Error(every.error)
    // Three quotes an interview, as the list carried them before.
    expect(opened.value.occurrences).toEqual(
      every.value.occurrences.map((o) => ({ ...o, quotes: o.quotes.slice(0, 3) })),
    )
    expect(await queries.termQuotes('p1', 'other-team', term.id)).toMatchObject({
      ok: false,
      error: 'TERM_NOT_FOUND',
    })
  })
})
