import { beforeEach, describe, expect, it } from 'vitest'
import type { FormReadBlock } from '../domain/form.ts'
import { publishingWorld } from './fakes/publishing-world.ts'

const ada = { id: 'ada', role: 'member' as const }
let world: ReturnType<typeof publishingWorld>

const publish = async () => {
  const done = await world.commands.publish({
    actor: ada,
    studyId: 'study-1',
    kinds: ['questionnaire'],
    language: 'en',
    timeZone: 'UTC',
  })
  if (!done.ok) throw new Error(String(done.error))
}
const stored = () => {
  const p = [...world.store.rows.values()].find((x) => x.kind === 'questionnaire')
  if (!p) throw new Error('no publication')
  return p
}
const check = async () => {
  const done = await world.commands.check({ actor: ada, publicationId: stored().id })
  if (!done.ok) throw new Error(String(done.error))
  return done.value.publication
}
const blocks = () => world.drive.files.get(stored().fileId)?.form?.blocks ?? []
const editBlocks = (change: (b: readonly FormReadBlock[]) => FormReadBlock[]) =>
  world.drive.editForm(stored().fileId, 'someone', (f) => ({ ...f, blocks: change(f.blocks) }))
const pending = async () =>
  (await world.store.changes(stored().id)).filter((c) => c.decision === 'pending')
const changeAppItem = () => {
  const q = world.state.questionnaire
  if (!q) throw new Error('none')
  world.state.questionnaire = {
    version: q.version + 1,
    content: {
      ...q.content,
      sections: q.content.sections.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === 'b' ? { ...i, text: 'Changed in the app' } : i)),
      })),
    },
  }
}

beforeEach(() => {
  world = publishingWorld()
})

