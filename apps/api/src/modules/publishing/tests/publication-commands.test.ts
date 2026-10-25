import { beforeEach, describe, expect, it } from 'vitest'
import type { DocModel } from '../domain/model.ts'
import { publishingWorld } from './fakes/publishing-world.ts'

const ada = { id: 'ada', role: 'member' as const }
const ben = { id: 'ben', role: 'member' as const }
const lee = { id: 'lee', role: 'member' as const }

let world: ReturnType<typeof publishingWorld>

const publish = async (
  kinds: ('guide' | 'best-practices' | 'schedule')[] = ['guide', 'best-practices', 'schedule'],
) => {
  const done = await world.commands.publish({
    actor: ada,
    studyId: 'study-1',
    kinds,
    language: 'en',
    timeZone: 'Europe/Paris',
  })
  if (!done.ok) throw new Error(done.error)
  return done.value.ids
}
const publicationOf = (kind: string) => {
  const p = [...world.store.rows.values()].find((x) => x.kind === kind)
  if (!p) throw new Error(`no ${kind}`)
  return p
}
const editDoc = (kind: string, from: string, to: string, by = 'someone') =>
  world.drive.edit(publicationOf(kind).fileId, by, {
    doc: (d: DocModel) => ({
      blocks: d.blocks.map((b) => (b.text === from ? { ...b, text: to } : b)),
    }),
  })
const check = async (kind: string, actor = ada) => {
  const done = await world.commands.check({ actor, publicationId: publicationOf(kind).id })
  if (!done.ok) throw new Error(String(done.error))
  return done.value
}
const pending = async (kind: string) =>
  (await world.store.changes(publicationOf(kind).id)).filter((c) => c.decision === 'pending')

beforeEach(() => {
  world = publishingWorld()
})

describe('US1 — publish', () => {
  it('creates the three files in the folder, in sync, and refuses a second publication', async () => {
    expect(await publish()).toHaveLength(3)
    expect([...world.drive.files.values()].map((f) => f.name)).toEqual([
      'Study A · Interview guide',
      'Study A · Interview best practices',
      'Study A · Interview schedule',
    ])
    expect([...world.store.rows.values()].every((p) => p.state === 'in-sync')).toBe(true)
    expect(
      await world.commands.publish({
        actor: ada,
        studyId: 'study-1',
        kinds: ['guide'],
        language: 'en',
        timeZone: 'UTC',
      }),
    ).toEqual({ ok: false, error: 'ALREADY_PUBLISHED' })
  })

  it('asks for the write consent first, and skips a guide that does not exist yet', async () => {
    expect(
      await world.commands.publish({
        actor: lee,
        studyId: 'study-1',
        kinds: ['guide'],
        language: 'en',
        timeZone: 'UTC',
      }),
    ).toEqual({ ok: false, error: 'DRIVE_WRITE_REQUIRED' })
    world.state.guide = null
    expect(await publish(['guide', 'schedule'])).toHaveLength(1)
  })
})

