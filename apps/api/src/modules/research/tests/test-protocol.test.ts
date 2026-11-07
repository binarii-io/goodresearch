import { describe, expect, it } from 'vitest'
import {
  TestProtocol,
  type TestProtocolInput,
  type TestTaskInput,
} from '../domain/test-protocol.ts'

const now = new Date('2026-11-07T10:00:00Z')
let n = 0
const newId = () => `t-${++n}`

const task = (instruction: string, id?: string): TestTaskInput => ({
  id,
  instruction,
  criterion: 'The confirmation page is shown',
  startUrl: null,
  minutes: 5,
})

const input = (over: Partial<TestProtocolInput> = {}): TestProtocolInput => ({
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: [],
    participants: 'Analysts who write reports weekly',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org/start', kind: 'prototype', description: null },
  },
  script: {
    introduction: 'Thank you for coming.',
    thinkAloud: 'Please think aloud.',
    warmUp: ['How do you share reports today?'],
    debrief: ['What was hardest?'],
    closing: 'Thank you.',
  },
  scenario: 'You prepare the weekly review.',
  tasks: [task('Send this report to your manager so that they can read it')],
  questionnaire: 'none',
  easeQuestion: 'none',
  ...over,
})

const create = (content: TestProtocolInput) =>
  TestProtocol.create({ studyId: 's', content, origin: 'person', by: 'a', now, newId })

const invalid = (content: TestProtocolInput) =>
  expect(create(content)).toEqual({ ok: false, error: 'VALIDATION' })

const ids = (p: TestProtocol) => p.snapshot().content.tasks.map((t) => t.id)

describe('TestProtocol', () => {
  it('is created at version 0 with task ids and its origin', () => {
    const p = create(input())
    expect(p.ok).toBe(true)
    if (!p.ok) return
    const s = p.value.snapshot()
    expect(s.version).toBe(0)
    expect(s.origin).toBe('person')
    expect(s.content.tasks[0]?.id).toBeTruthy()
    expect(s.content.retiredTaskIds).toEqual([])
  })

  it('holds 1 to 15 ordered test tasks', () => {
    invalid(input({ tasks: [] }))
    invalid(input({ tasks: Array.from({ length: 16 }, (_, i) => task(`Goal number ${i}`)) }))
    expect(
      create(input({ tasks: Array.from({ length: 15 }, (_, i) => task(`Goal ${i}`)) })).ok,
    ).toBe(true)
  })

  it('holds up to 15 hypotheses, 10 warm-up and 10 debrief questions', () => {
    const framing = input().framing
    const script = input().script
    invalid(
      input({ framing: { ...framing, hypotheses: Array.from({ length: 16 }, (_, i) => `H${i}`) } }),
    )
    invalid(input({ script: { ...script, warmUp: Array.from({ length: 11 }, (_, i) => `Q${i}`) } }))
    invalid(
      input({ script: { ...script, debrief: Array.from({ length: 11 }, (_, i) => `Q${i}`) } }),
    )
  })

  it('refuses an instruction or criterion over 600 characters, a framing or script text over 4,000', () => {
    invalid(input({ tasks: [task('x'.repeat(601))] }))
    invalid(input({ tasks: [{ ...task('Goal'), criterion: 'x'.repeat(601) }] }))
    invalid(input({ scenario: 'x'.repeat(4001) }))
    invalid(input({ script: { ...input().script, introduction: 'x'.repeat(4001) } }))
    expect(create(input({ tasks: [task('x'.repeat(600))] })).ok).toBe(true)
  })

  it('trims texts and refuses empty ones, except the description and the start link', () => {
    invalid(input({ tasks: [task('   ')] }))
    invalid(input({ tasks: [{ ...task('Goal'), criterion: ' ' }] }))
    invalid(input({ framing: { ...input().framing, consent: '  ' } }))
    const p = create(input({ tasks: [task('  Send it  ')] }))
    expect(p.ok && p.value.snapshot().content.tasks[0]?.instruction).toBe('Send it')
  })

  it('bounds the session and task durations', () => {
    const framing = input().framing
    invalid(input({ framing: { ...framing, sessionMinutes: 9 } }))
    invalid(input({ framing: { ...framing, sessionMinutes: 241 } }))
    invalid(input({ tasks: [{ ...task('Goal'), minutes: 0 }] }))
    invalid(input({ tasks: [{ ...task('Goal'), minutes: 61 }] }))
    expect(create(input({ tasks: [{ ...task('Goal'), minutes: null }] })).ok).toBe(true)
  })

  it('accepts only http(s) web addresses for the interface and start links', () => {
    const framing = input().framing
    invalid(
      input({ framing: { ...framing, interface: { ...framing.interface, url: 'ftp://x.org' } } }),
    )
    invalid(
      input({ framing: { ...framing, interface: { ...framing.interface, url: 'not a link' } } }),
    )
    invalid(input({ tasks: [{ ...task('Goal'), startUrl: 'javascript:alert(1)' }] }))
    expect(
      create(input({ tasks: [{ ...task('Goal'), startUrl: 'http://app.example.org/a' }] })).ok,
    ).toBe(true)
  })

  it('refuses unknown kinds, formats, languages and standard question keys', () => {
    const framing = input().framing
    // biome-ignore lint/suspicious/noExplicitAny: values from outside the type, as a Drive change could send
    const bad = (x: any) => x
    invalid(input({ framing: { ...framing, format: bad('unmoderated') } }))
    invalid(input({ framing: { ...framing, language: bad('de') } }))
    invalid(
      input({ framing: { ...framing, interface: { ...framing.interface, kind: bad('app') } } }),
    )
    invalid(input({ questionnaire: bad('sus-v2') }))
    invalid(input({ easeQuestion: bad('seq') }))
    expect(create(input({ questionnaire: 'sus-v1', easeQuestion: 'seq-v1' })).ok).toBe(true)
  })

  it('keeps task ids by sent id, then by the same instruction, through reordering', () => {
    const p = create(input({ tasks: [task('First goal'), task('Second goal')] }))
    if (!p.ok) throw new Error('setup')
    const [a, b] = ids(p.value)
    expect(
      p.value.replace({
        content: input({ tasks: [task('Second goal'), task('First goal', a)] }),
        origin: 'person',
        by: 'a',
        now,
        newId,
      }).ok,
    ).toBe(true)
    expect(ids(p.value)).toEqual([b, a])
    p.value.replace({
      content: input({
        tasks: [task('  second   GOAL ', undefined), task('First goal reworded', a)],
      }),
      origin: 'drive',
      by: 'a',
      now,
      newId,
    })
    expect(ids(p.value)).toEqual([b, a])
  })

  it('retires a removed task id and never mints it again', () => {
    const p = create(input({ tasks: [task('First goal'), task('Second goal')] }))
    if (!p.ok) throw new Error('setup')
    const [a, b] = ids(p.value)
    p.value.replace({
      content: input({ tasks: [task('First goal', a)] }),
      origin: 'person',
      by: 'a',
      now,
      newId,
    })
    expect(p.value.snapshot().content.retiredTaskIds).toEqual([b])
    // A task sent back with the retired id, or with the removed text, gets a new id, even when the
    // generator happens to give the retired one first.
    let first = true
    p.value.replace({
      content: input({ tasks: [task('First goal', a), task('Second goal', b)] }),
      origin: 'person',
      by: 'a',
      now,
      newId: () => {
        if (first) {
          first = false
          return b as string
        }
        return newId()
      },
    })
    const after = ids(p.value)
    expect(after[0]).toBe(a)
    expect(after[1]).not.toBe(b)
  })
})
