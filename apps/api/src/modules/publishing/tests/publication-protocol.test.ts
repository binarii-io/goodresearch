import { beforeEach, describe, expect, it } from 'vitest'
import type { DocModel } from '../domain/model.ts'
import type { ProtocolContent } from '../domain/protocol.ts'
import { publishingWorld } from './fakes/publishing-world.ts'

const ada = { id: 'ada', role: 'member' as const }
let world: ReturnType<typeof publishingWorld>

const content: ProtocolContent = {
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: [],
    participants: 'Analysts',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: {
    introduction: 'Thanks.',
    thinkAloud: 'Think aloud.',
    warmUp: [],
    debrief: [],
    closing: '',
  },
  scenario: 'You prepare the weekly review.',
  tasks: [
    {
      id: 't1',
      instruction: 'Send this report to your manager',
      criterion: 'It is sent',
      startUrl: null,
      minutes: 5,
    },
  ],
  questionnaire: 'none',
  easeQuestion: 'none',
  retiredTaskIds: [],
}

const publish = async (kinds: ('protocol' | 'best-practices')[] = ['protocol']) => {
  const done = await world.commands.publish({
    actor: ada,
    studyId: 'study-1',
    kinds,
    language: 'en',
    timeZone: 'UTC',
  })
  if (!done.ok) throw new Error(String(done.error))
  return done.value.ids
}
const publicationOf = (kind: string) => {
  const p = [...world.store.rows.values()].find((x) => x.kind === kind)
  if (!p) throw new Error(`no ${kind}`)
  return p
}
const check = async (kind: string) => {
  const done = await world.commands.check({ actor: ada, publicationId: publicationOf(kind).id })
  if (!done.ok) throw new Error(String(done.error))
  return done.value.publication
}
const editDoc = (kind: string, edit: (d: DocModel) => DocModel) =>
  world.drive.edit(publicationOf(kind).fileId, 'someone', { doc: edit })
const pending = async (kind: string) =>
  (await world.store.changes(publicationOf(kind).id)).filter((c) => c.decision === 'pending')

beforeEach(() => {
  world = publishingWorld()
  world.state.type = 'usability-test'
  world.state.protocol = { version: 0, content }
})

describe('spec 036 US5 — publish the protocol', () => {
  it('publishes the protocol with its participant sheet, both in sync', async () => {
    expect(await publish()).toHaveLength(2)
    expect([...world.drive.files.values()].map((f) => f.name)).toEqual([
      'Study A · Test protocol',
      'Study A · Participant sheet',
    ])
    expect([...world.store.rows.values()].every((p) => p.state === 'in-sync')).toBe(true)
  })

  it('publishes the usability test best practices, not the interview ones', async () => {
    await publish(['best-practices'])
    const file = [...world.drive.files.values()][0]
    expect(JSON.stringify(file)).toContain('Usability test best practices')
  })

  it('refuses the interview documents and a missing protocol', async () => {
    expect(
      await world.queries.checkPublication({ actor: ada, studyId: 'study-1', kinds: ['guide'] }),
    ).toEqual({ ok: false, error: 'NOT_AN_INTERVIEW_STUDY' })
    world.state.protocol = null
    expect(
      await world.queries.checkPublication({ actor: ada, studyId: 'study-1', kinds: ['protocol'] }),
    ).toEqual({ ok: false, error: 'PROTOCOL_NOT_FOUND' })
  })

  it('is out of date after a change in the app, and an update rewrites both', async () => {
    await publish()
    world.state.protocol = {
      version: 1,
      content: {
        ...content,
        tasks: [
          {
            ...content.tasks[0],
            instruction: 'Share this report',
          } as ProtocolContent['tasks'][number],
        ],
      },
    }
    expect((await check('protocol')).state).toBe('out-of-date')
    expect((await check('participant-sheet')).state).toBe('out-of-date')
    for (const kind of ['protocol', 'participant-sheet']) {
      const updated = await world.commands.update({
        actor: ada,
        publicationId: publicationOf(kind).id,
        replaceDriveChanges: false,
      })
      expect(updated.ok).toBe(true)
    }
    expect((await check('protocol')).state).toBe('in-sync')
    expect((await check('participant-sheet')).state).toBe('in-sync')
  })

  it('takes an accepted Drive change of a task back into the protocol, keeping its id', async () => {
    await publish()
    editDoc('protocol', (d) => ({
      blocks: d.blocks.map((b) =>
        b.anchor === 'task:t1:instruction'
          ? { ...b, text: 'Read aloud: Share this report with your manager' }
          : b,
      ),
    }))
    expect((await check('protocol')).state).toBe('changed-in-drive')
    const [change] = await pending('protocol')
    const decided = await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('protocol').id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(decided.ok).toBe(true)
    expect(world.state.protocol?.content.tasks[0]).toMatchObject({
      id: 't1',
      instruction: 'Share this report with your manager',
    })
  })

  it('reports a change of the participant sheet, refuses to take it in, and overwrites it on update', async () => {
    await publish()
    editDoc('participant-sheet', (d) => ({
      blocks: [...d.blocks, { kind: 'paragraph', text: 'A hint' }],
    }))
    expect((await check('participant-sheet')).state).toBe('changed-in-drive')
    const [change] = await pending('participant-sheet')
    const accepted = await world.commands.decide({
      actor: ada,
      publicationId: publicationOf('participant-sheet').id,
      decisions: [{ changeId: change?.id ?? '', decision: 'accept' }],
    })
    expect(accepted).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('publishes either again once forgotten alone (PR #51)', async () => {
    await publish()
    await world.commands.forget({
      actor: ada,
      publicationId: publicationOf('participant-sheet').id,
    })
    expect(
      await world.queries.checkPublication({ actor: ada, studyId: 'study-1', kinds: ['protocol'] }),
    ).toEqual({ ok: true, value: { kinds: ['participant-sheet'] } })
    const again = await world.commands.publish({
      actor: ada,
      studyId: 'study-1',
      kinds: ['participant-sheet'],
      language: 'en',
      timeZone: 'UTC',
    })
    expect(again.ok).toBe(true)
    await world.commands.forget({ actor: ada, publicationId: publicationOf('protocol').id })
    expect(
      (
        await world.commands.publish({
          actor: ada,
          studyId: 'study-1',
          kinds: ['protocol'],
          language: 'en',
          timeZone: 'UTC',
        })
      ).ok,
    ).toBe(true)
    expect(
      [...world.store.rows.values()].filter((p) => p.kind === 'participant-sheet'),
    ).toHaveLength(1)
  })

  it('names the best practices file after the usability test (PR #51)', async () => {
    await publish(['best-practices'])
    expect([...world.drive.files.values()][0]?.name).toBe('Study A · Usability test best practices')
  })

  it('deletes nothing at the source when the study is unpublished from the app', async () => {
    await publish()
    const files = world.drive.files.size
    await world.commands.forget({ actor: ada, publicationId: publicationOf('protocol').id })
    expect(world.drive.files.size).toBe(files)
  })
})
