/**
 * What is left to do on a study's interviews (spec 025): one definition of each state, shared by
 * the counts and the lists, so that a number and the list behind it never disagree.
 */
export const INTERVIEW_FILTERS = [
  'to-decide',
  'no-transcript',
  'no-recording',
  'not-analysed',
  'ready',
  'validated',
  'excluded',
  /** Spec 037: a test session not excluded and not ready for the video analysis. */
  'not-ready',
] as const
export type InterviewFilter = (typeof INTERVIEW_FILTERS)[number]

export const INTERVIEWS_PER_PAGE = 50

/** What the states need of an interview, as the Fieldwork tab reads it. */
export type InterviewFacts = {
  readonly id: string
  readonly state: 'proposed' | 'validated' | 'excluded'
  readonly title: string | null
  readonly defaultTitle: string
  readonly roster?: readonly { readonly name: string }[]
  readonly transcript: unknown | null
  readonly media: readonly unknown[]
  /** Spec 037, test sessions only. */
  readonly readiness?: string | null
  readonly video?: { readonly durationMs: number | null } | null
  readonly analysis: {
    readonly state: string
    readonly proposals: readonly {
      readonly status: string
      readonly people?: readonly { readonly name: string }[] | null
    }[]
  } | null
}

const undecided = (i: InterviewFacts) =>
  (i.analysis?.proposals ?? []).filter((p) => p.status === 'proposed')

export const matches = (i: InterviewFacts, filter: InterviewFilter): boolean => {
  const proposed = i.state === 'proposed'
  switch (filter) {
    case 'to-decide':
      return proposed && undecided(i).length > 0
    case 'no-transcript':
      return i.transcript === null
    case 'no-recording':
      return i.media.length === 0
    case 'not-analysed':
      return proposed && i.analysis?.state !== 'done'
    case 'ready':
      return (
        proposed &&
        i.transcript !== null &&
        i.analysis?.state === 'done' &&
        undecided(i).length === 0
      )
    case 'validated':
      return i.state === 'validated'
    case 'excluded':
      return i.state === 'excluded'
    case 'not-ready':
      return i.readiness != null && i.readiness !== 'ready' && i.state !== 'excluded'
  }
}

export const countInterviews = (
  interviews: readonly InterviewFacts[],
): { total: number; open: number; readyForAnalysis: number; videoMinutes: number } & Record<
  InterviewFilter,
  number
> => {
  const counts = Object.fromEntries(
    INTERVIEW_FILTERS.map((f) => [f, interviews.filter((i) => matches(i, f)).length]),
  ) as Record<InterviewFilter, number>
  return {
    total: interviews.length,
    // Not decided yet, whatever is missing: an interview without transcript counts too.
    open: interviews.filter((i) => i.state === 'proposed').length,
    // Spec 037: test sessions ready for the video analysis, and their videos' length (not excluded).
    readyForAnalysis: interviews.filter((i) => i.readiness === 'ready').length,
    videoMinutes: Math.round(
      interviews
        .filter((i) => i.state !== 'excluded')
        .reduce((sum, i) => sum + (i.video?.durationMs ?? 0), 0) / 60_000,
    ),
    ...counts,
  }
}

/** The people of an interview: on its roster, or in a suggestion not rejected. */
export const peopleOf = (i: InterviewFacts): string[] => [
  ...new Set([
    ...(i.roster ?? []).map((r) => r.name),
    ...(i.analysis?.proposals ?? [])
      .filter((p) => p.status !== 'rejected')
      .flatMap((p) => (p.people ?? []).map((person) => person.name)),
  ]),
]

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The interviews matching every filter and the name, one page; no filter gives them all. */
export const selectInterviews = <T extends InterviewFacts>(
  interviews: readonly T[],
  search: {
    readonly filters?: readonly InterviewFilter[] | undefined
    readonly name?: string | undefined
    readonly page?: number | undefined
  },
): { items: T[]; matched: number; page: number; pages: number } => {
  const name = plain(search.name ?? '')
  const found = interviews.filter(
    (i) =>
      (search.filters ?? []).every((f) => matches(i, f)) &&
      [i.title ?? i.defaultTitle, ...peopleOf(i)].some((text) => plain(text).includes(name)),
  )
  const page = Math.max(search.page ?? 1, 1)
  const start = (page - 1) * INTERVIEWS_PER_PAGE
  return {
    items: found.slice(start, start + INTERVIEWS_PER_PAGE),
    matched: found.length,
    page,
    pages: Math.ceil(found.length / INTERVIEWS_PER_PAGE),
  }
}

/** What comes next on interviews, for the study's next step. */
export const interviewsStep = (
  counts: ReturnType<typeof countInterviews>,
): 'none' | 'analyse' | 'decide' | 'validate' | 'done' => {
  if (counts.total === 0) return 'none'
  if (counts['not-analysed'] > 0) return 'analyse'
  if (counts['to-decide'] > 0) return 'decide'
  return counts.open > 0 ? 'validate' : 'done'
}
