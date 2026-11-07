import { describe, expect, it } from 'vitest'
import type { DocBlock } from '../domain/model.ts'
import { renderParticipantSheet, sheetItems } from '../domain/participant-sheet.ts'
import {
  applyToProtocol,
  type ProtocolContent,
  protocolItems,
  readProtocol,
  renderProtocol,
  validProtocolItem,
} from '../domain/protocol.ts'
import { threeWay } from '../domain/three-way.ts'

const protocol = (over: Partial<ProtocolContent> = {}): ProtocolContent => ({
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: ['Sharing is hard to find'],
    participants: 'Analysts',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: {
    introduction: 'Thank you.',
    thinkAloud: 'Think aloud.',
    warmUp: ['How do you share reports today?'],
    debrief: ['What was hardest?'],
    closing: 'Thank you again.',
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
    {
      id: 't2',
      instruction: 'Find last week report',
      criterion: 'The report is open',
      startUrl: 'https://prototype.example.org/reports',
      minutes: null,
    },
  ],
  questionnaire: 'none',
  easeQuestion: 'none',
  retiredTaskIds: [],
  ...over,
})

const texts = (doc: { blocks: readonly { text: string }[] }) => doc.blocks.map((b) => b.text)
const diff = (app: ProtocolContent, doc: ReturnType<typeof renderProtocol>) =>
  threeWay(protocolItems(app), protocolItems(app), readProtocol(doc).items, validProtocolItem)

