import { err, ok, type Result } from '@goodresearch/shared'
import { themeOf } from '../domain/fact-lines.ts'
import { OTHER, type ProjectTheme } from '../domain/insights.ts'
import type { ProjectStudy, SourceFact, SynthesisDeps } from './ports.ts'

export type ProjectError = 'PROJECT_NOT_FOUND'

export type ProjectView = {
  readonly teamId: string
  readonly name: string
  readonly goal: string
  /** Spec 015: the name of the project's team. */
  readonly team?: string | null | undefined
  readonly studies: readonly ProjectStudy[]
  readonly studyIds: ReadonlySet<string>
}

/** The project as the person sees it: team access first (FR-018). */
export const projectOf = async (
  deps: SynthesisDeps,
  accountId: string,
  projectId: string,
): Promise<Result<ProjectView, ProjectError>> => {
  const project = await deps.sources.project(accountId, projectId)
  if (!project) return err('PROJECT_NOT_FOUND')
  const studies = await deps.sources.studies(accountId, projectId)
  return ok({ ...project, studies, studyIds: new Set(studies.map((s) => s.id)) })
}

/** The project's themes: the guides' theme sections merged by title, then "Other" (research R2). */
export const projectThemes = async (
  deps: SynthesisDeps,
  accountId: string,
  studies: readonly ProjectStudy[],
  facts: readonly SourceFact[],
): Promise<ProjectTheme[]> => {
  const found = new Map<string, ProjectTheme>()
  for (const s of studies.filter((x) => x.access))
    for (const t of await deps.sources.themes(accountId, s.id)) {
      const theme = themeOf(t)
      // A section named "Other" is the built-in Other, never a second one.
      if (theme.key !== OTHER.key && !found.has(theme.key)) found.set(theme.key, theme)
    }
  // A section removed since keeps the facts read under it.
  for (const f of facts) {
    const theme = themeOf(f.theme)
    if (theme.key !== OTHER.key && !found.has(theme.key)) found.set(theme.key, theme)
  }
  return [...found.values(), OTHER]
}

/** The names the app knows over the project's studies: never sent, never in a statement. */
export const projectNames = async (
  deps: SynthesisDeps,
  accountId: string,
  studyIds: Iterable<string>,
): Promise<string[]> => {
  const names = new Set<string>()
  for (const id of studyIds)
    for (const n of await deps.sources.knownNames(accountId, id)) names.add(n)
  return [...names]
}
