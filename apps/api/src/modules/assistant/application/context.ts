import {
  type NextStep,
  nextStep,
  type SurveyNextStep,
  surveyNextStep,
  type UsabilityNextStep,
  usabilityNextStep,
} from '../domain/next-step.ts'
import type { Actor, PageRef, ResearchReads } from './ports.ts'
import { SKILL_NAMES, SKILLS, type SkillName } from './skills.ts'

const REUSABLE_LIMIT = 30

/** How the model reads a study's next step (spec 023). */
const NEXT_STEPS: Record<NextStep, string> = {
  'write-guide': 'write its interview guide',
  'add-folder': 'add the folder holding its interviews',
  analyse: 'analyse the interviews not analysed yet',
  decide: 'decide the suggestions of the analysis on its interviews',
  validate: 'validate the interviews that are ready',
  'next-phase': 'go on to the next phase, the interviews being decided',
  publish: 'publish its interview guide and the best practices to its folder',
  fieldwork: 'run the interviews in the Fieldwork tab',
}

/** Spec 027. */
const SURVEY_NEXT_STEPS: Record<SurveyNextStep, string> = {
  'write-questionnaire': 'write its questionnaire',
  'add-folder': 'add the folder that will hold its form',
  'publish-questionnaire': 'publish its questionnaire as a form in its folder',
  readiness:
    'have it reviewed by another person and pre-tested with a few naive participants, then mark these checks on the Preparation tab; this advises and blocks nothing',
  'open-form': 'open the form to responses and share its link, from the Fieldwork tab',
  collect: 'collect responses: the team shares the link, and the Fieldwork tab follows them',
  'close-form': 'close the form: the target number of responses is reached',
  'theme-open-items':
    'find the themes of the open answers, from the Analysis tab (the answers are masked first, and the person confirms the cost)',
  'make-facts':
    'read the figures in the Analysis tab, cross them by a profiling question, and make facts of the striking ones',
  'decide-facts': 'decide the facts still to decide, in the Analysis tab',
  'analysis-done':
    'the survey is analysed: its accepted facts feed the project insights with those of interviews',
}

/** Spec 036: only Preparation exists for a usability test so far. */
const USABILITY_NEXT_STEPS: Record<UsabilityNextStep, string> = {
  'write-protocol': 'write its test protocol',
  'add-folder': 'add the folder that will hold its protocol and, later, its session videos',
  'publish-protocol':
    'publish its test protocol (with its participant sheet) and the usability test best practices to its folder',
  readiness:
    "run a pilot session, open the tested interface on the participants' device and account, and have the protocol reviewed, then mark these checks on the Preparation tab; this advises and blocks nothing",
  'run-sessions':
    'run the test sessions, record them and put their videos in the study folder: the Fieldwork tab lists one session per video',
  'decide-sessions':
    'validate or exclude the test sessions found on the Fieldwork tab, after checking their participant, facilitators and protocol version',
  'make-ready':
    'complete the validated sessions that are not ready for the video analysis (participant to confirm, video length unknown, protocol version) on the Fieldwork tab',
  'next-phase':
    'every session kept is ready; the video analysis, which also transcribes them, comes in a later version',
}

/** The app's own words for its tabs (bilingual glossary): the model would translate them itself. */
const TAB_NAMES = {
  en: 'Name the study tabs as the app does: Preparation, Fieldwork, Lexicon, Enrichment, Quality, Analysis.',
  fr: 'Name the study tabs as the app does, without adding the English word: Préparation, Passation (for fieldwork, never "Terrain"), Lexique, Enrichissement, Qualité, Analyse.',
} as const

const LANGUAGES = { en: 'English', fr: 'French' } as const

