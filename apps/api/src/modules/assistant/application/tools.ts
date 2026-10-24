import { z } from 'zod'
import type { ProposalKind } from '../domain/proposal.ts'
import type { Actor, ProposalPreview, ResearchReads, ToolSpec } from './ports.ts'

const Name = z.string().trim().min(1).max(120)
const Goal = z.string().trim().max(10_000)
const Id = z.string().min(1).max(100)

const INPUTS = {
  create_project: z.object({ name: Name, teamId: Id, goal: Goal.default('') }),
  update_project_goal: z.object({ projectId: Id, goal: Goal.min(1) }),
  rename_project: z.object({ projectId: Id, name: Name }),
  create_study: z.object({ projectId: Id, name: Name }),
  rename_study: z.object({ studyId: Id, name: Name }),
  open_project: z.object({ projectId: Id }),
  open_study: z.object({
    studyId: Id,
    phase: z.enum(['preparation', 'fieldwork', 'analysis']).optional(),
  }),
} satisfies Record<ProposalKind, z.ZodType>

/**
 * The tools the model may call (spec 005 US3). They have no execution: a call becomes a proposal
 * card, applied only on the person's explicit Apply (constitution IV, research R2).
 */
export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'create_project',
    description:
      'Propose a new research project to the person. Use a team id from the context. The person confirms before anything is created.',
    inputSchema: INPUTS.create_project,
  },
  {
    name: 'update_project_goal',
    description:
      'Propose a new research goal for a project (question, objectives, hypotheses). Replaces the current goal once the person confirms.',
    inputSchema: INPUTS.update_project_goal,
  },
  {
    name: 'rename_project',
    description: 'Propose a new name for a project. The person confirms before it changes.',
    inputSchema: INPUTS.rename_project,
  },
  {
    name: 'create_study',
    description:
      'Propose a new interview study in a project. The person confirms before it is created.',
    inputSchema: INPUTS.create_study,
  },
  {
    name: 'rename_study',
    description: 'Propose a new name for a study. The person confirms before it changes.',
    inputSchema: INPUTS.rename_study,
  },
  {
    name: 'open_project',
    description:
      'Open the page of a project for the person (use a project id from the context). Changes nothing; happens at once.',
    inputSchema: INPUTS.open_project,
  },
  {
    name: 'open_study',
    description:
      'Open the page of a study for the person (use a study id from the context), optionally on one of its tabs: preparation, fieldwork or analysis. Also use it to switch tabs on the study already open. Changes nothing; happens at once.',
    inputSchema: INPUTS.open_study,
  },
]

export type PreparedProposal = {
  kind: ProposalKind
  targetId: string | null
  targetVersion: number | null
  values: Record<string, unknown>
  preview: ProposalPreview
}

/**
 * Validates a tool call like the app's forms, and only on objects the person can see (FR-006).
 * `null`: invalid values or an object out of reach; never shown, told to the model.
 */
export const prepareProposal = async (
  research: ResearchReads,
  actor: Actor,
  call: { name: string; input: unknown },
): Promise<PreparedProposal | null> => {
  switch (call.name) {
    case 'create_project': {
      const input = INPUTS.create_project.safeParse(call.input)
      if (!input.success) return null
      const team = (await research.teamsOf(actor.id)).find((t) => t.id === input.data.teamId)
      if (!team) return null
      return {
        kind: 'create_project',
        targetId: null,
        targetVersion: null,
        values: input.data,
        preview: { name: input.data.name, teamName: team.name, goal: input.data.goal },
      }
    }
    case 'update_project_goal':
    case 'rename_project': {
      const parsed =
        call.name === 'rename_project'
          ? INPUTS.rename_project.safeParse(call.input)
          : INPUTS.update_project_goal.safeParse(call.input)
      if (!parsed.success) return null
      const project = await research.getProject(actor.id, parsed.data.projectId)
      if (!project) return null
      return 'goal' in parsed.data
        ? {
            kind: 'update_project_goal',
            targetId: project.id,
            targetVersion: project.version,
            values: { goal: parsed.data.goal },
            preview: {
              projectName: project.name,
              goal: parsed.data.goal,
              previousGoal: project.goal,
            },
          }
        : {
            kind: 'rename_project',
            targetId: project.id,
            targetVersion: project.version,
            values: { name: parsed.data.name },
            preview: { name: parsed.data.name, previousName: project.name },
          }
    }
    case 'create_study': {
      const input = INPUTS.create_study.safeParse(call.input)
      if (!input.success) return null
      const project = await research.getProject(actor.id, input.data.projectId)
      if (!project) return null
      return {
        kind: 'create_study',
        targetId: project.id,
        targetVersion: null,
        values: { name: input.data.name },
        preview: { projectName: project.name, name: input.data.name },
      }
    }
    case 'rename_study': {
      const input = INPUTS.rename_study.safeParse(call.input)
      if (!input.success) return null
      const study = await research.getStudy(actor.id, input.data.studyId)
      if (!study) return null
      return {
        kind: 'rename_study',
        targetId: study.id,
        targetVersion: study.version,
        values: { name: input.data.name },
        preview: {
          projectName: study.project.name,
          name: input.data.name,
          previousName: study.name,
        },
      }
    }
    case 'open_project': {
      const input = INPUTS.open_project.safeParse(call.input)
      if (!input.success) return null
      const project = await research.getProject(actor.id, input.data.projectId)
      if (!project) return null
      return {
        kind: 'open_project',
        targetId: project.id,
        targetVersion: null,
        values: {},
        preview: { projectName: project.name },
      }
    }
    case 'open_study': {
      const input = INPUTS.open_study.safeParse(call.input)
      if (!input.success) return null
      const study = await research.getStudy(actor.id, input.data.studyId)
      if (!study) return null
      return {
        kind: 'open_study',
        targetId: study.id,
        targetVersion: null,
        values: {},
        preview: {
          projectName: study.project.name,
          name: study.name,
          ...(input.data.phase ? { phase: input.data.phase } : {}),
        },
      }
    }
    default:
      return null
  }
}
