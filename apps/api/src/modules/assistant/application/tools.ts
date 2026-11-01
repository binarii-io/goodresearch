import { GuideDraft } from '@goodresearch/contracts'
import { z } from 'zod'
import { GUIDE_CHECKLIST, GUIDE_POINT_STATES } from '../domain/guide-progress.ts'
import { composeGoal, type Framing, openPoints } from '../domain/project-framing.ts'
import type { ProposalKind } from '../domain/proposal.ts'
import { checkQuestion } from '../domain/question-checks.ts'
import { openStudyPoints, type StudyFraming } from '../domain/study-framing.ts'
import type { GuideStudy } from './context.ts'
import type { Actor, ProposalPreview, ResearchReads, ToolSpec } from './ports.ts'
import { SKILL_NAMES } from './skills.ts'

const Name = z.string().trim().min(1).max(120)
const Goal = z.string().trim().max(10_000)
const Id = z.string().min(1).max(100)

const INPUTS = {
  create_project: z.object({
    name: Name,
    teamId: Id,
    question: Goal,
    objectives: Goal,
    hypotheses: Goal.default(''),
  }),
  update_project_goal: z.object({ projectId: Id, goal: Goal.min(1) }),
  rename_project: z.object({ projectId: Id, name: Name }),
  // Spec 021: a project, or a team for a study in no project.
  create_study: z.object({
    name: Name,
    goal: Goal,
    projectId: Id.optional(),
    teamId: Id.optional(),
  }),
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
  report_project_progress: z.object({
    question: z.enum(GUIDE_POINT_STATES),
    audience: z.enum(GUIDE_POINT_STATES),
    decision: z.enum(GUIDE_POINT_STATES),
    hypotheses: z.enum(GUIDE_POINT_STATES),
    team: z.enum(GUIDE_POINT_STATES),
  }),
  report_study_progress: z.object({
    reuse: z.enum(GUIDE_POINT_STATES),
    goal: z.enum(GUIDE_POINT_STATES),
    place: z.enum(GUIDE_POINT_STATES),
  }),
  // Spec 020: never the name, which only the person types, on the card.
  delete_project: z.object({ projectId: Id }),
  attach_study: z.object({ studyId: Id, projectId: Id }),
  detach_study: z.object({ studyId: Id, projectId: Id }),
  update_study_goal: z.object({ studyId: Id, goal: Goal }),
  attach_folder: z.object({ studyId: Id, link: z.string().trim().min(1).max(2000) }),
  offer_choices: z.object({
    question: z.string().trim().min(1).max(300),
    choices: z
      .array(z.string().trim().min(1).max(120))
      .min(2)
      .max(6)
      .refine((c) => new Set(c).size === c.length),
    multiple: z.boolean().default(false),
  }),
  // Spec 022: never called by the model; what attach_folder becomes without a connection.
  connect_source: z.object({ link: z.string() }),
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
      'Propose a new research project to the person, once every point of the framing is done and they agreed (load the skill project-framing first). Use a team id from the context. Empty hypotheses mean the person has none yet. The result says whether a card was shown or why it was refused. The person confirms before anything is created.',
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
      'Propose a new interview study, once every point of the framing is done and they agreed (load the skill study-framing first). Send its goal, and a project id from the context, or a team id for a study in no project. The result says whether a card was shown or why it was refused. The person confirms before anything is created.',
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
  {
    name: 'delete_project',
    description:
      "Propose to delete a project for good, only when the person asks for it. It shows a card on which the person types the project's name: never ask for the name in the conversation, you cannot provide it. Studies stay. The result says whether a card was shown or why it was refused.",
    inputSchema: INPUTS.delete_project,
  },
  {
    name: 'attach_study',
    description:
      'Propose to reuse an existing study of the team in a project: its interviews and facts then feed the project, without any AI call, and it stays in its other projects. Use the attachable study ids of the context. The result says whether a card was shown or why it was refused.',
    inputSchema: INPUTS.attach_study,
  },
  {
    name: 'detach_study',
    description:
      "Propose to remove a study from a project. Nothing of the study is deleted: it stays in its other projects, or on the team's Studies page. The result says whether a card was shown or why it was refused.",
    inputSchema: INPUTS.detach_study,
  },
  {
    name: 'update_study_goal',
    description:
      "Propose a new research goal for a study, read by its AI steps. Facts already found do not change, and the project's own goal stays. The result says whether a card was shown or why it was refused.",
    inputSchema: INPUTS.update_study_goal,
  },
  {
    name: 'attach_folder',
    description:
      "Propose the folder holding a study's interviews, from the link the person gave; ask for the link if you do not have it. If their file source is not connected, the app shows a card to connect it and the conversation goes on after. Never replaces a folder. The result says whether a card was shown or why it was refused.",
    inputSchema: INPUTS.attach_folder,
  },
  {
    name: 'offer_choices',
    description:
      'Show a list the person can select from, when a few clear options exist: 2 to 6 different short choices, one or several (multiple). Their selection comes as their next message, and they can also write freely. Call it last, after your text: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.offer_choices,
  },
  {
    name: 'load_skill',
    description:
      'Load the instructions of a skill listed in the context, before doing what it covers (for example before framing a new project, or before designing or changing an interview guide). Returns the instructions.',
    inputSchema: INPUTS.load_skill,
  },
  {
    name: 'report_project_progress',
    description:
      'Record how far the framing of a new project is: for each of the five points, missing, partial or done. Call it last, after your text, at the end of each answer while framing a project: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.report_project_progress,
  },
  {
    name: 'report_study_progress',
    description:
      'Record how far the framing of a new study is: for each of the three points, missing, partial or done. Call it last, after your text, at the end of each answer while framing a study: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.report_study_progress,
  },
]