const INSTRUCTIONS = `You are the goodresearch assistant. You help people run user research: frame research questions, write research goals, plan studies (interviews or questionnaires), and prepare their work.
- Be concise and concrete. Use short paragraphs and lists. Never invent facts about the person's projects: use only the context below.
- You can propose changes with your tools. A tool call does not change anything: the person sees a card and decides. Never claim a change was made unless a tool result says "Applied".
- When the person dismissed a proposal, do not propose it again unchanged.
- Only use ids that appear in the context.
- Propose to delete a project only when the person asks for it, and ask which one if several could match.
- Each message of the person starts with the page it was sent from. The context below describes the page the person is on now; when it differs from earlier messages, the person has moved.
- When the person can choose among a few clear options, such as the next steps, offer them with offer_choices rather than a list in your text.
- When the person asks what comes next, answer in your own words from the next step in the context, never from memory, and offer the steps with offer_choices.
- For a study's interviews: count_interviews answers what is left to do, list_interviews gives only what its filters select, and propose_analysis offers to analyse them. Never ask for every interview when a count or a filter answers.
- You never accept, validate or exclude yourself: propose_accepting_suggestions, propose_validating_interviews and propose_excluding_interviews show a card, and only a person validates, by applying it. Accepting suggestions never validates an interview. A document attached to an interview is not its transcript: an interview without one stays without one, say so plainly, even if a document holds a summary of it.
- You can work in a study's folder like a colleague: find_files to look for a file or a person, browse_folder to see all of it, read_file to read a file, propose_folder_changes for one card of renames, moves and new sub-folders. Everything changes only when the person applies the card. You cannot delete, trash or change sharing: say so, and offer a sub-folder named "To sort"; the person deletes in their own storage.
- Skills hold instructions for specific tasks. When a task matches a skill listed below that is not loaded yet, call load_skill first and follow its instructions. When the person wants to create a research project, that is the skill project-framing. When they want to create a study, that is the skill study-framing.`

/** Said when the answer follows an applied card rather than a message (spec 018, 021, 022). */
const CONTINUATIONS = {
  project:
    'The person just applied your project proposal and its page is now open: nobody wrote a new message. In one or two sentences, say the project is ready and ask whether they want to prepare a first study. If an existing study of the team looks related, mention it and offer to reuse it with attach_study as well. Do not repeat the framing.',
  study:
    'The person just applied your study proposal and its page is now open: nobody wrote a new message. In one or two sentences, say the study is ready, then call offer_choices with the next steps: adding the folder that holds its interviews if they exist already, and preparing its interview guide. Start neither, and call no other tool. Do not repeat the framing.',
  folder:
    'The person just applied your folder proposal and the study is open on the tab named in the context: nobody wrote a new message. From the source folder in the context, give the number of transcripts, recordings and other files; if its inventory is still running, say so and that the Fieldwork tab follows it. Then call offer_choices with what is left to prepare according to the context: writing the interview guide if there is none, planning the interviews if none is planned; if both are done, going to Fieldwork. Start nothing, and call no other tool.',
  decided:
    'The person just applied your card on interviews: nobody wrote a new message. Your call shows the outcome of each line. In one or two sentences, say what was done and what failed. Call count_interviews if you need the numbers, then offer_choices with what comes next. Start nothing.',
  analysed:
    'The person just applied your analysis proposal: nobody wrote a new message. Call count_interviews, then say in two sentences what the analysis found and what is left, or that it is still running and the Fieldwork tab follows it. Then call offer_choices with what comes next. Start nothing.',
  consented:
    'The person just agreed to send the names and content of the files of this study to their AI provider: nobody wrote a new message. Go on with what they asked: call again the tool that led to the card.',
  tidied:
    'The person just applied your changes in the folder: nobody wrote a new message. Your call shows the outcome of each line. In one or two sentences, say what was done and what failed, then say what comes next. Call only offer_choices if useful.',
  guide:
    'The person just applied your interview guide and it is saved: nobody wrote a new message. In one or two sentences, say so. Then call offer_choices with what comes next according to the next step in the context, first of all publishing the guide and the best practices to the study folder when that is possible, or adding the folder when there is none. Start nothing, and call no other tool.',
  published:
    'The person just applied your publication proposal and the documents are in the study folder, linked on your card: nobody wrote a new message. In one or two sentences, say so. Then call offer_choices with what comes next according to the next step in the context. Start nothing, and call no other tool.',
  surveyStudy:
    'The person just applied your study proposal and its page is now open: nobody wrote a new message. In one or two sentences, say the study is ready, then call offer_choices with the next steps: designing its questionnaire, and adding the folder that will hold its form. Never mention interviews or an interview guide: this is a survey study. Start neither, and call no other tool. Do not repeat the framing.',
  surveyFolder:
    'The person just applied your folder proposal and the study is open: nobody wrote a new message. In one sentence, say the folder is attached: it will hold the form of the questionnaire. Then call offer_choices with what comes next according to the next step in the context. Never mention interviews, transcripts or recordings: this is a survey study. Start nothing, and call no other tool.',
  protocol:
    'The person just applied your test protocol and it is saved: nobody wrote a new message. In one or two sentences, say so. Then call offer_choices with what comes next according to the next step in the context. Start nothing, and call no other tool.',
  usabilityFolder:
    'The person just applied your folder proposal and the study is open: nobody wrote a new message. In one sentence, say the folder is attached: it will hold the test protocol and its participant sheet, and later the session videos. Then call offer_choices with what comes next according to the next step in the context. Never mention interviews, an interview guide or transcripts: this is a usability test study. Start nothing, and call no other tool.',
  usabilityStudy:
    'The person just applied your study proposal and its page is now open: nobody wrote a new message. In one or two sentences, say the study is ready, then call offer_choices with the next steps: designing its test protocol, and adding the folder that will hold it. Never mention an interview guide or a questionnaire: this is a usability test study. Start neither, and call no other tool. Do not repeat the framing.',
  questionnaire:
    'The person just applied your questionnaire and it is saved: nobody wrote a new message. In one or two sentences, say so. Then call offer_choices with what comes next according to the next step in the context. Start nothing, and call no other tool.',
  connected:
    'The person just connected their file source and is back on this study: nobody wrote a new message. Call again the tool that led to the connection card: attach_folder with the link of the conversation and the Study id (ask for the link if there is none), publish_preparation with the same documents, or propose_folder_changes with the same lines.',
} as const

