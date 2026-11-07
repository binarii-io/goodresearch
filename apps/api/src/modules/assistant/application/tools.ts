import { GuideDraft, QuestionnaireDraft, TestProtocolDraft } from '@goodresearch/contracts'
import { z } from 'zod'
import { GUIDE_CHECKLIST, GUIDE_POINT_STATES } from '../domain/guide-progress.ts'
import { composeGoal, type Framing, openPoints } from '../domain/project-framing.ts'
import type { ProposalKind } from '../domain/proposal.ts'
import { PROTOCOL_CHECKLIST } from '../domain/protocol-progress.ts'
import { checkQuestion } from '../domain/question-checks.ts'
import { QUESTIONNAIRE_CHECKLIST } from '../domain/questionnaire-progress.ts'
import { openStudyPoints, type StudyFraming } from '../domain/study-framing.ts'
import type { GuideStudy, ProtocolStudy, SurveyStudy } from './context.ts'
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
  // Spec 021: a project, or a team for a study in no project. Spec 027: interviews by default.
  create_study: z.object({
    name: Name,
    goal: Goal,
    type: z.enum(['interviews', 'survey', 'usability-test']).optional(),
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
  propose_questionnaire: z.object({ studyId: Id, questionnaire: QuestionnaireDraft }),
  report_questionnaire_progress: z.object({
    studyId: Id,
    ...Object.fromEntries(
      QUESTIONNAIRE_CHECKLIST.map(([key]) => [key, z.enum(GUIDE_POINT_STATES)]),
    ),
  }) as z.ZodType<{ studyId: string } & Record<string, (typeof GUIDE_POINT_STATES)[number]>>,
  check_questionnaire_items: z.object({ studyId: Id, questionnaire: QuestionnaireDraft }),
  // Spec 036: the test protocol of a usability test study.
  propose_protocol: z.object({ studyId: Id, protocol: TestProtocolDraft }),
  report_protocol_progress: z.object({
    studyId: Id,
    ...Object.fromEntries(PROTOCOL_CHECKLIST.map(([key]) => [key, z.enum(GUIDE_POINT_STATES)])),
  }) as z.ZodType<{ studyId: string } & Record<string, (typeof GUIDE_POINT_STATES)[number]>>,
  check_protocol_tasks: z.object({ studyId: Id, protocol: TestProtocolDraft }),
  // Spec 028: counts only; no tool gives an answer of a response.
  count_responses: z.object({ studyId: Id }),
  propose_opening_form: z.object({ studyId: Id }),
  propose_closing_form: z.object({ studyId: Id }),
  propose_target_rule: z.object({
    studyId: Id,
    accepted: z.record(z.string().max(64), z.array(z.string().min(1).max(600)).min(1).max(20)),
  }),
  // Spec 029: figures computed by the app, never an answer of a response.
  survey_analysis_state: z.object({ studyId: Id }),
  read_figures: z.object({ studyId: Id, crossBy: Id.nullable().optional() }),
  propose_survey_facts: z.object({
    studyId: Id,
    facts: z
      .array(
        z.object({
          itemId: Id,
          measure: z.enum(['option', 'agree', 'disagree', 'mean']),
          option: z.string().min(1).max(600).optional(),
          cross: z.object({ itemId: Id, option: z.string().min(1).max(600) }).optional(),
          polarity: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
        }),
      )
      .min(1)
      .max(10),
  }),
  propose_theme_analysis: z.object({
    studyId: Id,
    itemId: Id,
    onlyNew: z.boolean().optional(),
  }),
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
  // Spec 023: the schedule stays in the Preparation tab.
  publish_preparation: z.object({
    studyId: Id,
    kinds: z
      .array(z.enum(['guide', 'best-practices', 'questionnaire', 'protocol']))
      .min(1)
      .max(4),
  }),
  // Spec 024: there is no line to delete, trash or share, and no way to write one.
  browse_folder: z.object({ studyId: Id, folderId: Id.optional() }),
  find_files: z
    .object({
      studyId: Id,
      query: z.string().trim().min(1).max(120).optional(),
      kind: z.enum(['transcript', 'recording', 'document', 'folder']).optional(),
    })
    .refine((s) => s.query !== undefined || s.kind !== undefined),
  read_file: z.object({
    studyId: Id,
    fileId: Id,
    part: z.number().int().min(1).max(100).optional(),
  }),
  propose_folder_changes: z.object({
    studyId: Id,
    lines: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('new-folder'),
            key: z.string().min(1).max(100),
            name: z.string().min(1).max(200),
            parent: Id,
          }),
          z.object({
            kind: z.literal('rename'),
            fileId: Id,
            name: z.string().min(1).max(200),
          }),
          z.object({ kind: z.literal('move'), fileId: Id, to: Id }),
        ]),
      )
      .min(1)
      .max(200),
  }),
  folder_consent: z.object({}),
  // Spec 025.
  count_interviews: z.object({ studyId: Id }),
  list_interviews: z.object({
    studyId: Id,
    filters: z
      .array(
        z.enum([
          'to-decide',
          'no-transcript',
          'no-recording',
          'not-analysed',
          'ready',
          'validated',
          'excluded',
          'not-ready',
        ]),
      )
      .max(8)
      .optional(),
    name: z.string().trim().min(1).max(120).optional(),
    page: z.number().int().min(1).max(10).optional(),
  }),
  propose_analysis: z.object({ studyId: Id, again: z.boolean().optional() }),
  propose_accepting_suggestions: z.object({
    studyId: Id,
    items: z
      .array(
        z.object({
          interviewId: Id,
          fields: z
            .array(
              z.enum(['interviewees', 'interviewers', 'date', 'language', 'name', 'attachment']),
            )
            .max(6)
            .optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
  propose_validating_interviews: z.object({
    studyId: Id,
    items: z
      .array(z.object({ interviewId: Id }))
      .min(1)
      .max(50),
  }),
  propose_excluding_interviews: z.object({
    studyId: Id,
    items: z
      .array(z.object({ interviewId: Id, reason: z.string().trim().min(1).max(500) }))
      .min(1)
      .max(50),
  }),
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
  connect_source: z.object({}),
  load_skill: z.object({ name: z.enum(SKILL_NAMES as [string, ...string[]]) }),
  check_guide_questions: z.object({
    questions: z.array(z.string().trim().min(1).max(600)).min(1).max(60),
  }),
} satisfies Record<ProposalKind, z.ZodType>

export const TOOL_INPUTS = INPUTS

/**
 * Tools of the questionnaire design (spec 027), offered on the page of a survey study the person
 * can change, as the guide's on an interview study.
 */
export const QUESTIONNAIRE_TOOLS: readonly ToolSpec[] = [
  {
    name: 'count_responses',
    description:
      "How many responses the study's form has: total, counted, out of target, profile not answered, refused consent. Holds no answer: you never see what people answered.",
    inputSchema: INPUTS.count_responses,
  },
  {
    name: 'propose_opening_form',
    description:
      'Propose to open the published form to responses. The person confirms on a card; it is refused if the form collects identities, its consent does not end it, or it is not up to date.',
    inputSchema: INPUTS.propose_opening_form,
  },
  {
    name: 'propose_closing_form',
    description: 'Propose to close the form to responses. The person confirms on a card.',
    inputSchema: INPUTS.propose_closing_form,
  },
  {
    name: 'propose_target_rule',
    description:
      'Propose which answers of the profiling items belong to the target audience: `accepted` maps an item id of a profiling section with choices to its accepted options, word for word. A response must pass every item. The card shows how many responses it would set aside; nothing is deleted.',
    inputSchema: INPUTS.propose_target_rule,
  },
  {
    name: 'survey_analysis_state',
    description:
      "Where the survey's analysis stands, as counts: counted and set-aside responses, each open item with its answers and themes, facts by status. Holds no answer.",
    inputSchema: INPUTS.survey_analysis_state,
  },
  {
    name: 'read_figures',
    description:
      "The figures the app computed over the counted responses: per choice item each option's share of the respondents, per scale the mean, median and shares of agreement and disagreement, each with its base (small under 30). With crossBy, a profiling choice item's id, each item per answer of it. Never compute a figure yourself: cite these.",
    inputSchema: INPUTS.read_figures,
  },
  {
    name: 'propose_survey_facts',
    description:
      'Propose facts from figures of read_figures (up to 10): the item id, the measure (option with its option word for word, agree, disagree or mean), optionally the cross (profiling item id and option), and a polarity. The app writes each statement from the figure as it is today; the person applies the card, then decides each fact.',
    inputSchema: INPUTS.propose_survey_facts,
  },
  {
    name: 'propose_theme_analysis',
    description:
      "Propose to find the themes of one open item's answers (onlyNew: only the answers in no theme yet). The app masks the answers before sending them; you never receive them. The card shows the cost; the run starts only when the person applies it.",
    inputSchema: INPUTS.propose_theme_analysis,
  },
  {
    name: 'check_questionnaire_items',
    description:
      "Check a whole questionnaire against the app's writing rules: double question, negation, leading wording, absolute word, too long, a factual measure on a Likert scale, directly identifying data, inconsistent legends, a long series of closed items, no profiling item, too many open items. Returns what to review and the estimated time. Call it before proposing.",
    inputSchema: INPUTS.check_questionnaire_items,
  },
  {
    name: 'report_questionnaire_progress',
    description:
      'Record how far the design of the questionnaire is: for each of the eight points, missing, partial or done. Call it last, after your text, at the end of each answer while designing: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.report_questionnaire_progress,
  },
  {
    name: 'propose_questionnaire',
    description:
      'Propose the complete questionnaire of the study (use the Study id from the context): framing with consent and thanks, sections in order (introduction, profiling, one theme section per theme, closing) and their items. The person reviews and applies it; it replaces the current one only then.',
    inputSchema: INPUTS.propose_questionnaire,
  },
]

/**
 * Tools of the test protocol design (spec 036), offered on the page of a usability test study the
 * person can change, as the questionnaire's on a survey study.
 */
export const PROTOCOL_TOOLS: readonly ToolSpec[] = [
  {
    name: 'check_protocol_tasks',
    description:
      "Check a whole test protocol against the app's writing rules: an instruction that gives the way (names a button, a menu or steps), several tasks in one, no goal, too long; a planned length beyond the session, too many tasks, no think-aloud instructions, a consent that does not mention the recording and the AI reading. Returns what to review and the planned length the app computes. Call it before proposing.",
    inputSchema: INPUTS.check_protocol_tasks,
  },
  {
    name: 'report_protocol_progress',
    description:
      'Record how far the design of the test protocol is: for each of the nine points, missing, partial or done. Call it last, after your text, at the end of each answer while designing: it ends the answer. Changes nothing else.',
    inputSchema: INPUTS.report_protocol_progress,
  },
  {
    name: 'propose_protocol',
    description:
      "Propose the complete test protocol of the study (use the Study id from the context): framing with the tested interface and the consent, the script, the scenario, the tasks in order with their success criteria, and whether to ask the ease question after each task (easeQuestion seq-v1) and end with the System Usability Scale (questionnaire sus-v1); their texts are the app's. The person reviews and applies it; it replaces the current one only then.",
    inputSchema: INPUTS.propose_protocol,
  },
]

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
      'Propose a new study (type: interviews by default, survey for a questionnaire, or usability-test to watch people use an interface or a prototype), once every point of the framing is done and they agreed (load the skill study-framing first). Send its goal, and a project id from the context, or a team id for a study in no project. The result says whether a card was shown or why it was refused. The person confirms before anything is created.',
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
    name: 'publish_preparation',
    description:
      "Propose to create a study's interview guide and interview best practices as documents in its folder (kinds: guide, best-practices). If the person has not allowed editing, the app shows a card for that and the conversation goes on after. The result says whether a card was shown or why it was refused.",
    inputSchema: INPUTS.publish_preparation,
  },
  {
    name: 'count_interviews',
    description:
      'How many interviews of a study are in each state: to-decide (suggestions of the analysis undecided), no-transcript, no-recording, not-analysed, ready (to validate), validated, excluded. An interview can be in several. Holds no name. Call it first to answer what is left to do, instead of listing. On a usability test study it counts the test sessions, with not-ready, readyForAnalysis (validated with video, length, participant and protocol version) and videoMinutes.',
    inputSchema: INPUTS.count_interviews,
  },
  {
    name: 'list_interviews',
    description:
      "List a study's interviews, with what is left to decide on each. Prefer filters (an interview must match all of them) or a part of a name: only what is asked comes back. Without any filter it gives them all, 50 per page: use it when you need to unblock yourself. The first time, a card asks the person's consent: then wait. The result is not kept for later messages.",
    inputSchema: INPUTS.list_interviews,
  },
  {
    name: 'propose_analysis',
    description:
      'Propose to analyse the interviews not analysed yet (again: true to analyse the others again): the analysis finds who was interviewed, the date, the language and a name, as suggestions the person decides. A card shows how many and the estimated cost; it starts only when they apply. The result says whether a card was shown or why it was refused.',
    inputSchema: INPUTS.propose_analysis,
  },
  {
    name: 'propose_accepting_suggestions',
    description:
      "Show a card of the analysis's suggestions on the interviews named (ids from list_interviews), to accept: `fields` keeps only some of them (interviewees, interviewers, date, language, name, attachment); without it, all those undecided. It accepts nothing: the person unticks lines and applies, and what is unticked stays to decide. An `attachment` joins a document to the interview: it does not become its transcript.",
    inputSchema: INPUTS.propose_accepting_suggestions,
  },
  {
    name: 'propose_validating_interviews',
    description:
      'Show a card of interviews to validate (ids from list_interviews). It validates nothing: only the person does, by applying it. An interview without transcript is flagged and starts unticked. Validated interviews go on to the next phases.',
    inputSchema: INPUTS.propose_validating_interviews,
  },
  {
    name: 'propose_excluding_interviews',
    description:
      'Show a card of interviews to exclude, each with its reason, which you ask the person for if you do not have it (ids from list_interviews). It excludes nothing: only the person does, by applying it, and they can correct the reason.',
    inputSchema: INPUTS.propose_excluding_interviews,
  },
  {
    name: 'browse_folder',
    description:
      "See everything in a study's folder at once, all sub-folders included: ids, names, paths, kinds, dates and sizes (a Study id from the context). One call is enough: pass a folderId only when the result says it was cut. The first time, a card asks the person's consent: then wait. The result is not kept for later messages: call it again in a later answer when you need it.",
    inputSchema: INPUTS.browse_folder,
  },
  {
    name: 'find_files',
    description:
      "Find items anywhere in a study's folder, by a part of their name (accents and capitals do not count), or by kind: transcript, recording, document or folder. Use it first when you look for a given person or file. Gives ids, names and paths, at most 50. The first time, a card asks the person's consent: then wait.",
    inputSchema: INPUTS.find_files,
  },
  {
    name: 'read_file',
    description:
      "Read one extract of a file of the study's folder, at most 8,000 characters, from a file id given by find_files or browse_folder; `part` gives the next extracts, at most 5 reads per answer. Video and audio cannot be read. The result is not kept in the conversation.",
    inputSchema: INPUTS.read_file,
  },
  {
    name: 'propose_folder_changes',
    description:
      'Propose a batch of changes in the study\'s folder, shown on one card: new sub-folders (key, name, parent: a folder id or an earlier key), renames, moves (to: a folder id or an earlier key). The person unticks lines and applies. You cannot delete, trash or change sharing: what is not useful goes into a sub-folder named "To sort". The result says whether a card was shown or why it was refused.',
    inputSchema: INPUTS.propose_folder_changes,
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

/**
 * Spec 026 FR-020: what stays on another team's page: no action, so no card and no framing. Creating
 * is for a page of the person's own teams. New tools stay out by default.
 */
export const READ_ONLY_TOOLS: readonly string[] = ['open_project', 'open_study', 'offer_choices']

export const offeredOnReadOnlyPage = <T extends { name: string }>(tools: readonly T[]) =>
  tools.filter((t) => READ_ONLY_TOOLS.includes(t.name))

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
  const { name, goal, projectId, teamId, type } = input.data
  // Spec 027: an interview study stays described as before; spec 036 adds the usability test.
  const typed = type === 'survey' || type === 'usability-test' ? { type } : {}
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
        values: { name, goal, ...typed },
        preview: { name, goal, ...typed, projectName: project.name },
      }
    : {
        kind: 'create_study',
        targetId: null,
        targetVersion: null,
        values: { name, goal, teamId, ...typed },
        preview: { name, goal, ...typed, teamName: team?.name ?? '' },
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
    // Fieldwork comes after the guide; planning interviews blocks nothing (spec 024).
    const preparation = await research.preparation(actor.id, studyId)
    // Spec 037: a usability test's folder opens its sessions once the protocol exists.
    const protocol =
      study.type === 'usability-test' ? await research.testProtocol(actor.id, studyId) : null
    const opensOn: 'preparation' | 'fieldwork' =
      study.type === 'usability-test'
        ? protocol?.content
          ? 'fieldwork'
          : 'preparation'
        : preparation && !preparation.guide
          ? 'preparation'
          : 'fieldwork'
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
    return {
      ...base,
      kind: 'connect_source',
      preview: { studyId, studyName: study.name, access: 'read' },
    }
  return { refused: FOLDER_REFUSALS[checked.error] ?? 'Refused: this folder cannot be attached.' }
}

const PUBLICATION_REFUSALS: Record<string, string> = {
  ...FOLDER_REFUSALS,
  NO_SOURCE_FOLDER: 'Refused: this study has no folder. Offer to add the folder first.',
  GUIDE_MISSING: 'Refused: this study has no interview guide yet. Write it first.',
  QUESTIONNAIRE_NOT_FOUND: 'Refused: this study has no questionnaire yet. Write it first.',
  PROTOCOL_NOT_FOUND: 'Refused: this study has no test protocol yet. Write it first.',
  NOT_A_USABILITY_TEST_STUDY: 'Refused: only a usability test study has a test protocol.',
  NOTHING_TO_PUBLISH:
    'Refused: already published. Updates happen on the Preparation tab, which compares with the files.',
}

/**
 * Checks a publication (spec 023): a reason, the card, or the card asking for the right to edit.
 * The same checks run again on Apply, through the command.
 */
export const preparePublication = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
  language: 'en' | 'fr',
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.publish_preparation.safeParse(rawInput)
  if (!input.success)
    return {
      refused:
        'Refused: send a studyId, and kinds among guide, best-practices, questionnaire and protocol (which brings its participant sheet).',
    }
  const { studyId, kinds } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: PUBLICATION_REFUSALS.STUDY_NOT_FOUND ?? '' }
  const checked = await research.checkPublication({ actor, studyId, kinds })
  const base = { targetId: studyId, targetVersion: null }
  if (checked.ok) {
    const folder = await research.folderState(actor, studyId)
    return {
      ...base,
      kind: 'publish_preparation',
      values: { kinds: checked.kinds, language },
      preview: {
        studyId,
        studyName: study.name,
        documents: checked.kinds,
        ...(folder ? { folderName: folder.name } : {}),
      },
    }
  }
  if (checked.error === 'DRIVE_WRITE_REQUIRED' || checked.error === 'DRIVE_NOT_CONNECTED')
    return {
      ...base,
      kind: 'connect_source',
      values: { kinds },
      preview: { studyId, studyName: study.name, access: 'write' },
    }
  return {
    refused: PUBLICATION_REFUSALS[checked.error] ?? 'Refused: these documents cannot be published.',
  }
}

/** Spec 024: why the assistant cannot work in the folder, in words the model can pass on. */
const FOLDER_WORK_REFUSALS: Record<string, string> = {
  ...FOLDER_REFUSALS,
  NOTHING_TO_DECIDE: 'Refused: there is nothing left to decide on these interviews.',
  REASON_REQUIRED: 'Refused: an exclusion needs its reason. Ask the person.',
  INTERVIEW_NOT_FOUND: 'Refused: use interview ids given by list_interviews.',
  NOTHING_TO_ANALYZE: 'Refused: there is nothing left to analyse.',
  ANALYSIS_RUNNING: 'Refused: an analysis is already running. Wait for its end.',
  NOT_AN_INTERVIEW_STUDY: 'Refused: this is not an interview study.',
  NO_SOURCE_FOLDER: 'Refused: this study has no folder. Offer to add it first.',
  STUDY_ANONYMISED:
    'Refused: this study is set to anonymise names, so its file names and content are not sent to you. Only counts are available.',
  OUTSIDE_FOLDER:
    "Refused: use only items of the study's folder, with ids from find_files or browse_folder.",
  UNREADABLE: 'Refused: this file cannot be read here, such as a video or an audio file.',
  FILE_GONE: 'Refused: this file no longer exists, or the person cannot open it. Look again.',
  NAME_CLASH: 'Refused: two items would have the same name in the same folder. Change one.',
  INVALID_CHANGES:
    'Refused: check the lines: 1 to 200, names without a slash, keys declared before they are used and not used as files, destinations that are folders, and no folder moved inside itself.',
  DRIVE_NOT_CONNECTED:
    "Refused: the person's file source is not connected. They can connect it from the Fieldwork tab.",
}

export const folderWorkRefusal = (code: string): string =>
  FOLDER_WORK_REFUSALS[code] ?? 'Refused: this cannot be done in the folder.'

const CARD_KINDS = {
  propose_accepting_suggestions: 'suggestions',
  propose_validating_interviews: 'validate',
  propose_excluding_interviews: 'exclude',
} as const

/** Spec 025: a card on interviews, built by the app, or the reason. */
export const prepareInterviewCard = async (
  research: ResearchReads,
  actor: Actor,
  name: keyof typeof CARD_KINDS,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS[name].safeParse(rawInput)
  if (!input.success)
    return { refused: 'Refused: send a studyId and items with interview ids from list_interviews.' }
  const { studyId, items } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: folderWorkRefusal('STUDY_NOT_FOUND') }
  const prepared = await research.prepareInterviewCard(actor, studyId, CARD_KINDS[name], items)
  if (!prepared.ok) return { refused: folderWorkRefusal(prepared.error) }
  return {
    kind: name,
    targetId: studyId,
    targetVersion: null,
    values: { lines: prepared.lines },
    preview: {
      studyId,
      studyName: study.name,
      interviewLines: prepared.lines.map(({ version: _version, ...line }) => line),
    },
  }
}

