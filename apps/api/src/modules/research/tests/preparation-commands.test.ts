import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makePreparationCommands } from '../application/commands/preparation-commands.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import type { GuideInput } from '../domain/interview-guide.ts'
import type { PlannedInterviewFields } from '../domain/planned-interview.ts'
import { Study } from '../domain/study.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }

const guide = (question = 'Tell me about the last time you planned a trip.'): GuideInput => ({
  framing: { objectives: 'Goal', hypotheses: [], audience: '', format: '' },
  sections: [
    { kind: 'theme', title: 'Trips', minutes: 20, questions: [{ text: question, followUps: [] }] },
  ],
})

const row = (overrides: Partial<PlannedInterviewFields> = {}): PlannedInterviewFields => ({
  interviewee: 'Sam',
  role: '',
  interviewers: '',
  scheduledAt: null,
  status: 'to-contact',
  notes: '',
  ...overrides,
})

describe('preparation commands', () => {
  let research: InMemoryResearch
  let commands: ReturnType<typeof makePreparationCommands>
  let studyId: string

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a'],
      memberships: { alice: ['team-a'], bob: [] },
      admins: [],
    })
    const deps = research.deps(fixedClock(new Date('2026-10-25T10:00:00Z')))
    commands = makePreparationCommands({
      ...deps,
      studies: research.studyRepository,
      guides: research.guideRepository,
      planned: research.plannedRepository,
      gate: research.gate,
    })
    const studies = makeStudyCommands({
      ...deps,
      studies: research.studyRepository,
      gate: research.gate,
      runs: research.runs,
    })
    const projectId = await research.addProject('team-a')
    const created = await studies.createStudy({
      actor: alice,
      projectId,
      name: 'Interviews',
      type: 'interviews',
    })
    if (!created.ok) throw new Error('fixture')
    studyId = created.value.id
  })

  const save = (version: number | null, content = guide()) =>
    commands.saveGuide({ actor: alice, studyId, content, version, origin: 'person' })

  it('creates the guide, then replaces it against the version seen', async () => {
    expect(await save(null)).toEqual({ ok: true, value: { version: 0 } })
    expect(await save(0, guide('How do you choose where to go?'))).toEqual({
      ok: true,
      value: { version: 1 },
    })
    expect(research.guides.get(studyId)?.version).toBe(1)
  })

  it('refuses a stale save, and a creation when a guide exists (FR-004)', async () => {
    await save(null)
    await save(0)
    expect(await save(0)).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(await save(null)).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(await save(5)).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('refuses a save with a version when there is no guide', async () => {
    expect(await save(0)).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
  })

  it('applies the gate: team, then folder access (FR-012)', async () => {
    expect(
      await commands.saveGuide({
        actor: bob,
        studyId,
        content: guide(),
        version: null,
        origin: 'person',
      }),
    ).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
    research.folderAccessDenied.add(`alice:${studyId}`)
    expect(await save(null)).toEqual({ ok: false, error: 'FOLDER_ACCESS_REQUIRED' })
    expect(await commands.addPlannedInterview({ actor: alice, studyId, fields: row() })).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
  })

  it('prepares only interview studies', async () => {
    const study = research.studies.get(studyId)
    if (!study) throw new Error('fixture')
    research.studies.set(studyId, Study.fromPersistence({ ...study.snapshot(), type: 'survey' }))
    expect(await save(null)).toEqual({ ok: false, error: 'NOT_AN_INTERVIEW_STUDY' })
    // Outside the team, the type of the study is not revealed.
    expect(
      await commands.saveGuide({
        actor: bob,
        studyId,
        content: guide(),
        version: null,
        origin: 'person',
      }),
    ).toEqual({ ok: false, error: 'STUDY_NOT_FOUND' })
    expect(await commands.addPlannedInterview({ actor: alice, studyId, fields: row() })).toEqual({
      ok: false,
      error: 'NOT_AN_INTERVIEW_STUDY',
    })
  })

  it('validates the guide', async () => {
    expect(await save(null, guide(' '))).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('adds, edits with a version and deletes planned interviews', async () => {
    const added = await commands.addPlannedInterview({ actor: alice, studyId, fields: row() })
    if (!added.ok) throw new Error('fixture')
    const id = added.value.id
    expect(
      await commands.updatePlannedInterview({
        actor: alice,
        plannedInterviewId: id,
        fields: row({ status: 'invited' }),
        version: 0,
      }),
    ).toEqual({ ok: true, value: { version: 1 } })
    expect(
      await commands.updatePlannedInterview({
        actor: alice,
        plannedInterviewId: id,
        fields: row({ status: 'done' }),
        version: 0,
      }),
    ).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    expect(await commands.deletePlannedInterview({ actor: bob, plannedInterviewId: id })).toEqual({
      ok: false,
      error: 'PLANNED_INTERVIEW_NOT_FOUND',
    })
    expect(await commands.deletePlannedInterview({ actor: alice, plannedInterviewId: id })).toEqual(
      { ok: true, value: undefined },
    )
    expect(research.planned.size).toBe(0)
  })

  it('stops at 300 planned interviews (FR-011)', async () => {
    for (let i = 0; i < 300; i++)
      await commands.addPlannedInterview({ actor: alice, studyId, fields: row() })
    expect(await commands.addPlannedInterview({ actor: alice, studyId, fields: row() })).toEqual({
      ok: false,
      error: 'SCHEDULE_FULL',
    })
  })
})