export type Continuation = keyof typeof CONTINUATIONS

/** The interview study of the page, for the guide tools (spec 006). */
export type GuideStudy = { id: string; name: string; guideVersion: number | null }

/** The usability test study of the page, for the test protocol tools (spec 036). */
export type ProtocolStudy = { id: string; name: string; version: number | null }

/** The survey study of the page, for the questionnaire tools (spec 027). */
export type SurveyStudy = {
  id: string
  name: string
  version: number | null
  /** Spec 028: its published form, and its target rule's version. */
  publicationId: string | null
  accepting: boolean
  ruleVersion: number | null
}

const STATUS_LABELS: Record<string, string> = {
  'to-contact': 'to contact',
  invited: 'invited',
  scheduled: 'scheduled',
  done: 'done',
  postponed: 'postponed',
  cancelled: 'cancelled',
}

/**
 * The studies of the person's teams that attach_study can reuse (spec 021), each team with its
 * share of the limit. A project's page lists its own team's already.
 */
export const reusableStudies = async (
  research: ResearchReads,
  actor: Actor,
  page: PageRef,
): Promise<string> => {
  const own =
    page.kind === 'project' && page.id ? await research.getProject(actor.id, page.id) : null
  const teams = (await research.teamsOf(actor.id)).filter((t) => t.id !== own?.team.id)
  const share = Math.ceil(REUSABLE_LIMIT / Math.max(teams.length, 1))
  const lists = await Promise.all(
    teams.map(async (team) => {
      const studies = await research.attachableStudies(actor.id, team.id, null)
      return {
        cut: studies.length > share,
        items: studies
          .slice(0, share)
          .map(
            (s) =>
              `${s.name} (team ${team.name}; in: ${s.projects.map((p) => p.name).join(', ') || 'no project'}; attachable study id ${s.id})`,
          ),
      }
    }),
  )
  const items = lists.flatMap((l) => l.items)
  return `Studies of the person's teams${own ? ' other than this project' : ''}, that attach_study can reuse${lists.some((l) => l.cut) ? ' (the most recent only: ask the person whether a related one exists)' : ''}: ${items.join('; ') || 'none'}`
}

const readOnlyRule = (team: string) =>
  `If the person asks for a change, an analysis or something new here, propose nothing: say that team ${team} decides, that they can contact it, and that they can create their own work from a page of their team.`

