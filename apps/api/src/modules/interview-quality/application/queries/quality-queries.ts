import { err, ok, type Person } from '@goodresearch/shared'
import { reviewActionOf } from '../../domain/evaluation-state.ts'
import {
  addFigures,
  emptyFigures,
  type Figures,
  figuresOf,
  NOT_IDENTIFIED,
  personFigures,
  type RemarkKind,
} from '../../domain/figures.ts'
import { reanchor } from '../../domain/remarks.ts'
import { type ReviewRun, reviewRef } from '../../domain/review-run.ts'
import { type InterviewNow, interviewsNow, studyOf } from '../interviews.ts'
import type { QualityDeps, StoredReformulation, StoredRemark, StudyAccess } from '../ports.ts'

/** A sum of the costs recorded; null when there is none, or one has no price. */
const sum = (refs: readonly string[], costs: ReadonlyMap<string, number | null>) => {
  let total = 0
  for (const r of refs) {
    const c = costs.get(r)
    if (c === undefined) continue
    if (c === null) return null
    total += c
  }
  return total > 0 ? total : null
}

const refsOf = (runs: readonly ReviewRun[], sessionId: string) =>
  runs
    .filter((r) => r.sessions.some((s) => s.sessionId === sessionId))
    .map((r) => reviewRef(r.id, sessionId))

const runRefs = (run: ReviewRun) => run.sessions.map((s) => reviewRef(run.id, s.sessionId))

/** Figures only once reviewed: nothing to read before, not even a "0 of 0". */
const hasFigures = (i: InterviewNow) =>
  i.evaluation !== null && i.measurable && i.state !== 'not-reviewed'

/** How a person shows: their name, or their code under anonymisation; null when not identified. */
const personLabel = (access: StudyAccess, people: readonly Person[], code: string) => {
  if (code === NOT_IDENTIFIED) return null
  if (access.anonymised) return code
  return people.find((p) => p.code === code)?.name ?? code
}

export type RemarkFilter = {
  readonly person?: string | undefined
  readonly sessionId?: string | undefined
  readonly kind?: RemarkKind | undefined
  readonly stance?: 'agree' | 'disagree' | 'none' | undefined
}