/**
 * Tools of the interview guide design (spec 006), offered on the page of an interview study the
 * person can act on. The use case adds the `run` of the tools run during the answer (it needs the
 * answer); `report_guide_progress` is recorded when called and ends the answer.
 */
export const GUIDE_TOOLS: readonly ToolSpec[] = [
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
 * Checks a project proposal (spec 018): a reason to give back to the model, or the card. The goal
 * is composed here and stored as before, so applying a card does not change. Reasons name points
 * and fields only.
 */
export const prepareProject = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
  framing: Framing | null,
  language: 'en' | 'fr',
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.create_project.safeParse(rawInput)
  if (!input.success)
    return { refused: 'Refused: send name, teamId, question, objectives and hypotheses.' }
  const { question, objectives, hypotheses, name, teamId } = input.data
  if (!question || !objectives)
    return { refused: 'Refused: question and objectives must not be empty.' }
  const team = (await research.teamsOf(actor.id)).find((t) => t.id === teamId)
  if (!team) return { refused: 'Refused: use a team id listed in the context.' }
  const open = openPoints(framing)
  if (open.length > 0)
    return {
      refused: `Refused: ${open.join(', ')} not done. Ask the person, report the progress, and propose only once every point is done.`,
    }
  const goal = composeGoal({ question, objectives, hypotheses }, language)
  const valid = Goal.safeParse(goal)
  if (!valid.success) return { refused: 'Refused: the goal is too long.' }
  return {
    kind: 'create_project',
    targetId: null,
    targetVersion: null,
    values: { ...input.data, goal },
    preview: { name, teamName: team.name, goal },
  }
}

/**
 * Checks a study proposal (spec 021): a reason to give back to the model, or the card. The project
 * or team is checked again on Apply, through the command.
 */
export const prepareStudy = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
  framing: StudyFraming | null,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.create_study.safeParse(rawInput)
  if (!input.success)
    return {
      refused:
        'Refused: send a name of 1 to 120 characters, a goal of at most 10,000 characters, and a projectId or teamId as text, leaving the other one out.',
    }
  const { name, goal, projectId, teamId } = input.data
  if (Boolean(projectId) === Boolean(teamId))
    return { refused: 'Refused: send a projectId, or a teamId for a study in no project.' }
  const project = projectId ? await research.getProject(actor.id, projectId) : null
  if (projectId && !project) return { refused: 'Refused: use a project id listed in the context.' }
  const team = teamId ? (await research.teamsOf(actor.id)).find((t) => t.id === teamId) : null
  if (teamId && !team) return { refused: 'Refused: use a team id listed in the context.' }
  if (!goal) return { refused: 'Refused: the goal must not be empty.' }
  const open = openStudyPoints(framing)
  if (open.length > 0)
    return {
      refused: `Refused: ${open.join(', ')} not done. Ask the person, report the progress, and propose only once every point is done.`,
    }
  return project
    ? {
        kind: 'create_study',
        targetId: project.id,
        targetVersion: null,
        values: { name, goal },
        preview: { name, goal, projectName: project.name },
      }
    : {
        kind: 'create_study',
        targetId: null,
        targetVersion: null,
        values: { name, goal, teamId },
        preview: { name, goal, teamName: team?.name ?? '' },
      }
}

/** Spec 022: why a folder cannot be proposed, in words the model can pass on. */
const FOLDER_REFUSALS: Record<string, string> = {
  STUDY_NOT_FOUND: 'Refused: use a study id listed in the context.',
  NOT_A_DRIVE_FOLDER_LINK: 'Refused: this link is not a link to a folder.',
  FOLDER_NOT_FOUND: 'Refused: this folder does not exist, or the person cannot open it.',
  FOLDER_ALREADY_ATTACHED:
    'Refused: this study already has a folder. Replacing it happens on the Fieldwork tab, which says what it discards.',
  FOLDER_ACCESS_REQUIRED: 'Refused: the person has no access to the folder of this study.',
  DRIVE_NOT_CONFIGURED: 'Refused: no file source is configured on this instance.',
  DRIVE_UNAVAILABLE: 'Refused: the file source did not answer. Try again in a moment.',
  INVENTORY_RUNNING: 'Refused: wait for the inventory in progress to finish.',
}

