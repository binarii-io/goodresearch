import { describe, expect, it } from 'vitest'
import { completeness } from '../domain/guide-progress.ts'
import { checkQuestion } from '../domain/question-checks.ts'

describe('guide design progress (spec 006 research R3)', () => {
  it('weighs each point: missing 0, partial half, done full', () => {
    expect(completeness({}).percent).toBe(0)
    expect(completeness({ objectives: 'partial' }).percent).toBe(8)
    expect(
      completeness({
        objectives: 'done',
        hypotheses: 'done',
        audience: 'done',
        format: 'done',
        intro: 'done',
        themes: 'done',
        followUps: 'done',
        biasReview: 'done',
      }).percent,
    ).toBe(100)
    expect(completeness({ themes: 'partial', biasReview: 'done' }).percent).toBe(18)
  })

  it('lists the eight points in order with their weights', () => {
    expect(completeness({}).items.map((i) => [i.key, i.weight])).toEqual([
      ['objectives', 15],
      ['hypotheses', 10],
      ['audience', 15],
      ['format', 10],
      ['intro', 10],
      ['themes', 25],
      ['followUps', 10],
      ['biasReview', 5],
    ])
  })

  it('counts unknown states as missing and ignores unknown points', () => {
    const result = completeness({ objectives: 'maybe', other: 'done' } as never)
    expect(result.percent).toBe(0)
    expect(result.items).toHaveLength(8)
  })
})

describe('question writing checks (spec 006, writing constraints)', () => {
  const issues = (q: string) => checkQuestion(q)

  it('accepts open questions about lived experience', () => {
    expect(issues('Tell me about the last time you planned your week.')).toEqual([])
    expect(issues('How do you keep track of changes during the week?')).toEqual([])
    expect(issues('Racontez-moi la dernière fois que vous avez préparé un voyage.')).toEqual([])
    expect(issues('Comment faites-vous aujourd’hui pour suivre vos dépenses ?')).toEqual([])
  })

  it('accepts polite openers of open questions (PR #6 review)', () => {
    expect(issues('Could you tell me about the last time you planned a trip?')).toEqual([])
    expect(issues('Can you walk me through your week?')).toEqual([])
    expect(issues('Pouvez-vous me raconter votre semaine ?')).toEqual([])
    expect(issues('Pourriez-vous me décrire votre dernier voyage ?')).toEqual([])
    expect(issues('How did you pick the right tool?')).toEqual([])
    expect(issues('Could you use it every day?')).toContain('closed')
  })

  it('flags closed questions', () => {
    expect(issues('Do you use a calendar?')).toContain('closed')
    expect(issues('Is it hard to plan?')).toContain('closed')
    expect(issues('Est-ce que vous utilisez un agenda ?')).toContain('closed')
    expect(issues('Utilisez-vous un agenda ?')).toContain('closed')
  })

  it('flags leading questions', () => {
    expect(issues('You find that complicated, don’t you?')).toContain('leading')
    expect(issues('Vous trouvez ça compliqué, non ?')).toContain('leading')
    expect(issues("C'est pénible, n'est-ce pas ?")).toContain('leading')
    expect(issues('Wouldn’t it be easier to plan on paper?')).toContain('leading')
    expect(issues('It was slow, right?')).toContain('leading')
  })

  it('flags hypothetical, future and solution questions', () => {
    expect(issues('If you had a magic wand, what would you change?')).toContain('hypothetical')
    expect(issues('Imaginez que vous ayez plus de temps : que feriez-vous ?')).toContain(
      'hypothetical',
    )
    expect(issues('Would you use an app that plans for you?')).toContain('future')
    expect(issues('Utiliseriez-vous une application pour cela ?')).toContain('future')
    expect(issues('What feature should we build next?')).toContain('solution')
    expect(issues('Que faudrait-il développer pour vous aider ?')).toContain('solution')
    // Word boundaries after accented letters (French).
    expect(issues('Quelle fonctionnalité aimeriez-vous ?')).toContain('solution')
  })

  it('flags double and long questions', () => {
    expect(issues('How do you plan? And who helps you?')).toContain('double')
    expect(issues('Comment faites-vous et où ?')).toContain('double')
    expect(issues(`Tell me ${'about this '.repeat(20)}please.`)).toContain('long')
  })
})