describe('protocol document (spec 036 US5)', () => {
  it('numbers the tasks, sets the instruction apart to be read aloud and the criterion for the facilitator', () => {
    const doc = renderProtocol(protocol(), 'Reports', 'en')
    const all = texts(doc)
    expect(all).toContain('Task 1')
    expect(all).toContain('Task 2')
    expect(all).toContain('Read aloud: Send this report to your manager')
    expect(all).toContain('For the facilitator only: It is sent')
    expect(all).toContain('Starts at: https://prototype.example.org/reports')
    expect(doc.blocks.find((b) => b.text === 'Task 1')).toMatchObject({ anchor: 'task:t1' })
  })

  it('reads back what it wrote: in sync', () => {
    const p = protocol({ questionnaire: 'sus-v1', easeQuestion: 'seq-v1' })
    expect(diff(p, renderProtocol(p, 'Reports', 'en')).state).toBe('in-sync')
    const fr = protocol({
      framing: { ...protocol().framing, language: 'fr' },
      questionnaire: 'sus-v1',
    })
    expect(diff(fr, renderProtocol(fr, 'Rapports', 'fr')).state).toBe('in-sync')
  })

  it('writes the ease question after each task and the SUS at the end, when on', () => {
    const all = texts(
      renderProtocol(protocol({ questionnaire: 'sus-v1', easeQuestion: 'seq-v1' }), 'R', 'en'),
    )
    expect(
      all.filter((t) => t.startsWith('Then ask: Overall, how difficult or easy')),
    ).toHaveLength(2)
    expect(all).toContain('System Usability Scale')
    expect(
      all.find((x) => x.startsWith('1. I think that I would like to use this system frequently.')),
    ).toContain('☐ 1   ☐ 2   ☐ 3   ☐ 4   ☐ 5')
    expect(
      all.find((x) => x.startsWith('For the facilitator only: Right after the last task')),
    ).toBeTruthy()
    expect(all.find((x) => x.startsWith('For each of the following statements'))).toBeTruthy()
  })

  it('turning the SUS or the SEQ on makes the document out of date', () => {
    const before = protocol()
    const doc = renderProtocol(before, 'R', 'en')
    for (const after of [
      protocol({ questionnaire: 'sus-v1' }),
      protocol({ easeQuestion: 'seq-v1' }),
    ]) {
      const result = threeWay(
        protocolItems(before),
        protocolItems(after),
        readProtocol(doc).items,
        validProtocolItem,
      )
      expect(result.state).toBe('out-of-date')
    }
  })

  it('a task edited in the document is a Drive change that keeps its id when accepted', () => {
    const p = protocol()
    const doc = renderProtocol(p, 'R', 'en')
    const edited = {
      blocks: doc.blocks.map((b) =>
        b.anchor === 'task:t1:instruction'
          ? { ...b, text: 'Read aloud: Share this report with your manager' }
          : b,
      ),
    }
    const result = diff(p, edited)
    expect(result.state).toBe('changed-in-drive')
    const change = result.changes.find((c) => c.key === 'task:t1')
    expect(change).toMatchObject({
      kind: 'changed',
      drive: { instruction: 'Share this report with your manager' },
    })
    const input = applyToProtocol(p, new Map([['task:t1', change?.drive]]))
    expect(input.tasks[0]).toMatchObject({
      id: 't1',
      instruction: 'Share this report with your manager',
    })
  })

  it('reads a task added in the document by its prefixes, and adds it at the end', () => {
    const p = protocol()
    const doc = renderProtocol(p, 'R', 'en')
    const at = doc.blocks.findIndex((b) => b.anchor === 'debrief')
    const blocks = [
      ...doc.blocks.slice(0, at),
      { kind: 'heading' as const, level: 3 as const, text: 'Task 3' },
      { kind: 'paragraph' as const, text: 'Read aloud: Delete an old report' },
      { kind: 'paragraph' as const, text: 'For the facilitator only: It is gone' },
      ...doc.blocks.slice(at),
    ]
    const result = diff(p, { blocks })
    const added = result.changes.find((c) => c.kind === 'added')
    expect(added?.drive).toMatchObject({
      instruction: 'Delete an old report',
      criterion: 'It is gone',
    })
    const input = applyToProtocol(p, new Map([[added?.key ?? '', added?.drive]]))
    expect(input.tasks.at(-1)).toMatchObject({ instruction: 'Delete an old report' })
    expect(input.tasks.at(-1)?.id).toBeUndefined()
  })

  it('reports a change of the SUS text or of the settings as not understood', () => {
    const p = protocol({ questionnaire: 'sus-v1' })
    const doc = renderProtocol(p, 'R', 'en')
    const edited = {
      blocks: doc.blocks.map((b) =>
        b.text.startsWith('1. I think')
          ? { ...b, text: '1. I like it.   ☐ 1' }
          : b.text.startsWith('Session length')
            ? { ...b, text: 'Session length: 90 min' }
            : b,
      ),
    }
    const kinds = diff(p, edited).changes.map((c) => [c.key, c.kind])
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['standard:questionnaire', 'not-understood'],
        ['settings', 'not-understood'],
      ]),
    )
  })

  it('reads a block whose heading lost its anchor as not understood, never as emptied (PR #51)', () => {
    const p = protocol()
    const doc = renderProtocol(p, 'R', 'en')
    const lost = {
      blocks: doc.blocks.map(
        (b): DocBlock =>
          b.anchor === 'scenario' ? { kind: 'heading', level: 3, text: b.text } : b,
      ),
    }
    const change = diff(p, lost).changes.find((c) => c.key === 'scenario')
    expect(change?.kind).toBe('not-understood')
  })

  it("brings back a task removed in the app when Drive's version is accepted (PR #51)", () => {
    const p = protocol()
    const value = {
      type: 'task',
      instruction: 'Find last week report',
      criterion: 'Open',
      startUrl: null,
      minutes: null,
    }
    const input = applyToProtocol(
      { ...p, tasks: p.tasks.slice(0, 1) },
      new Map([['task:t2', value]]),
    )
    expect(input.tasks.map((t) => t.instruction)).toEqual([
      'Send this report to your manager',
      'Find last week report',
    ])
    expect(input.tasks[1]?.id).toBeUndefined()
  })

  it('keeps real content when a known label was removed (PR #51)', () => {
    const p = protocol()
    const doc = renderProtocol(p, 'R', 'en')
    const edited = {
      blocks: doc.blocks.map((b) =>
        b.anchor === 'task:t1:instruction'
          ? { ...b, text: 'Find the plan: the cheapest one' }
          : b.anchor === 'task:t2:start'
            ? { ...b, text: 'https://x.example.org' }
            : b,
      ),
    }
    const items = readProtocol(edited).items
    expect(items.get('task:t1')).toMatchObject({ instruction: 'Find the plan: the cheapest one' })
    expect(items.get('task:t2')).toMatchObject({ startUrl: 'https://x.example.org' })
  })

  it('joins a paragraph split in the middle of an instruction back to it (PR #51)', () => {
    const p = protocol({ easeQuestion: 'seq-v1' })
    const doc = renderProtocol(p, 'R', 'en')
    const at = doc.blocks.findIndex((b) => b.anchor === 'task:t1:instruction')
    const blocks = [
      ...doc.blocks.slice(0, at),
      {
        kind: 'paragraph' as const,
        text: 'Read aloud: Send this report',
        anchor: 'task:t1:instruction',
      },
      { kind: 'paragraph' as const, text: 'to your manager' },
      ...doc.blocks.slice(at + 1),
    ]
    expect(readProtocol({ blocks }).items.get('task:t1')).toMatchObject({
      instruction: 'Send this report to your manager',
    })
    expect(diff(p, { blocks }).state).toBe('in-sync')
  })

  it('judges a list against its own limit and requires the consent (PR #51)', () => {
    const items = protocolItems(protocol())
    const debrief = items.get('script:debrief') as { max: number }
    expect(debrief.max).toBe(10)
    expect(validProtocolItem({ ...debrief, items: Array.from({ length: 11 }, () => 'Q') })).toBe(
      false,
    )
    expect(validProtocolItem({ ...(items.get('framing:consent') as object), text: '' })).toBe(false)
    expect(validProtocolItem({ ...(items.get('framing:objective') as object), text: '' })).toBe(
      true,
    )
  })

  it('refuses a task value breaking the limits', () => {
    expect(
      validProtocolItem({
        type: 'task',
        instruction: '',
        criterion: 'x',
        startUrl: null,
        minutes: null,
      }),
    ).toBe(false)
    expect(
      validProtocolItem({
        type: 'task',
        instruction: 'x',
        criterion: 'x',
        startUrl: 'ftp://a',
        minutes: null,
      }),
    ).toBe(false)
    expect(
      validProtocolItem({
        type: 'task',
        instruction: 'x',
        criterion: 'x',
        startUrl: null,
        minutes: 61,
      }),
    ).toBe(false)
    expect(
      validProtocolItem({
        type: 'task',
        instruction: 'x',
        criterion: 'x',
        startUrl: null,
        minutes: 5,
      }),
    ).toBe(true)
  })
})