/** Spec 029: the card of a theme analysis of an open item, or the reason. */
export const prepareThemeAnalysis = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.propose_theme_analysis.safeParse(rawInput)
  if (!input.success)
    return { refused: 'Refused: send the studyId and the itemId of an open item.' }
  const { studyId, itemId, onlyNew = false } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: folderWorkRefusal('STUDY_NOT_FOUND') }
  const estimate = await research.themesEstimate(actor, studyId, itemId, onlyNew)
  if (!estimate.ok)
    return {
      refused:
        estimate.error === 'TOO_FEW_ANSWERS'
          ? 'Refused: fewer than 5 counted answers to theme.'
          : estimate.error === 'ITEM_NOT_FOUND'
            ? 'Refused: not an open item of this questionnaire.'
            : folderWorkRefusal(estimate.error),
    }
  if (!estimate.aiConnected)
    return {
      refused: 'Refused: the person has no AI provider connected. They can add one in the app.',
    }
  return {
    kind: 'propose_theme_analysis',
    targetId: studyId,
    targetVersion: null,
    values: { itemId, onlyNew },
    preview: {
      studyId,
      studyName: study.name,
      openItem: { text: estimate.text, answers: estimate.answers, parts: estimate.parts },
      estimatedCost: estimate.cost,
      provider: (await research.aiProvider(actor.id)) ?? '',
    },
  }
}