describe('US2 + US3 — states and Drive changes', () => {
  beforeEach(async () => {
    await publish()
  })

  it('stays in sync on a check without changes, and on a rename', async () => {
    world.drive.rename(publicationOf('guide').fileId, 'Renamed guide')
    const checked = await check('guide')
    expect(checked.publication).toMatchObject({ state: 'in-sync', fileName: 'Renamed guide' })
  })

  it('is out of date when only the app changed', async () => {
    const g = world.state.guide
    if (!g) throw new Error('fixture')
    world.state.guide = {
      ...g,
      content: { ...g.content, framing: { ...g.content.framing, format: 'Remote' } },
    }
    expect((await check('guide')).publication.state).toBe('out-of-date')
  })

  it('lists a question reworded in Drive and applies it once accepted, keeping its id', async () => {
    editDoc('guide', 'Tell me about last week.', 'Walk me through last week.', 'Sam in Drive')
    const checked = await check('guide')
    expect(checked.publication).toMatchObject({
      state: 'changed-in-drive',
      lastEditor: 'Sam in Drive',
    })
    const [change] = await pending('guide')
    expect(change).toMatchObject({ key: 'question:q1', kind: 'changed' })
    const decided = await world.commands.decide({
      actor: ben,
      publicationId: publicationOf('guide').id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(decided).toEqual({ ok: true, value: { applied: 1, rejected: 0, alreadyDecided: 0 } })
    expect(world.state.guide?.content.sections[1]?.questions[0]).toEqual({
      id: 'q1',
      text: 'Walk me through last week.',
      followUps: ['And then?'],
    })
    expect(publicationOf('guide').state).toBe('in-sync')
    // Decided once: a second decision changes nothing.
    expect(
      await world.commands.decide({
        actor: ada,
        publicationId: publicationOf('guide').id,
        decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
      }),
    ).toEqual({ ok: true, value: { applied: 0, rejected: 0, alreadyDecided: 1 } })
  })

  it('keeps a rejected change rejected at the next check, and the file out of date', async () => {
    editDoc('guide', 'How do you track changes?', 'Do you track changes?')
    await check('guide')
    const [change] = await pending('guide')
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('guide').id,
      decisions: [{ changeId: change?.id ?? '', decision: 'reject' }],
    })
    world.store.rows.set(publicationOf('guide').id, {
      ...publicationOf('guide'),
      checkedVersion: -1,
    })
    expect((await check('guide')).publication.state).toBe('out-of-date')
    expect(await pending('guide')).toEqual([])
  })

  it('reports a conflict when the same question changed on both sides; a final text settles it', async () => {
    editDoc('guide', 'Tell me about last week.', 'Drive version')
    const g = world.state.guide
    if (!g) throw new Error('fixture')
    world.state.guide = {
      ...g,
      content: {
        ...g.content,
        sections: g.content.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => (q.id === 'q1' ? { ...q, text: 'App version' } : q)),
        })),
      },
    }
    expect((await check('guide')).publication.state).toBe('conflict')
    const [conflict] = await pending('guide')
    expect(conflict?.kind).toBe('conflict')
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('guide').id,
      decisions: [
        {
          changeId: conflict?.id ?? '',
          decision: 'accept',
          final: {
            type: 'question',
            section: 's2',
            text: 'Merged version',
            followUps: ['And then?'],
          },
        },
      ],
    })
    expect(world.state.guide?.content.sections[1]?.questions[0]?.text).toBe('Merged version')
    // The file still says "Drive version": the app is ahead now.
    expect(publicationOf('guide').state).toBe('out-of-date')
  })

  it('refuses a final value that breaks the rules, and change ids of another publication', async () => {
    editDoc('guide', 'Tell me about last week.', 'Drive version')
    const g = world.state.guide
    if (!g) throw new Error('fixture')
    world.state.guide = {
      ...g,
      content: {
        ...g.content,
        sections: g.content.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => (q.id === 'q1' ? { ...q, text: 'App version' } : q)),
        })),
      },
    }
    await check('guide')
    const [conflict] = await pending('guide')
    const decide = (final: unknown, publicationId = publicationOf('guide').id) =>
      world.commands.decide({
        actor: ada,
        publicationId,
        decisions: [{ changeId: conflict?.id ?? '', decision: 'accept', final }],
      })
    expect(await decide(null)).toEqual({ ok: false, error: 'VALIDATION' })
    expect(await decide({ type: 'text', text: 'Wrong kind' })).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(
      await decide({ type: 'question', section: 's2', text: 'x'.repeat(601), followUps: [] }),
    ).toEqual({ ok: false, error: 'VALIDATION' })
    expect(await decide(undefined, publicationOf('schedule').id)).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(conflict && world.store.changeRows.get(conflict.id)?.decision).toBe('pending')
  })

  it('keeps a question whose section heading lost its anchor, and never offers its section as removed', async () => {
    world.drive.edit(publicationOf('guide').fileId, 'x', {
      doc: (d: DocModel) => ({
        blocks: d.blocks.map((b) =>
          b.anchor === 'section:s2'
            ? { kind: 'heading' as const, level: 2 as const, text: 'Retyped (30 min)' }
            : b.text === 'Tell me about last week.'
              ? { ...b, text: 'Walk me through last week.' }
              : b,
        ),
      }),
    })
    await check('guide')
    const changes = await pending('guide')
    expect(changes.find((c) => c.key === 'section:s2')?.kind).toBe('not-understood')
    const question = changes.find((c) => c.key === 'question:q1')
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('guide').id,
      decisions: [{ changeId: question?.id ?? '', decision: 'accept' }],
    })
    const s2 = world.state.guide?.content.sections.find((s) => s.id === 's2')
    expect(s2?.questions.map((q) => q.text)).toEqual([
      'Walk me through last week.',
      'How do you track changes?',
    ])
  })

  it('applies the rows it could before a failure and gives the others back for review', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: [
          ...t.rows.map((r) => ({ ...r, cells: { ...r.cells, notes: 'Called' } })),
          { id: null, cells: { interviewee: 'Kim', status: 'To contact' } },
        ],
      }),
    })
    await check('schedule')
    const changes = await pending('schedule')
    // Lee is changed in the app meanwhile: its change cannot be applied.
    world.state.rows = world.state.rows.map((r) => (r.id === 'r2' ? { ...r, role: 'Moved on' } : r))
    const done = await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('schedule').id,
      decisions: changes.map((c) => ({ changeId: c.id, decision: 'accept' as const })),
    })
    expect(done).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(world.state.rows.find((r) => r.id === 'r1')?.notes).toBe('Called')
    expect(world.state.rows.filter((r) => r.interviewee === 'Kim')).toHaveLength(0)
    // Accepting what is left does not apply Sam's row twice.
    const again = await pending('schedule')
    expect(again.some((c) => c.key === 'row:r1')).toBe(false)
  })

  it('takes back a row deleted in the app when Drive edited it and Drive is chosen', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: t.rows.map((r) =>
          r.id === 'r2' ? { ...r, cells: { ...r.cells, notes: 'Keep me' } } : r,
        ),
      }),
    })
    world.state.rows = world.state.rows.filter((r) => r.id !== 'r2')
    await check('schedule')
    const [conflict] = (await pending('schedule')).filter((c) => c.key === 'row:r2')
    expect(conflict?.kind).toBe('conflict')
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('schedule').id,
      decisions: [{ changeId: conflict?.id ?? '', decision: 'accept' }],
    })
    expect(world.state.rows.find((r) => r.interviewee === 'Lee')?.notes).toBe('Keep me')
  })

  it('refuses a final value of the wrong shape or in another section', async () => {
    editDoc('guide', 'Tell me about last week.', 'Drive version')
    const g = world.state.guide
    if (!g) throw new Error('fixture')
    world.state.guide = {
      ...g,
      content: {
        ...g.content,
        framing: { ...g.content.framing, objectives: 'App objectives' },
        sections: g.content.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => (q.id === 'q1' ? { ...q, text: 'App version' } : q)),
        })),
      },
    }
    await check('guide')
    const [conflict] = await pending('guide')
    const decide = (final: unknown) =>
      world.commands.decide({
        actor: ada,
        publicationId: publicationOf('guide').id,
        decisions: [{ changeId: conflict?.id ?? '', decision: 'accept', final }],
      })
    expect(await decide({ type: 'question', text: 'ok', followUps: 'x', section: 's2' })).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(await decide({ type: 'question', text: 'ok', followUps: [], section: 'nope' })).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
  })

  it('does not offer an accepted addition again when it is edited before the next update', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: [...t.rows, { id: null, cells: { interviewee: 'Kim', status: 'To contact' } }],
      }),
    })
    await check('schedule')
    const [added] = await pending('schedule')
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('schedule').id,
      decisions: [{ changeId: added?.id ?? '', decision: 'accept' }],
    })
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: t.rows.map((r) =>
          r.id === null ? { ...r, cells: { ...r.cells, notes: 'Typo fixed' } } : r,
        ),
      }),
    })
    await check('schedule')
    expect((await pending('schedule')).map((c) => c.kind)).not.toContain('added')
    expect(world.state.rows.filter((r) => r.interviewee === 'Kim')).toHaveLength(1)
  })

  it('reads a row whose cells were cleared as removed, and a date typed as text as unreadable', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: t.rows.map((r) =>
          r.id === 'r2'
            ? { ...r, cells: Object.fromEntries(Object.keys(r.cells).map((k) => [k, null])) }
            : { ...r, cells: { ...r.cells, scheduledAt: '2026-11-03 10:00' } },
        ),
      }),
    })
    await check('schedule')
    const changes = await pending('schedule')
    expect(changes.find((c) => c.key === 'row:r2')?.kind).toBe('removed')
    expect(changes.find((c) => c.key === 'row:r1')?.kind).toBe('invalid')
  })

  it('never offers row removals when the hidden id column was moved', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({ ...t, idColumn: false, rows: t.rows.map((r) => ({ ...r, id: null })) }),
    })
    await check('schedule')
    const changes = await pending('schedule')
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((c) => c.kind === 'not-understood')).toBe(true)
  })

  it('frees a reservation left by an interrupted publication', async () => {
    const stale = { ...publicationOf('guide'), id: 'stale', kind: 'schedule' as const, fileId: '' }
    world.store.rows.delete(publicationOf('schedule').id)
    world.store.rows.set('stale', { ...stale, publishedAt: new Date('2026-10-25T09:00:00Z') })
    expect(await publish(['schedule'])).toHaveLength(1)
  })

  it('keeps the shared state when only this person cannot open the file', async () => {
    world.drive.hidden.set(publicationOf('guide').fileId, new Set(['ben']))
    expect((await check('guide', ben)).publication.state).toBe('unavailable')
    expect(publicationOf('guide').state).toBe('in-sync')
  })

  it('refuses to accept text it could not understand, and refuses when the app moved on', async () => {
    world.drive.edit(publicationOf('guide').fileId, 'x', {
      doc: (d: DocModel) => ({
        blocks: [...d.blocks, { kind: 'paragraph', text: 'A stray note' }],
      }),
    })
    await check('guide')
    const [stray] = await pending('guide')
    expect(stray?.kind).toBe('not-understood')
    expect(
      await world.commands.decide({
        actor: ada,
        publicationId: publicationOf('guide').id,
        decisions: [{ changeId: stray?.id ?? '', decision: 'accept' }],
      }),
    ).toEqual({ ok: false, error: 'VALIDATION' })
    editDoc('guide', 'How do you track changes?', 'How do you keep track?')
    await check('guide')
    const reworded = (await pending('guide')).find((c) => c.key === 'question:q2')
    if (world.state.guide) world.state.guide = { ...world.state.guide, version: 7 }
    expect(
      await world.commands.decide({
        actor: ada,
        publicationId: publicationOf('guide').id,
        decisions: [{ changeId: reworded?.id ?? '', decision: 'accept' }],
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    // Checked again: the change is still there to review, computed on the app as it is now.
    expect((await pending('guide')).some((c) => c.key === 'question:q2')).toBe(true)
    expect(publicationOf('guide').appVersion).toBe(7)
  })

  it('brings schedule rows back: a status changed in the sheet, a row added', async () => {
    world.drive.edit(publicationOf('schedule').fileId, 'x', {
      table: (t) => ({
        ...t,
        rows: [
          ...t.rows.map((r) =>
            r.id === 'r2' ? { ...r, cells: { ...r.cells, status: 'Invited' } } : r,
          ),
          { id: null, cells: { interviewee: 'Kim', status: 'To contact' } },
        ],
      }),
    })
    await check('schedule')
    const changes = await pending('schedule')
    expect(changes.map((c) => [c.key, c.kind])).toEqual([
      ['row:r2', 'changed'],
      [expect.stringMatching(/^new-row:/), 'added'],
    ])
    await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('schedule').id,
      decisions: changes.map((c) => ({ changeId: c.id, decision: 'accept' as const })),
    })
    expect(world.state.rows.map((r) => [r.interviewee, r.status])).toEqual([
      ['Sam', 'scheduled'],
      ['Lee', 'invited'],
      ['Kim', 'to-contact'],
    ])
  })

  it('reports the best practices changed in Drive without bringing them back', async () => {
    const doc = publicationOf('best-practices')
    world.drive.edit(doc.fileId, 'x', { doc: (d: DocModel) => ({ blocks: d.blocks.slice(1) }) })
    await check('best-practices')
    const [change] = await pending('best-practices')
    expect(change?.kind).toBe('not-understood')
  })

  it('marks trashed, moved and unreachable files unavailable', async () => {
    world.drive.trash(publicationOf('guide').fileId)
    expect((await check('guide')).publication).toMatchObject({
      state: 'unavailable',
      unavailableReason: 'trashed',
    })
    world.drive.move(publicationOf('schedule').fileId, 'elsewhere')
    expect((await check('schedule')).publication.unavailableReason).toBe('moved')
    world.drive.files.delete(publicationOf('best-practices').fileId)
    expect((await check('best-practices')).publication.unavailableReason).toBe('missing')
  })
})

