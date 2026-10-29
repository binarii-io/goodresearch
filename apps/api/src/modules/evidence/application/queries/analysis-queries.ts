import { err, ok } from '@goodresearch/shared'
import {
  canStopFacts,
  type FactsRun,
  factsRef,
  isFactsRunLive,
  translationRef,
  withFactsStops,
} from '../../domain/analysis-run.ts'
import type { Fact } from '../../domain/facts.ts'
import { type Person, speakerRole } from '../../domain/speakers.ts'
import { type InterviewNow, interviewsNow, studyOf } from '../interviews.ts'
import type { EvidenceDeps, StoredVerbatim } from '../ports.ts'

const PAGE_SIZE = 50

/** A sum of costs; null when one of them has no price. */
const sum = (refs: readonly string[], costs: ReadonlyMap<string, number | null>) => {
  let total = 0
  for (const r of refs) {
    const c = costs.get(r)
    if (c === undefined) continue
    if (c === null) return null
    total += c
  }
  return total
}

const refsOf = (runs: readonly FactsRun[], sessionId: string) => [
  ...runs
    .filter((r) => r.sessions.some((s) => s.sessionId === sessionId))
    .map((r) => factsRef(r.id, sessionId)),
  translationRef(sessionId),
]

export const makeAnalysisQueries = (deps: EvidenceDeps) => {
  const now = () => deps.clock.now()

  /** FR-015: the participant as the study shows people, by their code or their name. */
  const participantLabel = (
    anonymised: boolean,
    people: Readonly<Record<string, readonly Person[]>> | null,
  ) => {
    const byCode = new Map(
      Object.values(people ?? {})
        .flat()
        .map((p) => [p.code, p.name]),
    )
    return (code: string | null) =>
      code === null ? null : anonymised ? code : (byCode.get(code) ?? code)
  }

  const whoOf = async (ids: readonly (string | null)[]) => {
    const names = await deps.store.accountNames(ids.filter((x): x is string => x !== null))
    return (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  }

  const factView = (
    f: Fact,
    i: Pick<InterviewNow, 'session' | 'verbatims' | 'places'>,
    label: (code: string | null) => string | null,
    who: (id: string | null) => { id: string; name: string | null } | null,
  ) => {
    const verbatims = f.verbatimIds
      .map((id) => i.verbatims.find((v) => v.id === id))
      .filter((v): v is StoredVerbatim => v !== undefined)
      .map((v) => ({
        id: v.id,
        text: v.text,
        segmentId: i.places.get(v.id)?.segmentId ?? v.segmentId,
        participant: label(v.participant),
        lost: i.places.get(v.id) === null,
      }))
    return {
      id: f.id,
      sessionId: f.sessionId,
      interviewTitle: i.session.title,
      statement: f.statement,
      translation: f.translation,
      polarity: f.polarity,
      theme: f.theme,
      verbatims,
      participants: [...new Set(verbatims.map((v) => v.participant).filter((p) => p !== null))],
      origin: f.origin,
      status: f.status,
      decidedBy: who(f.decidedBy),
      decidedAt: f.decidedAt?.toISOString() ?? null,
      version: f.version,
    }
  }

  /** FR-001: the validated interviews, their state, counts and costs; the run and the totals. */
  const overview = async (accountId: string, studyId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const [interviews, stored] = await Promise.all([
      interviewsNow(deps, accountId, studyId, access, sessions),
      deps.store.runsOf(studyId),
    ])
    // The interviews a person took out show as stopped at once, before the worker sees it.
    const runs = stored.map(withFactsStops)
    const allRefs = [
      ...runs.flatMap((r) => r.sessions.map((s) => factsRef(r.id, s.sessionId))),
      ...sessions.map((s) => translationRef(s.id)),
    ]
    const costs = await deps.ai.costs(allRefs)
    const last = runs[0]
    const lastRun = last ?? null
    const who = await whoOf(lastRun ? [lastRun.startedBy] : [])
    const provider = await deps.ai.providerOf(accountId)
    const failureOf = (sessionId: string) =>
      runs
        .find((r) => r.sessions.some((s) => s.sessionId === sessionId))
        ?.sessions.find((s) => s.sessionId === sessionId)?.failure ?? null
    const live = lastRun && isFactsRunLive(lastRun, now()) ? lastRun : null
    const readingOf = (sessionId: string) => {
      const s = live?.sessions.find((x) => x.sessionId === sessionId)
      return live && s
        ? {
            state: s.state,
            chunks: s.chunks,
            chunksDone: s.chunksDone,
            stoppable: canStopFacts(live, sessionId),
          }
        : null
    }
    return ok({
      interviews: interviews.map((i) => ({
        sessionId: i.session.id,
        title: i.session.title,
        interviewDate: i.session.interviewDate,
        state: i.state,
        verbatims: i.verbatims.filter((v) => !v.setAside).length,
        facts: {
          toDecide: i.facts.filter((f) => f.status === 'proposed').length,
          accepted: i.facts.filter((f) => f.status === 'accepted' || f.status === 'edited').length,
          rejected: i.facts.filter((f) => f.status === 'rejected').length,
        },
        lost: i.lost,
        readAt: i.reading?.readAt.toISOString() ?? null,
        cost: sum(refsOf(runs, i.session.id), costs),
        failure: failureOf(i.session.id),
        reading: readingOf(i.session.id),
      })),
      counts: {
        done: interviews.filter((i) => i.state === 'done').length,
        toDecide: interviews.reduce(
          (n, i) => n + i.facts.filter((f) => f.status === 'proposed').length,
          0,
        ),
      },
      run: lastRun
        ? {
            id: lastRun.id,
            total: lastRun.sessions.length,
            done: lastRun.sessions.filter((s) => s.state === 'done').length,
            failed: lastRun.sessions.filter((s) => s.state === 'failed').length,
            chunks: lastRun.sessions.reduce((n, s) => n + s.chunks, 0),
            chunksDone: lastRun.sessions.reduce((n, s) => n + s.chunksDone, 0),
            leftOut: lastRun.leftOut,
            failure: lastRun.failure,
            startedBy: who(lastRun.startedBy) ?? { id: lastRun.startedBy, name: null },
            finished: lastRun.finishedAt !== null || !isFactsRunLive(lastRun, now()),
          }
        : null,
      lastRunCost: lastRun
        ? sum(
            lastRun.sessions.map((s) => factsRef(lastRun.id, s.sessionId)),
            costs,
          )
        : null,
      cost: sum(allRefs, costs),
      consentNeeded: provider ? !(await deps.store.hasConsent(accountId, studyId, provider)) : true,
      anonymised: access.anonymised,
      textAnalysed: access.textAnalysed,
    })
  }

  /** The interview view (US2): its turns with roles, verbatims where they are now, its facts. */
  const interview = async (accountId: string, studyId: string, sessionId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return err('SESSION_NOT_FOUND' as const)
    const [[i], runs, people, context, attributions] = await Promise.all([
      interviewsNow(deps, accountId, studyId, access, [session]),
      deps.store.runsOf(studyId),
      deps.sources.people(accountId, studyId, { assign: false }),
      deps.sources.context(accountId, studyId),
      deps.store.speakersOf(sessionId),
    ])
    if (!i) return err('SESSION_NOT_FOUND' as const)
    const mine = people?.[sessionId] ?? []
    const label = participantLabel(access.anonymised, people)
    const who = await whoOf(i.facts.map((f) => f.decidedBy))
    const costs = await deps.ai.costs(refsOf(runs, sessionId))
    const roles = new Map(
      (i.text?.turns ?? []).map((t) => [t.speaker, speakerRole(t.speaker, mine, attributions)]),
    )
    const visible = i.verbatims.filter((v) => !v.setAside)
    return ok({
      sessionId,
      title: session.title,
      state: i.state,
      anonymised: access.anonymised,
      cost: sum(refsOf(runs, sessionId), costs),
      turns:
        i.text?.turns.map((t) => ({
          id: t.id,
          speaker: t.speaker,
          role: roles.get(t.speaker)?.role ?? 'unknown',
          start: t.start,
          text: t.text,
        })) ?? null,
      verbatims: visible.map((v) => {
        const place = i.places.get(v.id)
        return {
          id: v.id,
          segmentId: place?.segmentId ?? v.segmentId,
          offset: place?.offset ?? v.offset,
          length: place?.length ?? v.length,
          text: v.text,
          participant: label(v.participant),
          reason: v.reason,
          origin: v.origin,
          lost: place === null,
          facts: i.facts.filter((f) => f.verbatimIds.includes(v.id)).map((f) => f.id),
        }
      }),
      facts: i.facts.map((f) => factView(f, i, label, who)),
      speakers: [...roles]
        .filter(([s, r]) => s !== null && (r.role === 'unknown' || attributions.has(s)))
        .map(([s]) => ({ label: s ?? '', participant: label(attributions.get(s ?? '') ?? null) })),
      participants: mine
        .filter((p) => p.role === 'interviewee')
        .map((p) => ({ code: p.code, label: label(p.code) ?? p.code })),
      themes: context.themes.map((t) => ({ id: t.id, title: t.title })),
    })
  }

  /** FR-018: every fact of the study, filtered, 50 a page. */
  const factsPage = async (
    accountId: string,
    studyId: string,
    filter: {
      status?: 'to-decide' | 'accepted' | 'rejected' | 'all' | undefined
      theme?: string | undefined
      polarity?: 'positive' | 'negative' | 'neutral' | undefined
      participant?: string | undefined
      sessionId?: string | undefined
      page: number
    },
  ) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const [interviews, people, context] = await Promise.all([
      interviewsNow(deps, accountId, studyId, access, sessions),
      deps.sources.people(accountId, studyId, { assign: false }),
      deps.sources.context(accountId, studyId),
    ])
    const label = participantLabel(access.anonymised, people)
    const who = await whoOf(interviews.flatMap((i) => i.facts.map((f) => f.decidedBy)))
    const status = filter.status ?? 'to-decide'
    const all = interviews.flatMap((i) => i.facts.map((f) => factView(f, i, label, who)))
    const shown = all.filter(
      (f) =>
        (status === 'all' ||
          (status === 'to-decide' && f.status === 'proposed') ||
          (status === 'accepted' && (f.status === 'accepted' || f.status === 'edited')) ||
          (status === 'rejected' && f.status === 'rejected')) &&
        (filter.theme === undefined ||
          (filter.theme === 'other' ? f.theme === null : f.theme?.id === filter.theme)) &&
        (filter.polarity === undefined || f.polarity === filter.polarity) &&
        (filter.participant === undefined || f.participants.includes(filter.participant)) &&
        (filter.sessionId === undefined || f.sessionId === filter.sessionId),
    )
    const start = (filter.page - 1) * PAGE_SIZE
    return ok({
      facts: shown.slice(start, start + PAGE_SIZE),
      total: shown.length,
      page: filter.page,
      pageSize: PAGE_SIZE,
      themes: context.themes.map((t) => ({ id: t.id, title: t.title })),
      participants: [...new Set(all.flatMap((f) => f.participants))].map((p) => ({
        code: p,
        label: p,
      })),
      interviews: sessions.map((s) => ({ sessionId: s.id, title: s.title })),
    })
  }

  return { overview, interview, factsPage }
}

export type AnalysisQueries = ReturnType<typeof makeAnalysisQueries>
