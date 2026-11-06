import { err, ok, sumCosts } from '@goodresearch/shared'
import { type CleaningState, cleaningState } from '../../domain/cleaning-state.ts'
import {
  type CleaningFailure,
  type CorrectionRun,
  cleaningRefs,
  interviewRefs,
  isCleaningLive,
} from '../../domain/correction-run.ts'
import {
  type Confidence,
  type CorrectionKind,
  type CorrectionSource,
  effectiveOf,
  fingerprint,
  isEffective,
  isToDecide,
  type Resolved,
  resolveCorrections,
  toDecideAmong,
} from '../../domain/corrections.ts'
import type { LexiconTerm } from '../../domain/lexicon-term.ts'
import type { Segment } from '../../domain/segments.ts'
import { loadCorrections } from '../cleaning-corrections.ts'
import type { CleaningDeps } from '../ports.ts'

export type CorrectionFilter = {
  readonly status?: 'to-decide' | 'accepted' | 'rejected' | 'all' | undefined
  readonly source?: CorrectionSource | undefined
  readonly kind?: CorrectionKind | undefined
  readonly confidence?: Confidence | undefined
  /** Only the turns with a correction shown (default). */
  readonly onlyCorrected?: boolean | undefined
}

/** Spec 034: turns shown before and after a turn whose context is asked. */
const AROUND = 2

const byTurn = (shown: readonly Resolved[]) => {
  const out = new Map<string, Resolved[]>()
  for (const c of shown) out.set(c.segmentId, [...(out.get(c.segmentId) ?? []), c])
  return out
}

/** Turns as the review shows them, each with its corrections (speaker first, then in order). */
const turnsView = (
  segments: readonly Segment[],
  bySegment: ReadonlyMap<string, readonly Resolved[]>,
  terms: ReadonlyMap<string, LexiconTerm>,
  names: ReadonlyMap<string, string>,
) =>
  segments.map((s) => ({
    id: s.id,
    speaker: s.speaker,
    start: s.start,
    text: s.text,
    corrections: [...(bySegment.get(s.id) ?? [])]
      .sort((a, b) =>
        a.target === b.target ? a.offset - b.offset : a.target === 'speaker' ? -1 : 1,
      )
      .map((c) => {
        const term = c.termId ? terms.get(c.termId) : undefined
        return {
          key: c.key,
          segmentId: c.segmentId,
          target: c.target,
          offset: c.offset,
          length: c.length,
          original: c.original,
          replacement: c.edited ?? c.replacement,
          kind: c.kind,
          source: c.source,
          reason: c.reason,
          confidence: c.confidence,
          status: c.status,
          term: term ? { id: term.id, form: term.form } : null,
          decidedBy: c.decidedBy ? { id: c.decidedBy, name: names.get(c.decidedBy) ?? null } : null,
          decidedAt: c.decidedAt?.toISOString() ?? null,
          version: c.version,
          overridden: c.overridden,
        }
      }),
  }))

/**
 * What a status filter shows: "to decide" and "accepted" are exactly what their counts take (the
 * same domain rules); a correction set aside at its place shows under "all", marked (spec 034).
 */
const statusMatches = (c: Resolved, f: CorrectionFilter['status']) =>
  !f ||
  f === 'all' ||
  (f === 'to-decide' && isToDecide(c)) ||
  (f === 'accepted' && isEffective(c)) ||
  (f === 'rejected' && c.status === 'rejected')