describe('publishing a questionnaire (spec 027 US5)', () => {
  it('creates the form closed, collecting no identity, in sync, with item identities', async () => {
    await publish()
    const p = stored()
    expect(p.state).toBe('in-sync')
    expect(p.acceptingResponses).toBe(false)
    expect(p.collectsIdentity).toBe(false)
    expect(Object.keys(p.itemMap ?? {})).toEqual(
      expect.arrayContaining(['consent', 'thanks', 'section:qs1', 'item:a', 'item:b']),
    )
    expect(world.drive.files.get(p.fileId)?.name).toBe('Study A · Questionnaire')
  })

  it('stays in sync at the next check', async () => {
    await publish()
    expect((await check()).state).toBe('in-sync')
    expect(await pending()).toEqual([])
  })

  it('tells out of date, updates only what differs and keeps the identities', async () => {
    await publish()
    const before = stored().itemMap
    changeAppItem()
    expect((await check()).state).toBe('out-of-date')
    const done = await world.commands.update({
      actor: ada,
      publicationId: stored().id,
      replaceDriveChanges: false,
    })
    expect(done.ok).toBe(true)
    expect(stored().state).toBe('in-sync')
    expect(stored().itemMap).toEqual(before)
    expect(blocks().map((b) => b.title)).toContain('Changed in the app')
  })

  const reword = (title: string) =>
    editBlocks((all) => all.map((b) => (b.title === 'Tell us more' ? { ...b, title } : b)))

  it('shows a change made in the form, and accepting it saves through the app', async () => {
    await publish()
    reword('Reworded in the form')
    expect((await check()).state).toBe('changed-in-drive')
    const [change] = await pending()
    expect(change?.key).toBe('item:b')
    const done = await world.commands.decide({
      actor: ada,
      publicationId: stored().id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(done.ok).toBe(true)
    const item = world.state.questionnaire?.content.sections[0]?.items.find((i) => i.id === 'b')
    expect(item).toMatchObject({ text: 'Reworded in the form', measure: 'subjective' })
    expect(stored().state).toBe('in-sync')
  })

  it('makes a conflict of the same item changed on both sides', async () => {
    await publish()
    reword('Reworded in the form')
    changeAppItem()
    expect((await check()).state).toBe('conflict')
  })

  it('never overwrites an unreviewed change', async () => {
    await publish()
    reword('Reworded in the form')
    await check()
    expect(
      await world.commands.update({
        actor: ada,
        publicationId: stored().id,
        replaceDriveChanges: false,
      }),
    ).toEqual({ ok: false, error: 'DRIVE_CHANGES_PENDING' })
  })

  it('adds a question added in the form under its identity there', async () => {
    await publish()
    editBlocks((all) => [
      ...all,
      {
        formItemId: 'added',
        questionId: 'added-q',
        kind: 'open',
        title: 'Added in the form',
        description: '',
        required: false,
      },
    ])
    await check()
    const change = (await pending()).find((c) => c.key === 'new:added:added-q')
    expect(change?.kind).toBe('added')
    const done = await world.commands.decide({
      actor: ada,
      publicationId: stored().id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(done.ok).toBe(true)
    const item = world.state.questionnaire?.content.sections[0]?.items.at(-1)
    expect(item?.text).toBe('Added in the form')
    expect(stored().itemMap?.[`item:${item?.id}`]).toEqual({
      formItemId: 'added',
      questionId: 'added-q',
    })
    // Updating never creates it a second time.
    await world.commands.update({
      actor: ada,
      publicationId: stored().id,
      replaceDriveChanges: true,
    })
    expect(blocks().filter((b) => b.title === 'Added in the form')).toHaveLength(1)
  })

  it('reports what it cannot hold, cannot accept it, and leaves it in the form', async () => {
    await publish()
    editBlocks((all) => [
      ...all,
      {
        formItemId: 'file',
        questionId: null,
        kind: 'unsupported',
        title: 'A file',
        description: '',
      },
    ])
    await check()
    const change = (await pending()).find((c) => c.key === 'unread:file')
    expect(change?.kind).toBe('not-understood')
    expect(
      await world.commands.decide({
        actor: ada,
        publicationId: stored().id,
        decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
      }),
    ).toEqual({ ok: false, error: 'VALIDATION' })
    await world.commands.update({
      actor: ada,
      publicationId: stored().id,
      replaceDriveChanges: true,
    })
    expect(blocks().map((b) => b.title)).toContain('A file')
  })

  it('does not duplicate the form when it could not be read back after writing', async () => {
    await publish()
    const count = blocks().length
    await world.store.save({ ...stored(), base: [], baseVersion: 0, itemMap: null, drive: null })
    const done = await world.commands.update({
      actor: ada,
      publicationId: stored().id,
      replaceDriveChanges: false,
    })
    expect(done.ok).toBe(true)
    expect(blocks()).toHaveLength(count)
    expect(stored().itemMap).toHaveProperty('item:a')
  })

  it('updates twice in a row with a question left in the form', async () => {
    await publish()
    editBlocks((all) => [
      ...all,
      {
        formItemId: 'added',
        questionId: 'added-q',
        kind: 'open',
        title: 'Added in the form',
        description: '',
        required: false,
      },
    ])
    await check()
    const again = () =>
      world.commands.update({ actor: ada, publicationId: stored().id, replaceDriveChanges: true })
    expect((await again()).ok).toBe(true)
    expect((await again()).ok).toBe(true)
  })

  it('stays as the team last read it for a person who can only view the form', async () => {
    await publish()
    world.drive.viewers.set(stored().fileId, new Set(['ada']))
    const before = stored().state
    const done = await check()
    expect(done.state).toBe(before)
  })

  it('reads the spreadsheet, the opening and the collection at each check', async () => {
    await publish()
    world.drive.editForm(stored().fileId, 'someone', (f) => ({
      ...f,
      linkedSheetLink: 'https://sheet.example.test/1',
      acceptingResponses: true,
      collectsIdentity: true,
    }))
    await check()
    expect(stored()).toMatchObject({
      linkedSheetLink: 'https://sheet.example.test/1',
      acceptingResponses: true,
      collectsIdentity: true,
    })
    // None of them is a change to review, nor stops the file being in sync.
    expect(stored().state).toBe('in-sync')
  })

  it('is unavailable once the form leaves the folder, and the questionnaire stays', async () => {
    await publish()
    world.drive.move(stored().fileId, 'elsewhere')
    expect((await check()).state).toBe('unavailable')
    expect(world.state.questionnaire).not.toBeNull()
  })

  it('creates a new form after forgetting one, without reusing its identities', async () => {
    await publish()
    const { fileId, id } = stored()
    world.drive.trash(fileId)
    await world.commands.forget({ actor: ada, publicationId: id })
    await publish()
    expect(stored().fileId).not.toBe(fileId)
    expect(world.drive.files.has(fileId)).toBe(true)
  })

  it('publishes nothing without a questionnaire', async () => {
    world.state.questionnaire = null
    await publish()
    expect([...world.store.rows.values()]).toEqual([])
  })
})

describe('opening and closing (spec 028 US1)', () => {
  const open = (value = true) =>
    world.commands.setOpen({ actor: ada, publicationId: stored().id, open: value })

  it('opens a form in sync, with who and when, then closes it', async () => {
    await publish()
    expect((await open()).ok).toBe(true)
    expect(stored()).toMatchObject({ acceptingResponses: true, openedBy: 'ada' })
    expect(world.drive.files.get(stored().fileId)?.form?.acceptingResponses).toBe(true)
    expect((await open(false)).ok).toBe(true)
    expect(stored()).toMatchObject({ acceptingResponses: false, closedBy: 'ada' })
  })

  it('refuses a form collecting identities', async () => {
    await publish()
    world.drive.editForm(stored().fileId, 'someone', (f) => ({ ...f, collectsIdentity: true }))
    expect(await open()).toEqual({ ok: false, error: 'FORM_COLLECTS_IDENTITY' })
    expect(world.drive.files.get(stored().fileId)?.form?.acceptingResponses).toBe(false)
  })

  it('refuses a consent that no longer ends the form', async () => {
    await publish()
    editBlocks((all) =>
      all.map((b) =>
        b.kind === 'choice' ? { ...b, options: b.options.map((o) => ({ ...o, exit: false })) } : b,
      ),
    )
    expect(await open()).toEqual({ ok: false, error: 'FORM_CONSENT_BROKEN' })
  })

  it('refuses a form out of date or changed at the source', async () => {
    await publish()
    changeAppItem()
    expect(await open()).toEqual({ ok: false, error: 'FORM_NOT_IN_SYNC' })
  })

  it('closes whatever the state of the form', async () => {
    await publish()
    changeAppItem()
    expect((await open(false)).ok).toBe(true)
  })

  it('refuses a person who can only view the form', async () => {
    await publish()
    world.drive.viewers.set(stored().fileId, new Set(['ada']))
    expect(await open()).toEqual({ ok: false, error: 'DRIVE_CANNOT_EDIT' })
  })
})

describe('protecting the responses (spec 028 US5)', () => {
  const update = (confirmRewording = false) =>
    world.commands.update({
      actor: ada,
      publicationId: stored().id,
      replaceDriveChanges: false,
      confirmRewording,
    })
  const withItems = (change: (items: never[]) => unknown[]) => {
    const q = world.state.questionnaire
    if (!q) throw new Error('none')
    world.state.questionnaire = {
      version: q.version + 1,
      content: {
        ...q.content,
        sections: q.content.sections.map((s) => ({
          ...s,
          items: change(s.items as never[]),
        })) as never,
      },
    }
  }

  it('updates freely before any response', async () => {
    await publish()
    withItems((items) => items.slice(0, 1))
    expect((await update()).ok).toBe(true)
  })

  it('refuses removing an item once responses exist, naming it, the form unchanged', async () => {
    await publish()
    world.state.responses = 3
    const before = blocks().length
    withItems((items) => items.slice(0, 1))
    expect(await update()).toMatchObject({
      ok: false,
      error: 'RESPONSES_BLOCK_UPDATE',
      detail: { items: ['Tell us more'] },
    })
    expect(blocks()).toHaveLength(before)
  })

  it('refuses too when the responses are only at the source, none read yet', async () => {
    await publish()
    world.drive.respond(stored().fileId, {
      id: 'r',
      submittedAt: '2026-11-02T10:00:00Z',
      answers: {},
    })
    withItems((items) => items.slice(0, 1))
    expect(await update()).toMatchObject({ ok: false, error: 'RESPONSES_BLOCK_UPDATE' })
  })

  it('keeps the former wording when accepting a rewording made in the form', async () => {
    await publish()
    world.state.responses = 3
    editBlocks((all) => all.map((b) => (b.title === 'Tell us more' ? { ...b, title: 'New' } : b)))
    await check()
    const change = (await pending()).find((c) => c.key === 'item:b')
    const done = await world.commands.decide({
      actor: ada,
      publicationId: stored().id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(done.ok).toBe(true)
    expect(world.state.wordings).toEqual([{ itemId: 'b', text: 'Tell us more' }])
  })

  it('asks to confirm a rewording, then keeps the former wording and the identity', async () => {
    await publish()
    world.state.responses = 3
    const before = stored().itemMap
    changeAppItem()
    expect(await update()).toMatchObject({
      ok: false,
      error: 'REWORDING_TO_CONFIRM',
      detail: { responses: 3 },
    })
    expect((await update(true)).ok).toBe(true)
    expect(world.state.wordings).toEqual([{ itemId: 'b', text: 'Tell us more' }])
    expect(stored().itemMap).toEqual(before)
  })

  it('lets an added item through', async () => {
    await publish()
    world.state.responses = 3
    withItems((items) => [
      ...items,
      {
        id: 'n',
        text: 'New',
        measure: 'subjective',
        required: false,
        subTheme: null,
        contact: false,
        kind: 'open',
      },
    ])
    expect((await update()).ok).toBe(true)
  })

  it('refuses accepting a removal made in the form, and still takes a rewording', async () => {
    await publish()
    world.state.responses = 3
    editBlocks((all) => all.filter((b) => b.title !== 'Tell us more'))
    await check()
    const removal = (await pending()).find((c) => c.key === 'item:b')
    expect(
      await world.commands.decide({
        actor: ada,
        publicationId: stored().id,
        decisions: [{ changeId: removal?.id ?? '', decision: 'accept' }],
      }),
    ).toMatchObject({ ok: false, error: 'RESPONSES_BLOCK_UPDATE' })
    expect(world.state.questionnaire?.content.sections[0]?.items).toHaveLength(2)
  })
})