/**
 * Checks a folder proposal (spec 022): a reason, the folder's card, or, without a connection, the
 * card leading to it. The same checks run again on Apply, through the command.
 */
export const prepareFolder = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.attach_folder.safeParse(rawInput)
  if (!input.success) return { refused: 'Refused: send a studyId and the link of the folder.' }
  const { studyId, link } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: FOLDER_REFUSALS.STUDY_NOT_FOUND ?? '' }
  const checked = await research.checkFolder({ actor, studyId, link })
  const base = { targetId: studyId, targetVersion: null, values: { link } }
  if (checked.ok) {
    // Fieldwork comes after the preparation: a guide, and at least one planned interview.
    const preparation = await research.preparation(actor.id, studyId)
    const planned = Object.entries(preparation?.schedule ?? {})
      .filter(([status]) => status !== 'cancelled')
      .reduce((sum, [, n]) => sum + (n ?? 0), 0)
    const opensOn: 'preparation' | 'fieldwork' =
      preparation && (!preparation.guide || planned === 0) ? 'preparation' : 'fieldwork'
    return {
      ...base,
      kind: 'attach_folder',
      preview: {
        opensOn,
        studyId,
        studyName: study.name,
        folderName: checked.folderName,
        ...(checked.folderOwner ? { folderOwner: checked.folderOwner } : {}),
      },
    }
  }
  if (checked.error === 'DRIVE_NOT_CONNECTED')
    return { ...base, kind: 'connect_source', preview: { studyId, studyName: study.name } }
  return { refused: FOLDER_REFUSALS[checked.error] ?? 'Refused: this folder cannot be attached.' }
}

/** Spec 020: the card of a deletion, or the reason given back to the model. */
export const prepareDeletion = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.delete_project.safeParse(rawInput)
  if (!input.success) return { refused: 'Refused: send a projectId.' }
  const project = await research.getProject(actor.id, input.data.projectId)
  if (!project) return { refused: 'Refused: use a project id listed in the context.' }
  const deletion = await research.projectDeletion(actor.id, project.id)
  if (!deletion)
    return { refused: "Refused: only an administrator or the project's creator can delete it." }
  if (await research.projectRunning(project.id))
    return { refused: 'Refused: wait for the run in progress on this project to finish.' }
  return {
    kind: 'delete_project',
    targetId: project.id,
    targetVersion: null,
    values: {},
    preview: { projectId: project.id, projectName: project.name, deletion },
  }
}

/**
 * Checks a change of a study's links or goal (spec 019): the reason to give back to the model, or
 * the card. The same checks run again on Apply, through the command.
 */
export const prepareStudyChange = async (
  research: ResearchReads,
  actor: Actor,
  call: { name: string; input: unknown },
): Promise<{ refused: string } | PreparedProposal> => {
  if (call.name === 'update_study_goal') {
    const input = INPUTS.update_study_goal.safeParse(call.input)
    if (!input.success)
      return { refused: 'Refused: send a studyId and a goal of at most 10,000 characters.' }
    const study = await research.getStudy(actor.id, input.data.studyId)
    if (!study) return { refused: 'Refused: use a study id listed in the context.' }
    if (!(await research.canActOnStudy(actor.id, study.id)))
      return { refused: 'Refused: the person has no access to the folder of this study.' }
    return {
      kind: 'update_study_goal',
      targetId: study.id,
      targetVersion: study.version,
      values: { goal: input.data.goal },
      preview: { studyName: study.name, goal: input.data.goal, previousGoal: study.goal },
    }
  }
  const kind = call.name === 'attach_study' ? 'attach_study' : 'detach_study'
  const input = INPUTS[kind].safeParse(call.input)
  if (!input.success) return { refused: 'Refused: send a studyId and a projectId.' }
  const study = await research.getStudy(actor.id, input.data.studyId)
  if (!study) return { refused: 'Refused: use a study id listed in the context.' }
  const project = await research.getProject(actor.id, input.data.projectId)
  if (!project) return { refused: 'Refused: use a project id listed in the context.' }
  const linked = study.projects.some((p) => p.id === project.id)
  if (kind === 'attach_study') {
    if (linked) return { refused: 'Refused: this study is already in this project.' }
    if (!(await research.canActOnStudy(actor.id, study.id)))
      return { refused: 'Refused: the person has no access to the folder of this study.' }
    if (!(await research.studyInTeam(actor.id, study.id, project.team.id)))
      return { refused: 'Refused: this study belongs to another team.' }
  } else {
    if (!linked) return { refused: 'Refused: this study is not in this project.' }
    if (await research.projectRunning(project.id))
      return { refused: 'Refused: wait for the run in progress on this project to finish.' }
  }
  return {
    kind,
    targetId: study.id,
    targetVersion: null,
    values: { projectId: project.id },
    preview: {
      studyName: study.name,
      projectName: project.name,
      otherProjects: study.projects.filter((p) => p.id !== project.id).map((p) => p.name),
    },
  }
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
          projectName: study.projects[0]?.name ?? '',
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
          projectName: study.projects[0]?.name ?? '',
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