export const makeQualityQueries = (deps: QualityDeps) => {
  const load = async (accountId: string, studyId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const runs = await deps.store.runsOf(studyId)
    const [interviews, counts, reformulations] = await Promise.all([
      interviewsNow(deps, accountId, studyId, access, sessions, runs),
      deps.store.speakerCountsOf(studyId),
      deps.store.reformulationsOf(studyId),
    ])
    return ok({ access, runs, interviews, counts, reformulations })
  }
  type Loaded = Extract<Awaited<ReturnType<typeof load>>, { ok: true }>['value']

  const figuresFor = (l: Loaded, i: InterviewNow): Figures =>
    figuresOf({
      times: i.times,
      counts: l.counts.filter((c) => c.sessionId === i.session.id),
      reformulations: l.reformulations.filter((r) => r.sessionId === i.session.id),
      remarks: i.remarks.map((r) => r.remark),
      leftOut: i.evaluation?.leftOut ?? 0,
      turnsSkipped: i.evaluation?.turnsSkipped ?? 0,
    })

  /** What the interviewee said around a turn: the nearest turn of theirs on each side. */
  const around = (i: InterviewNow, segmentId: string) => {
    const turns = i.text?.turns ?? []
    const at = turns.findIndex((t) => t.id === segmentId)
    const said = (t: (typeof turns)[number]) => i.roleOf(t.speaker) === 'interviewee'
    return {
      before: at > 0 ? (turns.slice(0, at).reverse().find(said)?.text ?? null) : null,
      after: at >= 0 ? (turns.slice(at + 1).find(said)?.text ?? null) : null,
    }
  }

  const remarkView = (
    access: StudyAccess,
    i: InterviewNow,
    remark: StoredRemark,
    place: { segmentId: string; offset: number; length: number } | null,
  ) => {
    const code = i.interviewerOf(remark.speakerLabel) ?? NOT_IDENTIFIED
    const person = personLabel(access, i.people, code)
    const reason = remark.reason ?? {
      en: remark.reasonPerson ?? '',
      fr: remark.reasonPerson ?? '',
    }
    return {
      id: remark.id,
      sessionId: remark.sessionId,
      interviewTitle: i.session.title,
      person,
      personKey: code,
      kind: remark.kind,
      segmentId: place?.segmentId ?? remark.segmentId,
      offset: place?.offset ?? null,
      length: place?.length ?? null,
      text: remark.text,
      ...around(i, place?.segmentId ?? remark.segmentId),
      reason,
      recommendation: remark.recommendation,
      addedElement: remark.addedElement,
      origin: remark.origin,
      stance: remark.stance,
      stanceBy: remark.stanceBy,
      stanceAt: remark.stanceAt?.toISOString() ?? null,
      lost: place === null,
      version: remark.version,
    }
  }

  const reformulationView = (access: StudyAccess, i: InterviewNow, r: StoredReformulation) => {
    const place = i.text ? reanchor(r, i.text.turns) : null
    const code = i.interviewerOf(r.speakerLabel) ?? NOT_IDENTIFIED
    return {
      id: r.id,
      sessionId: r.sessionId,
      interviewTitle: i.session.title,
      person: personLabel(access, i.people, code),
      personKey: code,
      segmentId: place?.segmentId ?? r.segmentId,
      offset: place?.offset ?? null,
      length: place?.length ?? null,
      text: r.text,
      ...around(i, place?.segmentId ?? r.segmentId),
    }
  }

  const inOrder = (turns: readonly { id: string }[] | undefined) => {
    const at = new Map((turns ?? []).map((t, n) => [t.id, n]))
    return (a: { segmentId: string; offset: number | null }, b: typeof a) =>
      (at.get(a.segmentId) ?? 0) - (at.get(b.segmentId) ?? 0) || (a.offset ?? 0) - (b.offset ?? 0)
  }

  /** FR-002, FR-006, FR-015: the figures of the interviews reviewed, with no AI; the review. */
  const overview = async (accountId: string, studyId: string) => {
    const loaded = await load(accountId, studyId)
    if (!loaded.ok) return loaded
    const l = loaded.value
    const { access, runs, interviews } = l
    const costs = await deps.ai.costs(runs.flatMap(runRefs))
    const last = runs[0] ?? null
    const rows = interviews.map((i) => {
      const id = i.session.id
      const progress = last?.sessions.find((s) => s.sessionId === id) ?? null
      return {
        sessionId: id,
        title: i.session.title,
        interviewDate: i.session.interviewDate,
        interviewers: i.people
          .filter((p) => p.role === 'interviewer')
          .map((p) => (access.anonymised ? p.code || '–' : p.name)),
        state: i.state,
        action: reviewActionOf(i.state),
        figures: hasFigures(i) ? figuresFor(l, i) : null,
        cost: sum(refsOf(runs, id), costs),
        failure: progress?.failure ?? null,
        reading:
          last && !last.finishedAt && progress
            ? { state: progress.state, chunks: progress.chunks, chunksDone: progress.chunksDone }
            : null,
      }
    })
    const reviewed = interviews.filter(hasFigures)
    const persons = personFigures(
      reviewed.map((i) => ({
        turns: i.text?.turns ?? [],
        roleOf: i.roleOf,
        personOf: i.interviewerOf,
        roster: i.people.filter((p) => p.role === 'interviewer' && p.code).map((p) => p.code),
        counts: l.counts.filter((c) => c.sessionId === i.session.id),
        reformulations: l.reformulations.filter((r) => r.sessionId === i.session.id),
        remarks: i.remarks.map((r) => r.remark),
      })),
    )
    const everyone = interviews.flatMap((i) => i.people)
    const people = [...persons]
      .map(([key, row]) => ({ key, name: personLabel(access, everyone, key), ...row }))
      // Name order, never ranked by a figure; the row of no one last.
      .sort(
        (a, b) =>
          Number(a.key === NOT_IDENTIFIED) - Number(b.key === NOT_IDENTIFIED) ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      )
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      // Only the interviews reviewed, and the tab says how many of them.
      overall:
        reviewed.length > 0
          ? rows.reduce(
              (total, r) => (r.figures ? addFigures(total, r.figures) : total),
              emptyFigures(),
            )
          : null,
      reviewed: reviewed.length,
      total: interviews.length,
      people,
      interviews: rows,
      run: last
        ? {
            id: last.id,
            total: last.sessions.length,
            done: last.sessions.filter((s) => s.state === 'done').length,
            failed: last.sessions.filter((s) => s.state === 'failed').length,
            chunks: last.sessions.reduce((n, s) => n + s.chunks, 0),
            chunksDone: last.sessions.reduce((n, s) => n + s.chunksDone, 0),
            leftOut: last.leftOut,
            failure: last.failure,
            finished: last.finishedAt !== null,
          }
        : null,
      lastRunCost: last ? sum(runRefs(last), costs) : null,
      cost: sum(runs.flatMap(runRefs), costs),
      consentNeeded: provider ? !(await deps.store.hasConsent(accountId, studyId, provider)) : true,
      anonymised: access.anonymised,
    })
  }

  /** FR-010: the remarks of the interviews reviewed, in interview and turn order. */
  const remarks = async (accountId: string, studyId: string, filter: RemarkFilter) => {
    const loaded = await load(accountId, studyId)
    if (!loaded.ok) return loaded
    const { access, interviews } = loaded.value
    const list = interviews
      .filter((i) => hasFigures(i) && (!filter.sessionId || i.session.id === filter.sessionId))
      .sort((a, b) => (a.session.interviewDate ?? '').localeCompare(b.session.interviewDate ?? ''))
      .flatMap((i) =>
        i.remarks
          .map((r) => remarkView(access, i, r.remark, r.place))
          .filter(
            (r) =>
              (!filter.person || r.personKey === filter.person) &&
              (!filter.kind || r.kind === filter.kind) &&
              (!filter.stance ||
                (filter.stance === 'none' ? r.stance === null : r.stance === filter.stance)),
          )
          .sort(inOrder(i.text?.turns)),
      )
    return ok({ remarks: list, total: list.length })
  }

  /** FR-008a: the simple reformulations, to check them. */
  const reformulations = async (
    accountId: string,
    studyId: string,
    filter: { person?: string | undefined; sessionId?: string | undefined },
  ) => {
    const loaded = await load(accountId, studyId)
    if (!loaded.ok) return loaded
    const l = loaded.value
    const list = l.interviews
      .filter((i) => hasFigures(i) && (!filter.sessionId || i.session.id === filter.sessionId))
      .flatMap((i) =>
        l.reformulations
          .filter((r) => r.sessionId === i.session.id && r.requalifiedRemarkId === null)
          .map((r) => reformulationView(l.access, i, r))
          .filter((r) => !filter.person || r.personKey === filter.person)
          .sort(inOrder(i.text?.turns)),
      )
    return ok({ reformulations: list, total: list.length })
  }

  /** The interview to read: its text always; its figures and remarks once reviewed. */
  const interview = async (accountId: string, studyId: string, sessionId: string) => {
    const loaded = await load(accountId, studyId)
    if (!loaded.ok) return loaded
    const l = loaded.value
    const i = l.interviews.find((n) => n.session.id === sessionId)
    if (!i) return err('SESSION_NOT_FOUND' as const)
    const costs = await deps.ai.costs(refsOf(l.runs, sessionId))
    const turns = i.text?.turns ?? null
    const shown = hasFigures(i)
    return ok({
      sessionId,
      title: i.session.title,
      interviewDate: i.session.interviewDate,
      state: i.state,
      turns:
        turns?.map((t) => ({
          id: t.id,
          speaker: t.speaker,
          role: i.roleOf(t.speaker),
          start: t.start,
          text: t.text,
        })) ?? null,
      figures: shown ? figuresFor(l, i) : null,
      remarks: shown
        ? i.remarks
            .map((r) => remarkView(l.access, i, r.remark, r.place))
            .sort(inOrder(turns ?? undefined))
        : [],
      reformulations: shown
        ? l.reformulations
            .filter((r) => r.sessionId === sessionId && r.requalifiedRemarkId === null)
            .map((r) => reformulationView(l.access, i, r))
            .sort(inOrder(turns ?? undefined))
        : [],
      // Who could not be told apart: a person says it, through Evidence's attribution.
      speakers: [...new Set((turns ?? []).map((t) => t.speaker))]
        .filter((s) => s !== null)
        .map((label) => ({ label, role: i.roleOf(label) })),
      participants: i.people
        .filter((p) => p.role === 'interviewee')
        .filter((p) => p.code)
        .map((p) => ({ code: p.code, label: l.access.anonymised ? p.code : p.name })),
      cost: sum(refsOf(l.runs, sessionId), costs),
    })
  }

  return { overview, remarks, reformulations, interview }
}

export type QualityQueries = ReturnType<typeof makeQualityQueries>
