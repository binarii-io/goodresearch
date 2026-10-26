import type { Actor, PageRef, ResearchReads } from './ports.ts'
import { SKILL_NAMES, SKILLS, type SkillName } from './skills.ts'

const LANGUAGES = { en: 'English', fr: 'French' } as const

const INSTRUCTIONS = `You are the goodresearch assistant. You help people run user research: frame research questions, write research goals, plan studies (interviews first), and prepare their work.
- Be concise and concrete. Use short paragraphs and lists. Never invent facts about the person's projects: use only the context below.
- You can propose changes with your tools. A tool call does not change anything: the person sees a card and decides. Never claim a change was made unless a tool result says "Applied".
- When the person dismissed a proposal, do not propose it again unchanged.
- Only use ids that appear in the context.
- Each message of the person starts with the page it was sent from. The context below describes the page the person is on now; when it differs from earlier messages, the person has moved.
- Skills hold instructions for specific tasks. When a task matches a skill listed below that is not loaded yet, call load_skill first and follow its instructions.`

/** The interview study of the page, for the guide tools (spec 006). */
export type GuideStudy = { id: string; name: string; guideVersion: number | null }

const STATUS_LABELS: Record<string, string> = {
  'to-contact': 'to contact',
  invited: 'invited',
  scheduled: 'scheduled',
  done: 'done',
  postponed: 'postponed',
  cancelled: 'cancelled',
}

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
): Promise<{ system: string; guideStudy: GuideStudy | null }> => {
  let guideStudy: GuideStudy | null = null
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
      lines.push(
        'The person is on a project page.',
        `Project: ${project.name}`,
        `Project id: ${project.id}`,
        `Team: ${project.team.name}`,
        `Research goal: ${project.goal || '(empty)'}`,
        `Studies: ${studies.map((s) => `${s.name} (${s.type}, Study id: ${s.id})`).join('; ') || 'none'}`,
      )
    } else lines.push('The person is on a page they cannot open, or that does not exist.')
  } else if (page.kind === 'study' && page.id) {
    const study = await research.getStudy(actor.id, page.id)
    const project = study ? await research.getProject(actor.id, study.project.id) : null
    if (study && project) {
      const folder = (await research.listStudies(actor.id, project.id))?.find(
        (s) => s.id === study.id,
      )?.folderName
      lines.push(
        'The person is on a study page.',
        `Study: ${study.name} (${study.type}), Study id: ${study.id}`,
        `Tabs (study phases): preparation, fieldwork, enrichment, analysis. Current tab: ${page.phase ?? 'fieldwork'}`,
        `Source folder: ${folder ?? '(none, or no access)'}`,
        `Project: ${project.name}`,
        `Project id: ${project.id}`,
        `Research goal: ${project.goal || '(empty)'}`,
      )
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
      }
    } else lines.push('The person is on a page they cannot open, or that does not exist.')
  } else lines.push(`The person is on the "${page.kind}" page.`)

  const skills: string[] = []
  const loaded = SKILL_NAMES.filter((name) => loadedSkills.includes(name))
  const available = SKILL_NAMES.filter((name) => !loadedSkills.includes(name))
  if (guideStudy && available.length)
    skills.push(
      `Skills you can load: ${available.map((name) => `${name} (${SKILLS[name].summary})`).join('; ')}.`,
    )
  // A loaded skill stays in the context on every page (its result says so in the history); its
  // tools only exist on an interview study page (PR #6 review).
  for (const name of loaded as SkillName[])
    skills.push(`Loaded skill ${name}:\n${SKILLS[name].instructions}`)
  if (loaded.length && !guideStudy)
    skills.push(
      'The interview guide tools (check_guide_questions, report_guide_progress, propose_interview_guide) are only available on the page of an interview study: open it with open_study to go on with the guide.',
    )

  return {
    system: `${INSTRUCTIONS}\nAnswer in ${LANGUAGES[language]} unless the person writes in another language.\n\nContext:\n${lines.join('\n')}${skills.length ? `\n\n${skills.join('\n\n')}` : ''}`,
    guideStudy,
  }
}