/** Spec 025: the card of an analysis, or the reason. */
export const prepareAnalysis = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.propose_analysis.safeParse(rawInput)
  if (!input.success) return { refused: 'Refused: send a studyId.' }
  const { studyId, again = false } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: folderWorkRefusal('STUDY_NOT_FOUND') }
  const estimate = await research.analysisEstimate(actor, studyId, again)
  if (!estimate.ok) return { refused: folderWorkRefusal(estimate.error) }
  if (estimate.running) return { refused: folderWorkRefusal('ANALYSIS_RUNNING') }
  if (!estimate.aiConnected)
    return {
      refused: 'Refused: the person has no AI provider connected. They can add one in the app.',
    }
  if (estimate.count === 0) return { refused: folderWorkRefusal('NOTHING_TO_ANALYZE') }
  return {
    kind: 'propose_analysis',
    targetId: studyId,
    targetVersion: null,
    values: { again },
    preview: {
      studyId,
      studyName: study.name,
      interviews: estimate.count,
      estimatedCost: estimate.estimatedCost,
      consentNeeded: estimate.consentNeeded,
      provider: (await research.aiProvider(actor.id)) ?? '',
    },
  }
}

/** Spec 024: the card of a batch, its connection card, or the reason. */
export const prepareFolderChanges = async (
  research: ResearchReads,
  actor: Actor,
  rawInput: unknown,
): Promise<{ refused: string } | PreparedProposal> => {
  const input = INPUTS.propose_folder_changes.safeParse(rawInput)
  if (!input.success)
    return { refused: 'Refused: send a studyId and lines of kind new-folder, rename or move.' }
  const { studyId, lines } = input.data
  const study = await research.getStudy(actor.id, studyId)
  if (!study) return { refused: folderWorkRefusal('STUDY_NOT_FOUND') }
  const checked = await research.checkFolderChanges(actor, studyId, lines)
  const base = { targetId: studyId, targetVersion: null, values: { lines } }
  if (checked.ok)
    return {
      ...base,
      kind: 'propose_folder_changes',
      preview: { studyId, studyName: study.name, lines: checked.lines },
    }
  if (checked.error === 'DRIVE_WRITE_REQUIRED' || checked.error === 'DRIVE_NOT_CONNECTED')
    return {
      ...base,
      kind: 'connect_source',
      preview: { studyId, studyName: study.name, access: 'write' },
    }
  return { refused: folderWorkRefusal(checked.error) }
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
  surveyStudy: SurveyStudy | null = null,
  protocolStudy: ProtocolStudy | null = null,
): Promise<PreparedProposal | null> => {
  switch (call.name) {
    case 'propose_protocol': {
      const input = INPUTS.propose_protocol.safeParse(call.input)
      // The page's study, as the context just loaded it with the person's access.
      if (!input.success || !protocolStudy || input.data.studyId !== protocolStudy.id) return null
      const protocol = input.data.protocol
      return {
        kind: 'propose_protocol',
        targetId: protocolStudy.id,
        targetVersion: protocolStudy.version,
        values: { protocol },
        preview: {
          studyName: protocolStudy.name,
          protocol,
          replacesProtocol: protocolStudy.version !== null,
          taskChecks: research.checkTestProtocol(protocol),
        },
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
      const project = await research.readProject(actor.id, input.data.projectId)
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
      const study = await research.readStudy(actor.id, input.data.studyId)
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
    case 'propose_opening_form':
    case 'propose_closing_form': {
      const input = INPUTS[call.name].safeParse(call.input)
      if (!input.success || input.data.studyId !== surveyStudy?.id || !surveyStudy.publicationId)
        return null
      return {
        kind: call.name,
        targetId: surveyStudy.id,
        targetVersion: null,
        values: { publicationId: surveyStudy.publicationId },
        preview: { studyName: surveyStudy.name },
      }
    }
    case 'propose_survey_facts': {
      const input = INPUTS.propose_survey_facts.safeParse(call.input)
      if (!input.success || input.data.studyId !== surveyStudy?.id) return null
      const values = await research.surveyFigureValues(actor.id, surveyStudy.id, input.data.facts)
      // A figure that does not exist is left out: the card shows only what the app computed.
      const kept = input.data.facts.flatMap((f, i) => {
        const v = values[i]
        return v ? [{ f, v }] : []
      })
      if (kept.length === 0) return null
      return {
        kind: 'propose_survey_facts',
        targetId: surveyStudy.id,
        targetVersion: null,
        values: { facts: kept.map((k) => k.f) },
        preview: {
          studyName: surveyStudy.name,
          surveyFacts: kept.map(({ f, v }) => ({
            item: v.item,
            figure:
              f.measure === 'option'
                ? `${f.option ?? ''}: ${v.value} %`
                : f.measure === 'mean'
                  ? `mean ${v.value}`
                  : `${f.measure} ${v.value} %`,
            base: v.base,
            smallBase: v.smallBase,
            cross: v.cross,
            polarity: f.polarity,
          })),
        },
      }
    }
    case 'propose_target_rule': {
      const input = INPUTS.propose_target_rule.safeParse(call.input)
      if (!input.success || input.data.studyId !== surveyStudy?.id) return null
      const preview = await research.previewTargetRule(
        actor.id,
        surveyStudy.id,
        input.data.accepted,
      )
      if (!preview) return null
      return {
        kind: 'propose_target_rule',
        targetId: surveyStudy.id,
        targetVersion: surveyStudy.ruleVersion,
        values: { accepted: input.data.accepted },
        preview: { studyName: surveyStudy.name, targetRule: preview },
      }
    }
    case 'propose_questionnaire': {
      const input = INPUTS.propose_questionnaire.safeParse(call.input)
      if (!input.success || !surveyStudy || input.data.studyId !== surveyStudy.id) return null
      const questionnaire = input.data.questionnaire
      return {
        kind: 'propose_questionnaire',
        targetId: surveyStudy.id,
        targetVersion: surveyStudy.version,
        values: { questionnaire },
        preview: {
          studyName: surveyStudy.name,
          questionnaire,
          replacesQuestionnaire: surveyStudy.version !== null,
          itemChecks: research.checkQuestionnaire(questionnaire),
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