describe('US1b + US4 — team and update in Drive', () => {
  beforeEach(async () => {
    await publish(['guide'])
  })

  it('lets a teammate update the file another person published, with their own access', async () => {
    const g = world.state.guide
    if (!g) throw new Error('fixture')
    world.state.guide = {
      ...g,
      version: 1,
      content: { ...g.content, framing: { ...g.content.framing, format: 'Remote' } },
    }
    await check('guide', ben)
    const updated = await world.commands.update({
      actor: ben,
      publicationId: publicationOf('guide').id,
      replaceDriveChanges: false,
    })
    expect(updated).toMatchObject({ ok: true, value: { state: 'in-sync', updatedBy: 'ben' } })
    const file = world.drive.files.get(publicationOf('guide').fileId)
    expect(file?.doc?.blocks.some((b) => b.text === 'Remote')).toBe(true)
  })

  it('never overwrites unreviewed Drive changes, unless asked to replace them', async () => {
    editDoc('guide', 'Tell me about last week.', 'Drive text')
    await check('guide')
    const id = publicationOf('guide').id
    expect(
      await world.commands.update({ actor: ada, publicationId: id, replaceDriveChanges: false }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_CHANGES_PENDING',
    })
    expect(
      await world.commands.update({ actor: ada, publicationId: id, replaceDriveChanges: true }),
    ).toMatchObject({
      ok: true,
      value: { state: 'in-sync' },
    })
    expect(await pending('guide')).toEqual([])
  })

  it('refuses when the file changed since the last check, or when the person can only view it', async () => {
    const id = publicationOf('guide').id
    editDoc('guide', 'Tell me about last week.', 'Meanwhile')
    expect(
      await world.commands.update({ actor: ada, publicationId: id, replaceDriveChanges: true }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_CHANGED_MEANWHILE',
    })
    world.drive.viewers.set(publicationOf('guide').fileId, new Set(['ben']))
    expect(
      await world.commands.update({ actor: ben, publicationId: id, replaceDriveChanges: true }),
    ).toEqual({
      ok: false,
      error: 'DRIVE_CANNOT_EDIT',
    })
    expect((await check('guide', ben)).canEdit).toBe(false)
  })

  it('hides publications from people outside the study', async () => {
    expect(await world.queries.list({ id: 'eve', role: 'member' }, 'study-1')).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
    expect(
      await world.commands.check({
        actor: { id: 'eve', role: 'member' },
        publicationId: publicationOf('guide').id,
      }),
    ).toEqual({ ok: false, error: 'PUBLICATION_NOT_FOUND' })
  })
})
