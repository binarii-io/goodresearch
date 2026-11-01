export type StatusCount = { readonly status: string; readonly count: number }

export type ReportedStudy = { readonly id: string; readonly access: boolean }

/** What the other modules count in a study; no access check, no Drive. */
export type StudyCounts = {
  readonly interviews: {
    readonly validated: number
    readonly proposed: number
    readonly excluded: number
    readonly participants: number
  }
  readonly facts: readonly StatusCount[]
}

/** The ledger refs of a study, per use. */
export type StudyCostRefs = {
  readonly analysis: readonly string[]
  readonly lexicon: readonly string[]
  readonly cleaning: readonly string[]
  readonly quality: readonly string[]
  readonly facts: readonly string[]
}

/** The ledger refs of a project's own synthesis, per use. */
export type ProjectCostRefs = {
  readonly insights: readonly string[]
  readonly recommendations: readonly string[]
  readonly takeaways: readonly string[]
}

export type ProjectTakeaways = {
  readonly text: { readonly en: string; readonly fr: string }
  readonly translation: 'done' | 'translating' | 'not-translated'
}

/** What Reporting reads from the other modules, through `compose.ts`. */
export type ReportingSources = {
  /** The project's studies; null without access to the project. */
  studies(accountId: string, projectId: string): Promise<readonly ReportedStudy[] | null>
  /** Spec 019: the studies on a team's page; null without access to the team. */
  teamStudies(
    accountId: string,
    teamId: string,
    filter: { q?: string | undefined },
  ): Promise<readonly ReportedStudy[] | null>
  /** Spec 020: null without access to the project, else whether this person may delete it. */
  canDelete(accountId: string, projectId: string): Promise<boolean | null>
  /** Spec 020: each study of the project, and how many other projects it is in. */
  linkedStudies(accountId: string, projectId: string): Promise<readonly { otherProjects: number }[]>
  hasPublishedDeck(projectId: string): Promise<boolean>
  studyCounts(studyId: string): Promise<StudyCounts>
  studyCostRefs(studyId: string): Promise<StudyCostRefs>
  insightCounts(projectId: string): Promise<readonly StatusCount[]>
  recommendationCounts(projectId: string): Promise<readonly StatusCount[]>
  /** Null until written. */
  takeaways(projectId: string): Promise<ProjectTakeaways | null>
  projectCostRefs(projectId: string): Promise<ProjectCostRefs>
  /** Each ref's cost, null without a known price. */
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}

export type ReportingDeps = { readonly sources: ReportingSources }