/**
 * The instructions and page context sent with each message (spec 005 US2, research R3). Built
 * here, with the person's own permissions: nothing from a page they cannot open, no file names.
 * On an interview study the person can act on, the guide, the schedule counts (never names) and
 * the guide design skill are added (spec 006); `guideStudy` then names the study.
 */
export const buildContext = async (
  research: ResearchReads,
  actor: Actor,
  page: PageRef,
  language: 'en' | 'fr',
  loadedSkills: readonly string[] = [],
  continuation: Continuation | null = null,
): Promise<{
  system: string
  guideStudy: GuideStudy | null
  surveyStudy: SurveyStudy | null
  protocolStudy: ProtocolStudy | null
  readOnly: boolean
}> => {
  let guideStudy: GuideStudy | null = null
  let surveyStudy: SurveyStudy | null = null
  let protocolStudy: ProtocolStudy | null = null
  let readOnly = false
  const lines: string[] = []
  const teams = await research.teamsOf(actor.id)
  lines.push(
    `Teams of the person: ${teams.map((t) => `${t.name} (Team id: ${t.id})`).join(', ') || 'none'}.`,
  )
  const projects = (await research.listProjects(actor.id)).slice(0, 30)
  lines.push(
    `Projects the person can open (most recent first): ${projects.map((p) => `${p.name} (team ${p.team.name}, project id ${p.id})`).join('; ') || 'none'}.`,
  )

  if (page.kind === 'project' && page.id) {
    const project = await research.getProject(actor.id, page.id)
    if (project) {
      const studies = (await research.listStudies(actor.id, project.id)) ?? []
      const attachable = await research.attachableStudies(actor.id, project.team.id, project.id)
      lines.push(
        'The person is on a project page.',
        `Project: ${project.name}`,
        `Project id: ${project.id}`,
        `Team: ${project.team.name}`,
        `Research goal: ${project.goal || '(empty)'}`,
        `Other studies of the team, that attach_study can reuse: ${
          attachable
            .slice(0, 30)
            .map(
              (s) =>
                `${s.name} (in: ${s.projects.map((p) => p.name).join(', ') || 'no project'}; attachable study id ${s.id})`,
            )
            .join('; ') || 'none'
        }`,
        `Studies: ${studies.map((s) => `${s.name} (${s.type}, Study id: ${s.id})`).join('; ') || 'none'}`,
      )
    } else {
      // Spec 026 FR-019 to FR-021: another team's page is read, never changed.
      const read = await research.readProject(actor.id, page.id)
      if (read) {
        readOnly = true
        const studies = (await research.readStudies(actor.id, read.id)) ?? []
        lines.push(
          'The person is on a project page of another team: they can read it, not change it.',
          `Project: ${read.name}`,
          `Project id: ${read.id}`,
          `Research goal: ${read.goal || '(empty)'}`,
          `Studies: ${studies.map((s) => `${s.name} (${s.type}, Study id: ${s.id})`).join('; ') || 'none'}`,
          readOnlyRule(read.team.name),
        )
      } else lines.push('The person is on a page they cannot open, or that does not exist.')
    }
  } else if (page.kind === 'study' && page.id) {
    const study = await research.getStudy(actor.id, page.id)
    if (study) {
      const folder = await research.folderState(actor, study.id)
      const first = study.projects[0]
      const project = first ? await research.getProject(actor.id, first.id) : null
      lines.push(
        'The person is on a study page.',
        `Study: ${study.name} (${study.type}), Study id: ${study.id}`,
        study.type === 'survey'
          ? `Tabs (study phases): preparation, fieldwork, analysis; no other tab exists on a survey study. Current tab: ${page.phase ?? 'preparation'}`
          : study.type === 'usability-test'
            ? `Tabs (study phases): preparation, fieldwork, analysis; no other tab exists on a usability test study, and only preparation and fieldwork are built so far. On fieldwork, each video of the folder is a test session: the interview tools work on them, with the participant as the interviewee and the facilitators as the interviewers. Current tab: ${page.phase ?? 'preparation'}`
            : `Tabs (study phases): preparation, fieldwork, enrichment, analysis. Current tab: ${page.phase ?? 'fieldwork'}`,
        `Source folder: ${
          folder && study.type === 'survey'
            ? folder.name
            : folder
              ? `${folder.name} (inventory ${folder.status}: ${folder.byKind.transcript} transcripts, ${folder.byKind.media} recordings, ${folder.byKind.other} other files)`
              : '(none, or no access)'
        }`,
        `Research goal of the study, read by its AI steps: ${study.goal || '(empty)'}`,
        // Spec 019: a study can feed several projects, or none.
        ...(project
          ? [
              `Project: ${project.name}`,
              `Project id: ${project.id}`,
              `Research goal of that project: ${project.goal || '(empty)'}`,
              ...(study.projects.length > 1
                ? [
                    `Also in: ${study.projects
                      .slice(1)
                      .map((p) => `${p.name} (project id ${p.id})`)
                      .join('; ')}. Decisions on its facts apply in all of them.`,
                  ]
                : []),
            ]
          : ["This study is in no project: it stays on its team's Studies page."]),
      )
      const questionnaire =
        study.type === 'survey' ? await research.questionnaire(actor.id, study.id) : null
      if (questionnaire) {
        const progress = await research.surveyProgress(actor.id, study.id)
        const analysisState = await research.surveyAnalysisState(actor.id, study.id)
        surveyStudy = {
          id: study.id,
          name: study.name,
          version: questionnaire.version,
          publicationId: progress?.publicationId ?? null,
          accepting: progress?.accepting === true,
          ruleVersion: progress?.ruleVersion ?? null,
        }
        const has = questionnaire.content !== null
        const published = has && folder ? await research.publishedKinds(actor, study.id) : []
        lines.push(
          has
            ? `Questionnaire of this study (version ${questionnaire.version}): ${JSON.stringify(questionnaire.content)}`
            : 'Questionnaire of this study: none yet.',
          `Next step of this study: ${
            SURVEY_NEXT_STEPS[
              surveyNextStep({
                hasQuestionnaire: has,
                hasFolder: folder !== null,
                published,
                checksDone: questionnaire.checksDone,
                accepting: progress?.accepting === true,
                counted: progress?.counts.counted ?? 0,
                target: progress?.target ?? null,
                openToTheme:
                  analysisState?.openItems.filter((o) => o.answers >= 5 && o.themes === 0).length ??
                  0,
                facts: analysisState?.facts ?? { total: 0, toDecide: 0 },
              })
            ]
          }.`,
        )
      }
      const protocol =
        study.type === 'usability-test' ? await research.testProtocol(actor.id, study.id) : null
      if (protocol) {
        protocolStudy = { id: study.id, name: study.name, version: protocol.version }
        const has = protocol.content !== null
        const published = has && folder ? await research.publishedKinds(actor, study.id) : []
        // Spec 037: the sessions, read only once the protocol is published (no name).
        const counted = published.includes('protocol')
          ? await research.interviewCounts(actor, study.id)
          : null
        const sessions = counted?.ok
          ? {
              total: counted.counts.total ?? 0,
              open: counted.counts.open ?? 0,
              notReady: counted.counts['not-ready'] ?? 0,
            }
          : undefined
        lines.push(
          // FR-022: the tested interface is text here; the app never opens it.
          has
            ? `Test protocol of this study (version ${protocol.version}): ${JSON.stringify(protocol.content)}`
            : 'Test protocol of this study: none yet.',
          `Next step of this study: ${
            USABILITY_NEXT_STEPS[
              usabilityNextStep({
                hasProtocol: has,
                hasFolder: folder !== null,
                published,
                checksDone: protocol.checksDone,
                sessions,
              })
            ]
          }.`,
        )
      }
      const preparation = await research.preparation(actor.id, study.id)
      if (preparation) {
        guideStudy = {
          id: study.id,
          name: study.name,
          guideVersion: preparation.guide?.version ?? null,
        }
        const counts = Object.entries(preparation.schedule)
          .map(([status, n]) => `${STATUS_LABELS[status] ?? status}: ${n}`)
          .join(', ')
        lines.push(
          preparation.guide
            ? `Interview guide of this study (version ${preparation.guide.version}): ${JSON.stringify(preparation.guide.content)}`
            : 'Interview guide of this study: none yet.',
          `Interview schedule of this study: ${counts || 'no planned interview'} (names are not shared with you).`,
        )
        const hasGuide = preparation.guide !== null
        const published = hasGuide && folder ? await research.publishedKinds(actor, study.id) : []
        // Spec 025: read only once the preparation is done, when it can change the answer.
        const interviews =
          published.includes('guide') && published.includes('best-practices')
            ? await research.interviewsStep(actor, study.id)
            : undefined
        const step = nextStep({
          hasGuide,
          hasFolder: folder !== null,
          published,
          interviews,
        })
        lines.push(`Next step of this study: ${NEXT_STEPS[step]}.`)
      }
    } else {
      // Spec 026: no folder, schedule, interview or next step: they stay with the team.
      const read = await research.readStudy(actor.id, page.id)
      if (read) {
        readOnly = true
        lines.push(
          'The person is on a study page of another team: they can read it, not change it.',
          `Study: ${read.name} (${read.type}), Study id: ${read.id}`,
          `Research goal of the study: ${read.goal || '(empty, or no access to its folder)'}`,
          'Its folder, schedule, interviews and transcripts are reserved to its team: you have none of them.',
          readOnlyRule(read.team.name),
        )
      } else lines.push('The person is on a page they cannot open, or that does not exist.')
    }
  } else lines.push(`The person is on the "${page.kind}" page.`)

  // Spec 021: only once a study is being framed, not on every message.
  if (loadedSkills.includes('study-framing'))
    lines.push(await reusableStudies(research, actor, page))

  const skills: string[] = []
  // A continuing answer only offers the next step: no method to follow.
  const loaded =
    continuation || readOnly ? [] : SKILL_NAMES.filter((name) => loadedSkills.includes(name))
  // The guide design only makes sense on an interview study; framing a project, on every page.
  const available = SKILL_NAMES.filter(
    (name) =>
      !continuation &&
      !readOnly &&
      !loadedSkills.includes(name) &&
      (name !== 'interview-guide-design' || guideStudy !== null) &&
      (name !== 'questionnaire-design' || surveyStudy !== null) &&
      (name !== 'test-protocol-design' || protocolStudy !== null),
  )
  if (available.length)
    skills.push(
      `Skills you can load: ${available.map((name) => `${name} (${SKILLS[name].summary})`).join('; ')}.`,
    )
  // A loaded skill stays in the context on every page (its result says so in the history); its
  // tools only exist on an interview study page (PR #6 review).
  for (const name of loaded as SkillName[])
    skills.push(`Loaded skill ${name}:\n${SKILLS[name].instructions}`)
  if (loaded.includes('interview-guide-design') && !guideStudy)
    skills.push(
      'The interview guide tools (check_guide_questions, report_guide_progress, propose_interview_guide) are only available on the page of an interview study: open it with open_study to go on with the guide.',
    )

  if (loaded.includes('questionnaire-design') && !surveyStudy)
    skills.push(
      'The questionnaire tools (check_questionnaire_items, report_questionnaire_progress, propose_questionnaire) are only available on the page of a survey study: open it with open_study to go on.',
    )

  if (loaded.includes('test-protocol-design') && !protocolStudy)
    skills.push(
      'The test protocol tools (check_protocol_tasks, report_protocol_progress, propose_protocol) are only available on the page of a usability test study: open it with open_study to go on.',
    )

  // Spec 027: the same card leads elsewhere on a survey study; spec 036, on a usability test.
  const said: Continuation | null =
    protocolStudy && continuation === 'study'
      ? 'usabilityStudy'
      : protocolStudy && continuation === 'folder'
        ? 'usabilityFolder'
        : surveyStudy && continuation === 'study'
          ? 'surveyStudy'
          : surveyStudy && continuation === 'folder'
            ? 'surveyFolder'
            : continuation

  return {
    system: `${INSTRUCTIONS}${said ? `\n- ${CONTINUATIONS[said]}` : ''}\nAnswer in ${LANGUAGES[language]} unless the person writes in another language. ${TAB_NAMES[language]}\n\nContext:\n${lines.join('\n')}${skills.length ? `\n\n${skills.join('\n\n')}` : ''}`,
    guideStudy,
    surveyStudy,
    protocolStudy,
    readOnly,
  }
}