describe('participant sheet (spec 036 FR-013a)', () => {
  it('holds the SUS to fill in, without the facilitator note', () => {
    const all = texts(renderParticipantSheet(protocol({ questionnaire: 'sus-v1' }), 'Reports'))
    expect(all).toContain('System Usability Scale')
    expect(all.find((x) => x.startsWith('10. I needed to learn a lot of things'))).toContain('☐ 5')
    expect(all.join('\n')).not.toContain('Right after the last task')
  })

  it('holds the scenario and the numbered instructions with start links, nothing for the facilitator', () => {
    const p = protocol({ easeQuestion: 'seq-v1', questionnaire: 'sus-v1' })
    const all = texts(renderParticipantSheet(p, 'Reports'))
    expect(all).toContain('You prepare the weekly review.')
    expect(all).toContain('Task 1')
    expect(all).toContain('Send this report to your manager')
    expect(all).toContain('Starts at: https://prototype.example.org/reports')
    const joined = all.join('\n')
    for (const hidden of [
      'It is sent',
      'The report is open',
      'Think aloud',
      '5 min',
      'Overall, how difficult',
      'Right after the last task',
    ])
      expect(joined).not.toContain(hidden)
  })

  it('is one item never taken back: a Drive edit is not understood', () => {
    const doc = renderParticipantSheet(protocol(), 'Reports')
    const edited = { blocks: [...doc.blocks, { kind: 'paragraph' as const, text: 'Extra hint' }] }
    const result = threeWay(sheetItems(doc), sheetItems(doc), sheetItems(edited), () => true)
    expect(result.changes).toMatchObject([{ key: 'content', kind: 'not-understood' }])
  })
})
