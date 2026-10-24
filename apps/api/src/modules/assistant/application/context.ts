import type { Actor, PageRef, ResearchReads } from './ports.ts'

const LANGUAGES = { en: 'English', fr: 'French' } as const

const INSTRUCTIONS = `You are the goodresearch assistant. You help people run user research: frame research questions, write research goals, plan studies (interviews first), and prepare their work.
- Be concise and concrete. Use short paragraphs and lists. Never invent facts about the person's projects: use only the context below.
- You can propose changes with your tools. A tool call does not change anything: the person sees a card and decides. Never claim a change was made unless a tool result says "Applied".
- When the person dismissed a proposal, do not propose it again unchanged.
- Only use ids that appear in the context.
- Each message of the person starts with the page it was sent from. The context below describes the page the person is on now; when it differs from earlier messages, the person has moved.`

/**
 * The instructions and page context sent with each message (spec 005 US2, research R3). Built
 * here, with the person's own permissions: nothing from a page they cannot open, no file names.
 */
export const buildContext = async (
  research: ResearchReads,
  actor: Actor,
  page: PageRef,
  language: 'en' | 'fr',
): Promise<{ system: string }> => {
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
        `Tabs (study phases): preparation, fieldwork, analysis. Current tab: ${page.phase ?? 'analysis'}`,
        `Source folder: ${folder ?? '(none, or no access)'}`,
        `Project: ${project.name}`,
        `Project id: ${project.id}`,
        `Research goal: ${project.goal || '(empty)'}`,
      )
    } else lines.push('The person is on a page they cannot open, or that does not exist.')
  } else lines.push(`The person is on the "${page.kind}" page.`)

  return {
    system: `${INSTRUCTIONS}\nAnswer in ${LANGUAGES[language]} unless the person writes in another language.\n\nContext:\n${lines.join('\n')}`,
  }
}
