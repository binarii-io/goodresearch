import { GuideDraft } from '@goodresearch/contracts'
import { z } from 'zod'
import { GUIDE_CHECKLIST, GUIDE_POINT_STATES } from '../domain/guide-progress.ts'
import type { ProposalKind } from '../domain/proposal.ts'
import { checkQuestion } from '../domain/question-checks.ts'
import type { GuideStudy } from './context.ts'
import type { Actor, ProposalPreview, ResearchReads, ToolSpec } from './ports.ts'
import { SKILL_NAMES } from './skills.ts'

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
    phase: z.enum(['preparation', 'fieldwork', 'enrichment', 'analysis']).optional(),
  }),
  propose_interview_guide: z.object({ studyId: Id, guide: GuideDraft }),
  report_guide_progress: z.object({
    studyId: Id,
    ...Object.fromEntries(GUIDE_CHECKLIST.map(([key]) => [key, z.enum(GUIDE_POINT_STATES)])),
  }) as z.ZodType<{ studyId: string } & Record<string, (typeof GUIDE_POINT_STATES)[number]>>,
  load_skill: z.object({ name: z.enum(SKILL_NAMES as [string, ...string[]]) }),
  check_guide_questions: z.object({
    questions: z.array(z.string().trim().min(1).max(600)).min(1).max(60),
  }),
} satisfies Record<ProposalKind, z.ZodType>

export const TOOL_INPUTS = INPUTS

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
      'Open the page of a study for the person (use a study id from the context), optionally on one of its tabs: preparation, fieldwork, enrichment or analysis. Also use it to switch tabs on the study already open. Changes nothing; happens at once.',
    inputSchema: INPUTS.open_study,
  },
]

/**
 * Tools of the interview guide design (spec 006), offered on the page of an interview study the
 * person can act on. The use case adds the `run` of `load_skill` and `check_guide_questions` (it
 * needs the answer); `report_guide_progress` is recorded when called and ends the answer.
 */
export const GUIDE_TOOLS: readonly ToolSpec[] = [
  {
    name: 'load_skill',
    description:
      'Load the instructions of a skill listed in the context, before doing what it covers (for example before designing or changing an interview guide). Returns the instructions.',
    inputSchema: INPUTS.load_skill,
  },
  {
    name: 'check_guide_questions',
    description:
      "Check interview questions against the app's writing rules (closed, leading, hypothetical, about the future, asking for a solution, double, too long). Returns what to review for each question. Call it before proposing a guide.",
    inputSchema: INPUTS.check_guide_questions,
  },
  {
    name: 'report_guide_progress',
    description:
      'Record how far the design of the study interview guide is: for each of the eight points, missing, partial or done. Call it last, after your text, at the end of each answer while designing a guide: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.report_guide_progress,
  },
  {
    name: 'propose_interview_guide',
    description:
      'Propose the complete interview guide of the study (use the Study id from the context): framing and sections in order (introduction, warm-up, one theme section per research theme, wrap-up), main questions with follow-ups. The person reviews and applies it; it replaces the current guide only then.',
    inputSchema: INPUTS.propose_interview_guide,
  },
]

/** What the writing rules flag in each question; empty lists are kept out. */
export const checksOf = (questions: readonly string[]) =>
  questions.map((question) => ({ question, issues: checkQuestion(question) }))

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
  /** The interview study of the page, the only one a guide may be proposed for (FR-006). */
  guideStudy: GuideStudy | null = null,
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
    case 'propose_interview_guide': {
      const input = INPUTS.propose_interview_guide.safeParse(call.input)
      // The page's study, as the context just loaded it with the person's access: no new lookups.
      if (!input.success || !guideStudy || input.data.studyId !== guideStudy.id) return null
      const guide = input.data.guide
      return {
        kind: 'propose_interview_guide',
        targetId: guideStudy.id,
        targetVersion: guideStudy.guideVersion,
        values: { guide },
        preview: {
          studyName: guideStudy.name,
          guide,
          replacesGuide: guideStudy.guideVersion !== null,
          checks: checksOf(guide.sections.flatMap((s) => s.questions.map((q) => q.text))).filter(
            (c) => c.issues.length > 0,
          ),
        },
      }
    }
    default:
      return null
  }
}
