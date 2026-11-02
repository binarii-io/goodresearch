import { describe, expect, it } from 'vitest'
import { buildContext } from '../application/context.ts'
import type { ResearchReads } from '../application/ports.ts'
import { offeredOnReadOnlyPage, READ_ONLY_TOOLS, TOOLS } from '../application/tools.ts'

const actor = { id: 'reader', role: 'member' as const }
const project = {
  id: 'p1',
  name: 'Onboarding',
  goal: 'Why people leave',
  team: { id: 't2', name: 'Growth' },
  version: 1,
}
const study = {
  id: 's1',
  name: 'Round one',
  type: 'interviews',
  version: 1,
  projects: [],
  goal: 'Understand waiting',
  team: { id: 't2', name: 'Growth' },
}

const reads = {
  teamsOf: async () => [],
  listProjects: async () => [],
  getProject: async () => null,
  getStudy: async () => null,
  listStudies: async () => null,
  readProject: async () => project,
  readStudy: async () => study,
  readStudies: async () => [{ id: 's1', name: 'Round one', type: 'interviews', folderName: null }],
  folderState: async () => {
    throw new Error('a reader gets no folder state')
  },
  preparation: async () => {
    throw new Error('a reader gets no schedule')
  },
  attachableStudies: async () => {
    throw new Error('a reader gets no study to attach')
  },
} as unknown as ResearchReads

describe('the assistant on another team’s page (spec 026)', () => {
  it('reads the project, says it is read only and who decides', async () => {
    const { system, readOnly } = await buildContext(
      reads,
      actor,
      { kind: 'project', id: 'p1' },
      'en',
    )
    expect(readOnly).toBe(true)
    expect(system).toContain('Why people leave')
    expect(system).toContain('team Growth decides')
    expect(system).not.toContain('attachable study id')
  })

  it('reads the study without its folder, schedule or next step', async () => {
    const { system, readOnly, guideStudy } = await buildContext(
      reads,
      actor,
      { kind: 'study', id: 's1' },
      'en',
    )
    expect(readOnly).toBe(true)
    expect(guideStudy).toBeNull()
    expect(system).toContain('Understand waiting')
    expect(system).not.toContain('Next step of this study')
    expect(system).not.toContain('Interview schedule')
  })

  it('keeps only the allowlist of tools', () => {
    const names = offeredOnReadOnlyPage(TOOLS).map((t) => t.name)
    expect(names.every((n) => READ_ONLY_TOOLS.includes(n))).toBe(true)
    for (const closed of [
      'rename_project',
      'propose_analysis',
      'list_interviews',
      'count_interviews',
      'attach_folder',
      'read_file',
      'delete_project',
      'create_project',
      'create_study',
      'load_skill',
    ])
      expect(names).not.toContain(closed)
    expect(names).toContain('open_project')
  })
})
