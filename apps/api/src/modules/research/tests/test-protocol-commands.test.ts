import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { makeTestProtocolCommands } from '../application/commands/test-protocol-commands.ts'
import type { TestProtocolInput } from '../domain/test-protocol.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }

const content = (
  instruction = 'Send this report to your manager so that they read it',
): TestProtocolInput => ({
  framing: {
    objective: 'See whether people can share a report',
    hypotheses: [],
    participants: '',
    format: 'moderated-remote',
    sessionMinutes: 45,
    language: 'en',
    consent: 'The session is recorded and read by an AI service.',
    interface: { url: 'https://prototype.example.org', kind: 'prototype', description: null },
  },
  script: { introduction: '', thinkAloud: 'Think aloud.', warmUp: [], debrief: [], closing: '' },
  scenario: '',
  tasks: [{ instruction, criterion: 'The report is sent', startUrl: null, minutes: null }],
  questionnaire: 'none',
  easeQuestion: 'none',
})

describe('test protocol commands', () => {
  let research: InMemoryResearch
  let commands: ReturnType<typeof makeTestProtocolCommands>
  let testId: string
  let surveyId: string

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a'],
      memberships: { alice: ['team-a'], bob: [] },
      admins: [],
    })
    const deps = research.deps(fixedClock(new Date('2026-11-07T10:00:00Z')))
    commands = makeTestProtocolCommands({
      ...deps,
      studies: research.studyRepository,
      protocols: research.protocolRepository,
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
    testId = await make('usability-test')
    surveyId = await make('survey')
  })

  const save = (version: number | null, instruction?: string, actor = alice, studyId = testId) =>
    commands.saveTestProtocol({
      actor,
      studyId,
      content: content(instruction),
      version,
      origin: 'person',
    })

  it('creates, then saves against the version seen, recording who and the origin', async () => {
    expect(await save(null)).toEqual({ ok: true, value: { version: 0 } })
    expect(await save(0, 'Find last week report so that you can share it')).toEqual({
      ok: true,
      value: { version: 1 },
    })
    expect((await research.protocolRepository.findByStudy(testId))?.snapshot()).toMatchObject({
      version: 1,
      origin: 'person',
      updatedBy: 'alice',
    })
  })

  it('refuses a stale version: nothing is lost silently', async () => {
    await save(null)
    await save(0, 'First goal to reach')
    expect(await save(0, 'Second goal to reach')).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(await save(null, 'Third goal to reach')).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('exists only on usability test studies', async () => {
    expect(await save(null, undefined, alice, surveyId)).toEqual({
      ok: false,
      error: 'NOT_A_USABILITY_TEST_STUDY',
    })
  })

  it('is refused outside the team, without revealing the type', async () => {
    expect(await save(null, undefined, bob)).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
  })

  it('refuses invalid content', async () => {
    expect(await save(null, '   ')).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('marks a check on the current version without raising it, and unmarks it', async () => {
    await save(null)
    expect(
      await commands.markProtocolReadiness({ actor: alice, studyId: testId, kind: 'pilot' }),
    ).toEqual({ ok: true, value: undefined })
    expect(research.protocolMarks.get(`${testId}:pilot`)).toMatchObject({
      protocolVersion: 0,
      markedBy: 'alice',
    })
    expect((await research.protocolRepository.findByStudy(testId))?.version).toBe(0)
    await commands.unmarkProtocolReadiness({ actor: alice, studyId: testId, kind: 'pilot' })
    expect(research.protocolMarks.size).toBe(0)
  })

  it('cannot mark a check without a protocol', async () => {
    expect(
      await commands.markProtocolReadiness({ actor: alice, studyId: testId, kind: 'review' }),
    ).toEqual({ ok: false, error: 'PROTOCOL_NOT_FOUND' })
  })
})