/** Spec 011: the Cleaning view of the Enrichment tab and the review of one interview. */
export const makeCleaningQueries = (deps: CleaningDeps) => {
  const studyOf = async (accountId: string, studyId: string) => {
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    if (!found) return err('FOLDER_ACCESS_REQUIRED' as const)
    return ok({ access, sessions: found.sessions })
  }

  const progressOf = async (run: CorrectionRun | undefined) => {
    if (!run) return null
    // A run that died without finishing shows as finished (a new one may start).
    const finished = run.finishedAt !== null || !isCleaningLive(run, deps.clock.now())
    const names = await deps.store.accountNames([run.startedBy])
    return {
      id: run.id,
      mode: run.mode,
      total: run.sessions.length,
      done: run.sessions.filter((s) => s.state === 'done').length,
      failed: run.sessions.filter((s) => s.state === 'failed').length,
      chunks: run.sessions.reduce((n, s) => n + s.chunks, 0),
      chunksDone: run.sessions.reduce((n, s) => n + s.chunksDone, 0),
      leftOut: run.leftOut,
      failure: run.failure,
      startedBy: { id: run.startedBy, name: names.get(run.startedBy) ?? null },
      finished,
    }
  }

  const cleaningList = async (accountId: string, studyId: string) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const [transcripts, cleanings, latest, publications, runs, terms, verdicts, folder] =
      await Promise.all([
        deps.store.transcriptsOf(studyId),
        deps.cleaning.cleaningsOf(studyId),
        deps.cleaning.latestVersions(studyId),
        deps.cleaning.publicationsOf(studyId),
        deps.cleaning.cleaningRunsOf(studyId),
        deps.store.teamTerms(access.teamId),
        deps.store.verdictsOf(studyId),
        deps.cleaning.folderOf(studyId),
      ])
    // Read once for every interview, never written by a query (review of PR #11).
    const names = access.anonymised
      ? await deps.cleaningNames(accountId, studyId, { assign: false })
      : null
    const byId = new Map(transcripts.map((t) => [t.sessionId, t]))
    // Spec 032: each interview's own rows, read once for the whole list.
    const ids = sessions.filter((s) => byId.has(s.id)).map((s) => s.id)
    const [suggestions, stored, decisions] = await Promise.all([
      deps.cleaning.suggestionsOfSessions(ids),
      deps.cleaning.correctionsOfSessions(ids),
      deps.cleaning.decisionsOfSessions(ids),
    ])
    const cleaned = new Map(cleanings.map((c) => [c.sessionId, c]))
    const lastRun = runs[0]
    // What each run cost, and each interview of it (FR-016, as an analysis per interview).
    const aiRuns = runs.filter((r) => r.mode === 'ai')
    const costs = await deps.ai.costs(aiRuns.flatMap(cleaningRefs))
    const runCost = (r: CorrectionRun) => sumCosts(cleaningRefs(r).map((ref) => costs.get(ref)))
    const interviewCost = (sessionId: string) =>
      sumCosts(
        aiRuns
          .filter((r) => r.sessions.some((x) => x.sessionId === sessionId))
          .flatMap((r) => interviewRefs(r, sessionId).map((ref) => costs.get(ref))),
      )
    const interviews = await Promise.all(
      sessions.map(async (s) => {
        const t = byId.get(s.id)
        const failure = (lastRun?.sessions.find((x) => x.sessionId === s.id)?.failure ??
          null) as CleaningFailure | null
        const published = publications.get(s.id) ?? null
        const base = {
          sessionId: s.id,
          title: s.title,
          interviewDate: s.interviewDate,
          cleanedAt: cleaned.get(s.id)?.cleanedAt.toISOString() ?? null,
          cost: interviewCost(s.id),
          failure,
          published: published
            ? { webLink: published.webLink, versionNumber: published.versionNumber }
            : null,
        }
        if (!s.transcript || !t)
          return {
            ...base,
            state: (s.transcript ? 'not-cleaned' : 'no-transcript') as CleaningState,
            toDecide: 0,
            accepted: 0,
          }
        const { all } = await loadCorrections(deps, {
          accountId,
          studyId,
          teamId: access.teamId,
          anonymised: access.anonymised,
          transcript: t,
          preloaded: {
            terms,
            verdicts,
            people: names?.people ?? null,
            interview: {
              suggestions: suggestions.get(s.id) ?? [],
              stored: stored.get(s.id) ?? [],
              decisions: decisions.get(s.id) ?? new Map(),
            },
          },
        })
        const resolved = resolveCorrections(all)
        const effective = effectiveOf(resolved)
        const toDecide = toDecideAmong(resolved).length
        const version = latest.get(s.id) ?? null
        return {
          ...base,
          state: cleaningState({
            importedAt: t.importedAt,
            cleaning: cleaned.get(s.id) ?? null,
            latest: version,
            anonymised: access.anonymised,
            toDecide,
            fingerprint: fingerprint(effective),
            published,
          }),
          toDecide,
          accepted: effective.length,
        }
      }),
    )
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      interviews,
      counts: {
        clean: interviews.filter((i) => ['clean', 'published', 'out-of-date'].includes(i.state))
          .length,
        toDecide: interviews.reduce((n, i) => n + i.toDecide, 0),
      },
      run: await progressOf(lastRun),
      lastRunCost: lastRun ? (lastRun.mode === 'lexicon' ? 0 : runCost(lastRun)) : null,
      cost: sumCosts(aiRuns.map(runCost)),
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, studyId, provider, 'cleaning'))
        : false,
      anonymised: access.anonymised,
      folder: folder ? { name: folder.name } : null,
    })
  }

  const interviewCleaning = async (
    accountId: string,
    studyId: string,
    sessionId: string,
    filter: CorrectionFilter,
  ) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const session = sessions.find((s) => s.id === sessionId)
    const t = session ? await deps.store.getTranscript(sessionId) : null
    if (!session || !t || t.studyId !== studyId) return err('SESSION_NOT_FOUND' as const)
    const [{ all }, versions, published, cleanings] = await Promise.all([
      loadCorrections(deps, {
        accountId,
        studyId,
        teamId: access.teamId,
        anonymised: access.anonymised,
        transcript: t,
      }),
      deps.cleaning.versionsOf(sessionId),
      deps.cleaning.publicationOf(sessionId),
      deps.cleaning.cleaningsOf(studyId),
    ])
    const mine = (await deps.cleaning.cleaningRunsOf(studyId)).filter(
      (r) => r.mode === 'ai' && r.sessions.some((x) => x.sessionId === sessionId),
    )
    const refs = mine.flatMap((r) => interviewRefs(r, sessionId))
    const costs = await deps.ai.costs(refs)
    const terms = new Map((await deps.store.teamTerms(access.teamId)).map((x) => [x.id, x]))
    const resolved = resolveCorrections(all)
    const effective = effectiveOf(resolved)
    const toDecide = toDecideAmong(resolved).length
    const names = await deps.store.accountNames([
      ...resolved.flatMap((c) => (c.decidedBy ? [c.decidedBy] : [])),
      ...versions.map((v) => v.createdBy),
    ])
    // A duplicate (spec 034: the same change as the one listed there) is never shown.
    const shown = resolved.filter(
      (c) =>
        !c.duplicate &&
        statusMatches(c, filter.status) &&
        (!filter.source || c.source === filter.source) &&
        (!filter.kind || c.kind === filter.kind) &&
        (!filter.confidence || c.confidence === filter.confidence),
    )
    const bySegment = byTurn(shown)
    const latest = versions[0]
    const cleaning = cleanings.find((c) => c.sessionId === sessionId) ?? null
    return ok({
      sessionId,
      title: session.title,
      language: t.language,
      anonymised: access.anonymised,
      state: cleaningState({
        importedAt: t.importedAt,
        cleaning,
        latest: latest ?? null,
        anonymised: access.anonymised,
        toDecide,
        fingerprint: fingerprint(effective),
        published,
      }),
      fingerprint: fingerprint(effective),
      /** What this interview's cleanings cost (USD, every account). */
      cost: sumCosts(refs.map((ref) => costs.get(ref))),
      speakers: [...new Set(t.segments.flatMap((s) => (s.speaker ? [s.speaker] : [])))],
      turns: turnsView(
        t.segments.filter((s) => filter.onlyCorrected === false || bySegment.has(s.id)),
        bySegment,
        terms,
        names,
      ),
      counts: {
        toDecide,
        accepted: effective.length,
        rejected: resolved.filter((c) => c.status === 'rejected' && !c.duplicate).length,
      },
      versions: versions.map((v) => ({
        number: v.number,
        createdAt: v.createdAt.toISOString(),
        createdBy: { id: v.createdBy, name: names.get(v.createdBy) ?? null },
      })),
      published: published
        ? { webLink: published.webLink, versionNumber: published.versionNumber }
        : null,
    })
  }

  /**
   * Spec 034: the conversation around one turn — it and up to two turns before and after, as the
   * review shows them, every correction not rejected in place. Reads the interview's corrections
   * (names and lexicon need the whole transcript), nothing about its versions, runs or costs.
   */
  const turnContext = async (
    accountId: string,
    studyId: string,
    sessionId: string,
    turnId: string,
  ) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const t = sessions.some((s) => s.id === sessionId)
      ? await deps.store.getTranscript(sessionId)
      : null
    if (!t || t.studyId !== studyId) return err('SESSION_NOT_FOUND' as const)
    const at = t.segments.findIndex((x) => x.id === turnId)
    if (at < 0) return err('TURN_NOT_FOUND' as const)
    const near = t.segments.slice(Math.max(0, at - AROUND), at + AROUND + 1)
    const ids = new Set(near.map((x) => x.id))
    const [{ all }, teamTerms] = await Promise.all([
      loadCorrections(deps, {
        accountId,
        studyId,
        teamId: access.teamId,
        anonymised: access.anonymised,
        transcript: t,
      }),
      deps.store.teamTerms(access.teamId),
    ])
    const shown = resolveCorrections(all).filter(
      (c) => ids.has(c.segmentId) && !c.duplicate && c.status !== 'rejected',
    )
    const names = await deps.store.accountNames(
      shown.flatMap((c) => (c.decidedBy ? [c.decidedBy] : [])),
    )
    const terms = new Map(teamTerms.map((x) => [x.id, x]))
    return ok({ turns: turnsView(near, byTurn(shown), terms, names) })
  }

  /** The latest clean version of an interview, for later phases (plan: `latestClean`). */
  const latestClean = async (sessionId: string) =>
    (await deps.cleaning.versionsOf(sessionId))[0] ?? null

  return { cleaningList, interviewCleaning, turnContext, latestClean }
}

export type CleaningQueries = ReturnType<typeof makeCleaningQueries>
