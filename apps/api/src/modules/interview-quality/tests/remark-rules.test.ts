import { describe, expect, it } from 'vitest'
import { mergeReview, reanchor, requalified, setStance } from '../domain/remarks.ts'

const AT = new Date('2026-10-31T10:00:00Z')
const ai = { origin: 'ai' as const, stance: null, stanceBy: null, stanceAt: null, version: 3 }

describe('a person opinion on a remark (US2)', () => {
  it('records who and when, and moves the version', () => {
    expect(setStance(ai, 'disagree', 'a1', AT)).toEqual({
      ok: true,
      value: { ...ai, stance: 'disagree', stanceBy: 'a1', stanceAt: AT, version: 4 },
    })
  })

  it('can be changed and withdrawn', () => {
    const agreed = setStance(ai, 'agree', 'a1', AT)
    if (!agreed.ok) throw new Error(agreed.error)
    const changed = setStance(agreed.value, 'disagree', 'a2', AT)
    if (!changed.ok) throw new Error(changed.error)
    expect(changed.value.stance).toBe('disagree')
    const withdrawn = setStance(changed.value, null, 'a2', AT)
    if (!withdrawn.ok) throw new Error(withdrawn.error)
    expect(withdrawn.value).toMatchObject({ stance: null, stanceBy: null, stanceAt: null })
  })

  it("refuses an opinion on a person's own remark: it can only be withdrawn", () => {
    expect(setStance({ ...ai, origin: 'person' as const }, 'disagree', 'a1', AT)).toEqual({
      ok: false,
      error: 'PERSON_REMARK_STANCE',
    })
  })
})

describe('requalifying a simple reformulation (US3)', () => {
  const reformulation = {
    sessionId: 's1',
    studyId: 'st',
    segmentId: 'g3',
    offset: 4,
    length: 9,
    text: 'So weekly?',
    speakerLabel: 'Alex',
  }

  it("becomes a person's remark, agreed, with their reason", () => {
    expect(
      requalified(reformulation, {
        id: 'r9',
        reason: '  It adds a cause. ',
        recommendation: '  ',
        by: 'a1',
        at: AT,
      }),
    ).toEqual({
      ...reformulation,
      id: 'r9',
      runId: null,
      kind: 'reformulation-with-opinion',
      reason: null,
      reasonPerson: 'It adds a cause.',
      recommendation: null,
      addedElement: null,
      origin: 'person',
      stance: 'agree',
      stanceBy: 'a1',
      stanceAt: AT,
      version: 1,
    })
  })
})

describe('a new review over what people said (US5)', () => {
  const kept = (over: object) => ({
    segmentId: 'g3',
    text: 'You find this too slow, right?',
    origin: 'ai' as const,
    stance: 'disagree' as const,
    ...over,
  })

  it('never flags again a sentence someone disagreed on, whatever the case or spaces', () => {
    const out = mergeReview({
      remarks: [{ segmentId: 'g3', text: 'you find  this too slow, RIGHT?' }],
      reformulations: [],
      existing: [kept({})],
    })
    expect(out.remarks).toEqual([])
  })

  it('keeps one remark per sentence when one with an opinion stays', () => {
    const out = mergeReview({
      remarks: [{ segmentId: 'g3', text: 'too slow, right?' }],
      reformulations: [],
      existing: [kept({ stance: 'agree' })],
    })
    expect(out.remarks).toEqual([])
  })

  it('does not count again as simple a sentence a person requalified', () => {
    const out = mergeReview({
      remarks: [],
      reformulations: [{ segmentId: 'g3', text: 'You find this too slow, right?' }],
      existing: [kept({ origin: 'person', stance: 'agree' })],
    })
    expect(out.reformulations).toEqual([])
  })

  it('leaves alone other turns, and remarks without an opinion, which get replaced', () => {
    const fresh = { segmentId: 'g9', text: 'You find this too slow, right?' }
    const same = { segmentId: 'g3', text: 'You find this too slow, right?' }
    const out = mergeReview({
      remarks: [fresh, same],
      reformulations: [],
      existing: [kept({}), kept({ segmentId: 'g9', stance: null })],
    })
    expect(out.remarks).toEqual([fresh])
  })
})

describe('finding a remark again in the current text (FR-012)', () => {
  const turns = [
    { id: 'g1', speaker: 'Alex', text: 'Do you like it? Do you like it?' },
    { id: 'g2', speaker: 'Sam', text: 'Do you mean the tool?' },
    { id: 'g3', speaker: 'Alex', text: 'Well, you find it slow, right?' },
  ]

  it('finds it in its turn, at the occurrence nearest its old place', () => {
    expect(
      reanchor(
        { segmentId: 'g1', offset: 15, text: 'Do you like it?', speakerLabel: 'Alex' },
        turns,
      ),
    ).toEqual({ segmentId: 'g1', offset: 16, length: 15 })
  })

  it('finds it in another turn of the same speaker, never in someone else', () => {
    expect(
      reanchor(
        { segmentId: 'g9', offset: 0, text: 'you find it  SLOW, right?', speakerLabel: 'Alex' },
        turns,
      ),
    ).toEqual({ segmentId: 'g3', offset: 6, length: 24 })
    expect(
      reanchor(
        { segmentId: 'g9', offset: 0, text: 'Do you mean the tool?', speakerLabel: 'Alex' },
        turns,
      ),
    ).toBeNull()
  })

  it('is null when the text is gone', () => {
    expect(
      reanchor({ segmentId: 'g3', offset: 0, text: 'Gone now', speakerLabel: 'Alex' }, turns),
    ).toBeNull()
  })
})
