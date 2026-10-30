import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeDebriefCommands } from '../application/commands/debrief-commands.ts'
import { makeInsightCommands } from '../application/commands/insight-commands.ts'
import { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import { makeDebriefQueries } from '../application/queries/debrief-queries.ts'
import { presentationOf } from '../domain/deck-pages.ts'
import { fakeInsightsAi, fakeSources, makeDeps, sourceFact } from './fakes/in-memory-synthesis.ts'

const NOW = new Date('2026-10-29T10:00:00Z')
const study = { id: 'st', name: 'Interviews', access: true, type: 'interviews', hasFolder: true }
const none = { en: 'None', fr: 'Aucun' }

const setup = async (options: { closed?: boolean } = {}) => {
  const src = fakeSources({
    studies: [
      study,
      ...(options.closed
        ? [{ id: 'st2', name: 'Closed', access: false, type: 'interviews', hasFolder: true }]
        : []),
    ],
    facts: [
      ...['P01', 'P02', 'P03', 'P04', 'P05'].map((p, i) => sourceFact(`a${i + 1}`, p)),
      sourceFact('b1', 'P06', { theme: { id: 'g2', title: 'Sharing' } }),
    ],
    names: ['Sam Example'],
    themes: {
      st: [
        { id: 'g1', title: 'Finding data' },
        { id: 'g2', title: 'Sharing' },
      ],
    },
    verbatims: [
      {
        factId: 'a1',
        studyId: 'st',
        participant: 'P01',
        text: 'Sam Example keeps a list of where each team stores its data.',
      },
      { factId: 'a2', studyId: 'st', participant: 'P02', text: 'I ask around.' },
      { factId: 'a3', studyId: 'st2', participant: 'P09', text: 'From a study I cannot open.' },
    ],
  })
  const fake = fakeInsightsAi()
  const made = makeDeps({ sources: src.sources, ai: fake.ai, clock: fixedClock(NOW) })
  fake.state.answer = [
    {
      theme: 't1',
      statement: {
        en: 'Teams cannot find their data',
        fr: 'Les équipes ne trouvent pas leurs données',
      },
      description: none,
      counterEvidence: { en: 'Two keep their own files', fr: 'Deux gardent leurs fichiers' },
      minorityView: none,
      support: ['f1', 'f2', 'f3', 'f4', 'f5'],
      counter: [],
    },
    {
      theme: 't2',
      statement: { en: 'Sharing happens by email', fr: 'Le partage passe par email' },
      description: none,
      counterEvidence: none,
      minorityView: none,
      support: ['f6'],
      counter: [],
    },
  ]
  const runs = makeInsightRunCommands(made.deps)
  const started = await runs.start('ana', 'pr', { studyIds: ['st'], scope: 'all', consent: true })
  if (!started.ok) throw new Error(started.error)
  await runs.runJob({ runId: started.value.runId, projectId: 'pr' })
  const insights = makeInsightCommands(made.deps)
  const validate = async (statement: string) => {
    const i = [...made.memory.insights.values()].find((x) => x.statement.en === statement)
    if (!i) throw new Error(statement)
    await insights.decide('ana', 'pr', i.id, { version: i.version, decision: 'validate' })
  }
  return {
    ...made,
    src,
    validate,
    commands: makeDebriefCommands(made.deps),
    queries: makeDebriefQueries(made.deps),
  }
}

type World = Awaited<ReturnType<typeof setup>>
const view = async (s: World, withProposed = false) => {
  const v = await s.queries.get('ana', 'pr', { withProposed })
  if (!v.ok) throw new Error(v.error)
  return v.value
}
const kinds = (v: Awaited<ReturnType<typeof view>>) => v.slides.map((p) => p.kind)
const insightsOf = (v: Awaited<ReturnType<typeof view>>) =>
  v.slides.flatMap((p) => (p.kind === 'insight' ? [p] : []))

describe('The debrief deck (US1)', () => {
  it('shows what is validated only, unless asked; then marks it "to validate" (FR-003)', async () => {
    const s = await setup()
    expect(kinds(await view(s))).not.toContain('insight')
    await s.validate('Teams cannot find their data')
    const validated = await view(s)
    expect(insightsOf(validated).map((p) => p.statement)).toEqual(['Teams cannot find their data'])
    expect(validated.counts.insights).toEqual({ validated: 1, toDecide: 1 })
    const all = await view(s, true)
    expect(insightsOf(all).map((p) => p.toValidate)).toEqual([false, true])
  })

  it('counts the facts still to decide on every slide when they are included (FR-003)', async () => {
    const s = await setup()
    await s.validate('Teams cannot find their data')
    // Four of its five supporting facts go back to "to decide".
    s.src.state.facts = s.src.state.facts.map((f) =>
      ['a2', 'a3', 'a4', 'a5'].includes(f.id) ? { ...f, status: 'proposed' as const } : f,
    )
    const only = insightsOf(await view(s))[0]
    expect(only).toMatchObject({ support: 1, panel: 2, facts: 1, level: 'low' })
    const all = await view(s, true)
    expect(insightsOf(all)[0]).toMatchObject({ support: 5, panel: 6, facts: 5, level: 'high' })
    const table = all.slides.find((p) => p.kind === 'insightsTable')
    expect(table?.kind === 'insightsTable' && table.rows[0]).toMatchObject({
      support: 5,
      panel: 6,
      level: 'high',
    })
    const numbers = all.slides.find((p) => p.kind === 'numbers')
    expect(numbers?.kind === 'numbers' && [numbers.participants, numbers.toValidate]).toEqual([
      6, 4,
    ])
  })

  it('never quotes a fact rejected since, nor counts a closed study (FR-010, review of PR #15)', async () => {
    const s = await setup({ closed: true })
    await s.validate('Teams cannot find their data')
    s.src.state.facts = s.src.state.facts.map((f) =>
      f.id === 'a1' ? { ...f, status: 'rejected' as const } : f,
    )
    // A fact of the closed study linked to the insight: never counted in this person's deck.
    s.src.state.facts.push(sourceFact('c1', 'P09', { studyId: 'st2' }))
    const insight = [...s.memory.insights.values()].find(
      (i) => i.statement.en === 'Teams cannot find their data',
    )
    const link = insight?.links[0]
    if (!insight || !link) throw new Error('no insight')
    s.memory.insights.set(insight.id, {
      ...insight,
      links: [...insight.links, { ...link, factId: 'c1' }],
    })
    const slide = insightsOf(await view(s))[0]
    expect(slide?.quote?.participant).toBe('P02')
    expect(slide).toMatchObject({ support: 4, panel: 5 })
  })

  it('quotes a verbatim with its code and never a name (FR-004, SC-002)', async () => {
    const s = await setup()
    await s.validate('Teams cannot find their data')
    expect(insightsOf(await view(s))[0]?.quote).toEqual({
      participant: 'P01',
      text: '[…] keeps a list of where each team stores its data.',
    })
    expect(JSON.stringify(await view(s, true))).not.toContain('Sam Example')
  })

  it('never shows a verbatim of a study the person cannot open (FR-010)', async () => {
    const s = await setup({ closed: true })
    await s.validate('Teams cannot find their data')
    const v = await view(s)
    expect(JSON.stringify(v)).not.toContain('cannot open')
    expect(v.folders).toEqual([{ studyId: 'st', name: 'Interviews' }])
  })

  it('writes the nuances and leaves out the empty sections (FR-002)', async () => {
    const s = await setup()
    await s.validate('Teams cannot find their data')
    const v = await view(s)
    expect(kinds(v)).toEqual([
      'title',
      'context',
      'method',
      'numbers',
      'insightsTable',
      'insight',
      'nuances',
      'thanks',
    ])
    const nuances = v.slides.find((p) => p.kind === 'nuances')
    expect(nuances?.kind === 'nuances' && nuances.items[0]?.counterEvidence).toBe(
      'Two keep their own files',
    )
  })
})

describe('Publish to Google Slides (US2)', () => {
  const publish = (s: World, accountId = 'ana') =>
    s.commands.publish(accountId, 'pr', { studyId: 'st', language: 'en', withProposed: false })

  it('asks for the Drive write consent first (FR-007)', async () => {
    const s = await setup()
    expect(await publish(s, 'bob')).toEqual({ ok: false, error: 'DRIVE_WRITE_REQUIRED' })
  })

  it('writes the same slides as the app, then tells when they are out of date (SC-003, FR-008)', async () => {
    const s = await setup()
    await s.validate('Teams cannot find their data')
    const published = await publish(s)
    expect(published.ok && published.value.link).toMatch(/^https:\/\//)
    const record = s.memory.decks.get('pr')
    if (!record) throw new Error('not published')
    expect(s.src.drive.slidesOf(record.fileId)).toEqual(
      presentationOf((await view(s)).slides, 'en'),
    )
    expect((await view(s)).outOfDate).toBe(false)
    await s.validate('Sharing happens by email')
    expect((await view(s)).outOfDate).toBe(true)
    const updated = await s.commands.update('ana', 'pr', { replace: false })
    expect(updated.ok).toBe(true)
    expect(s.memory.decks.get('pr')?.fileId).toBe(record.fileId)
    expect(
      s.src.drive
        .slidesOf(record.fileId)
        ?.filter((p) => p.title.startsWith('Sharing happens by email')),
    ).toHaveLength(1)
    expect((await view(s)).outOfDate).toBe(false)
  })

  it('replaces changes made in Google Slides only once confirmed (FR-009, SC-004)', async () => {
    const s = await setup()
    await publish(s)
    const fileId = s.memory.decks.get('pr')?.fileId ?? ''
    s.src.drive.edit(fileId, 'Someone', {})
    expect(await s.commands.update('ana', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'DECK_CHANGED_IN_SLIDES',
    })
    expect((await s.commands.update('ana', 'pr', { replace: true })).ok).toBe(true)
  })

  it('says when the file is gone, or cannot be edited, with its owner', async () => {
    const s = await setup()
    await publish(s)
    const fileId = s.memory.decks.get('pr')?.fileId ?? ''
    s.src.drive.viewers.set(fileId, new Set(['ana']))
    expect(await s.commands.update('ana', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'DRIVE_CANNOT_EDIT',
      detail: { owner: 'ana' },
    })
    s.src.drive.trash(fileId)
    expect(await s.commands.update('ana', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'DECK_FILE_GONE',
    })
    // A new publication is offered then: a new file.
    await publish(s)
    expect(s.memory.decks.get('pr')?.fileId).not.toBe(fileId)
  })

  it('writes nothing when another update got there first (review of PR #15)', async () => {
    const s = await setup()
    await publish(s)
    const fileId = s.memory.decks.get('pr')?.fileId ?? ''
    const before = s.src.drive.slidesOf(fileId)
    await s.validate('Teams cannot find their data')
    // Another update claims the record between this one's read and its write.
    const save = s.memory.store.savePublishedDeck
    s.memory.store.savePublishedDeck = async () => 'stale'
    expect(await s.commands.update('ana', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    s.memory.store.savePublishedDeck = save
    expect(s.src.drive.slidesOf(fileId)).toEqual(before)
  })

  it('never overwrites without asking when the version after the last write is unknown', async () => {
    const s = await setup()
    await publish(s)
    const record = s.memory.decks.get('pr')
    if (!record) throw new Error('not published')
    s.memory.decks.set('pr', { ...record, revision: null })
    expect(await s.commands.update('ana', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'DECK_CHANGED_IN_SLIDES',
    })
    expect((await s.commands.update('ana', 'pr', { replace: true })).ok).toBe(true)
  })

  it('keeps a file left empty, says so, and shows it out of date (review of PR #15)', async () => {
    const s = await setup()
    s.src.state.unwritten = true
    expect(await publish(s)).toEqual({ ok: false, error: 'DECK_NOT_WRITTEN' })
    expect(s.memory.decks.get('pr')).toBeDefined()
    expect((await view(s)).outOfDate).toBe(true)
  })

  it('is not "out of date" nor updated by someone who opens other studies (FR-010)', async () => {
    const s = await setup({ closed: true })
    // Published by someone who could open both studies.
    s.src.state.studies = s.src.state.studies.map((x) => ({ ...x, access: true }))
    await publish(s)
    s.src.state.studies = s.src.state.studies.map((x) =>
      x.id === 'st2' ? { ...x, access: false } : x,
    )
    const v = await view(s)
    expect([v.outOfDate, v.otherAccess]).toEqual([false, true])
    expect(await s.commands.update('ana', 'pr', { replace: true })).toEqual({
      ok: false,
      error: 'DECK_ACCESS_DIFFERS',
    })
  })
  it('is not "changed in Google Slides" when the file was only renamed or shared (review of PR #15)', async () => {
    const s = await setup()
    await publish(s)
    const fileId = s.memory.decks.get('pr')?.fileId ?? ''
    s.src.drive.rename(fileId, 'Debrief, final')
    expect((await s.commands.update('ana', 'pr', { replace: false })).ok).toBe(true)
  })

  it('keeps who published and when if the write fails, and shows it out of date', async () => {
    const s = await setup()
    await publish(s)
    const before = s.memory.decks.get('pr')
    if (!before) throw new Error('not published')
    s.src.drive.viewers.set(before.fileId, new Set(['bob']))
    s.src.state.canWrite.add('bob')
    // The metadata says bob can edit (he is not a viewer there), the write itself is refused.
    const rewrite = s.src.drive.rewritePresentation.bind(s.src.drive)
    s.src.drive.rewritePresentation = async () => {
      throw Object.assign(new Error('refused'), { name: 'DriveCannotEdit' })
    }
    s.src.drive.viewers.delete(before.fileId)
    expect(await s.commands.update('bob', 'pr', { replace: false })).toEqual({
      ok: false,
      error: 'DRIVE_CANNOT_EDIT',
    })
    s.src.drive.rewritePresentation = rewrite
    expect(s.memory.decks.get('pr')).toMatchObject({
      publishedBy: before.publishedBy,
      publishedAt: before.publishedAt,
    })
    expect((await view(s)).outOfDate).toBe(true)
  })

  it('takes in a study added since, open to the person updating it (review of PR #15)', async () => {
    const s = await setup()
    await publish(s)
    s.src.state.studies = [
      ...s.src.state.studies,
      { id: 'st3', name: 'Second round', access: true, type: 'interviews', hasFolder: true },
    ]
    const v = await view(s)
    expect([v.otherAccess, v.outOfDate]).toEqual([false, true])
    expect((await s.commands.update('ana', 'pr', { replace: false })).ok).toBe(true)
    expect(s.memory.decks.get('pr')?.studyIds).toEqual(['st', 'st3'])
  })
})
