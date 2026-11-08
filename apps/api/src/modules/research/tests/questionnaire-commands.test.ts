import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeQuestionnaireCommands } from '../application/commands/questionnaire-commands.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import type { QuestionnaireInput } from '../domain/questionnaire.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }

const content = (text = 'Planning is easy for me'): QuestionnaireInput => ({
  framing: {
    objective: 'Measure',
    hypotheses: [],
    audience: '',
    recruitment: 'targeted',
    administration: '',
    targetResponses: null,
    targetReason: '',
    language: 'en',
    consent: 'You choose to take part.',
    thanks: 'Thank you.',
    shuffle: true,
  },
  sections: [
    {
      kind: 'theme',
      title: 'Planning',
      items: [
        {
          text,
          measure: 'subjective',
          required: true,
          subTheme: null,
          contact: false,
          kind: 'likert',
          points: 7,
          lowLabel: 'Strongly disagree',
          highLabel: 'Strongly agree',
        },
      ],
    },
  ],
})

describe('questionnaire commands', () => {
  let research: InMemoryResearch
  let commands: ReturnType<typeof makeQuestionnaireCommands>
  let surveyId: string
  let interviewsId: string

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a'],
      memberships: { alice: ['team-a'], bob: [] },
      admins: [],
    })
    const deps = research.deps(fixedClock(new Date('2026-11-02T10:00:00Z')))
    commands = makeQuestionnaireCommands({
      ...deps,
      studies: research.studyRepository,
      questionnaires: research.questionnaireRepository,
      gate: research.gate,
    })
    const studies = makeStudyCommands({
      ...deps,
      studies: research.studyRepository,
      gate: research.gate,
      runs: { isRunning: async () => false },
      video: { readsVideo: async () => true },
    })
    const make = async (type: string) => {
      const created = await studies.createTeamStudy({
        actor: alice,
        teamId: 'team-a',
        name: `A ${type} study`,
        goal: 'Goal',
        type,
      })
      if (!created.ok) throw new Error('fixture')
      return created.value.id
    }
    surveyId = await make('survey')
    interviewsId = await make('interviews')
  })

  const save = (version: number | null, text?: string, actor = alice) =>
    commands.saveQuestionnaire({
      actor,
      studyId: surveyId,
      content: content(text),
      version,
      origin: 'person',
    })

  it('creates, then saves against the version seen', async () => {
    expect(await save(null)).toEqual({ ok: true, value: { version: 0 } })
    expect(await save(0, 'Reworded')).toEqual({ ok: true, value: { version: 1 } })
  })

  it('refuses a stale version: nothing is lost silently', async () => {
    await save(null)
    await save(0, 'First')
    expect(await save(0, 'Second')).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(await save(null, 'Third')).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('exists only on survey studies', async () => {
    expect(
      await commands.saveQuestionnaire({
        actor: alice,
        studyId: interviewsId,
        content: content(),
        version: null,
        origin: 'person',
      }),
    ).toEqual({ ok: false, error: 'NOT_A_SURVEY_STUDY' })
  })

  it('is refused outside the team, without revealing the type', async () => {
    expect(await save(null, undefined, bob)).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
  })

  it('refuses invalid content', async () => {
    expect(await save(null, '   ')).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('marks a check on the current version, without raising it', async () => {
    await save(null)
    expect(
      await commands.markReadiness({
        actor: alice,
        studyId: surveyId,
        kind: 'review',
        people: null,
      }),
    ).toEqual({ ok: true, value: undefined })
    expect(research.readinessMarks.get(`${surveyId}:review`)).toMatchObject({
      questionnaireVersion: 0,
      markedBy: 'alice',
    })
    expect((await research.questionnaireRepository.findByStudy(surveyId))?.version).toBe(0)
    await commands.unmarkReadiness({ actor: alice, studyId: surveyId, kind: 'review' })
    expect(research.readinessMarks.size).toBe(0)
  })

  it('asks how many people took a pre-test, and only then', async () => {
    await save(null)
    const mark = (kind: 'review' | 'pre-test', people: number | null) =>
      commands.markReadiness({ actor: alice, studyId: surveyId, kind, people })
    expect(await mark('pre-test', null)).toEqual({ ok: false, error: 'VALIDATION' })
    expect(await mark('review', 3)).toEqual({ ok: false, error: 'VALIDATION' })
    expect((await mark('pre-test', 3)).ok).toBe(true)
  })

  it('cannot mark a check without a questionnaire', async () => {
    expect(
      await commands.markReadiness({
        actor: alice,
        studyId: surveyId,
        kind: 'review',
        people: null,
      }),
    ).toEqual({ ok: false, error: 'QUESTIONNAIRE_NOT_FOUND' })
  })
})
