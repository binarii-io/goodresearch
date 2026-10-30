import { err, fold, ok } from '@goodresearch/shared'
import type { TermCategory, TermKind } from '../../domain/answer-check.ts'
import type { TermLanguage } from '../../domain/candidates.ts'
import { type ExcerptParts, excerptParts } from '../../domain/excerpts.ts'
import {
  fileChanged,
  isLive,
  type LexiconFailure,
  type LexiconRun,
  runRef,
  withStops,
} from '../../domain/lexicon-run.ts'
import { type LexiconTerm, toDecide } from '../../domain/lexicon-term.ts'
import { countOccurrences, type Occurrence, type Verdict } from '../../domain/occurrences.ts'
import type { TranscriptsDeps } from '../ports.ts'

export type EnrichmentState = 'no-transcript' | 'not-read' | 'changed' | 'to-decide' | 'read'

export type LexiconFilter = {
  readonly status?: 'to-decide' | 'accepted' | 'rejected' | 'all' | undefined
  readonly kind?: TermKind | undefined
  readonly category?: TermCategory | undefined
  readonly language?: TermLanguage | undefined
  readonly sessionId?: string | undefined
  readonly q?: string | undefined
  readonly cursor?: string | undefined
}

const PAGE = 50
const QUOTES_SHOWN = 3
/** Quotes per interview when every occurrence is asked for. */
const ALL_QUOTES = 500

const sum = (costs: readonly (number | null | undefined)[]): number | null =>
  costs.some((c) => c === null || c === undefined)
    ? null
    : costs.reduce<number>((a, c) => a + (c ?? 0), 0)

const matches = (t: LexiconTerm, f: LexiconFilter) => {
  const status = f.status ?? 'to-decide'
  if (status === 'to-decide' && !toDecide(t)) return false
  if (status === 'accepted' && t.status !== 'accepted' && t.status !== 'edited') return false
  if (status === 'rejected' && t.status !== 'rejected') return false
  if (f.kind && t.kind !== f.kind) return false
  if (f.category && t.category !== f.category) return false
  if (f.language && t.language !== f.language) return false
  const q = f.q ? fold(f.q.trim()) : ''
  return !q || [t.form, ...t.variants.map((v) => v.spelling)].some((s) => fold(s).includes(q))
}

/**
 * The occurrences of a term per interview, with their excerpts: places of several spellings that
 * overlap (a phrase and one of its words) show once, the longer match kept; `limit` quotes each.
 */
const perInterview = (
  rows: readonly Occurrence[],
  segments: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>,
  limit: number,
  /** The term's verdicts in the study. */
  verdicts: readonly Verdict[],
) => {
  const bySession = new Map<string, Occurrence[]>()
  for (const o of rows) bySession.set(o.sessionId, [...(bySession.get(o.sessionId) ?? []), o])
  return [...bySession].map(([sessionId, list]) => {
    const places = list
      .flatMap((o) => o.anchors.map((a) => ({ ...a, length: a.length ?? o.spelling.length })))
      .sort(
        (a, b) =>
          a.segmentId.localeCompare(b.segmentId) || a.offset - b.offset || b.length - a.length,
      )
    const kept: typeof places = []
    for (const p of places) {
      const last = kept.at(-1)
      if (last && last.segmentId === p.segmentId && p.offset < last.offset + last.length) continue
      kept.push(p)
    }
    // Only verdicts on places that still hold the term (a changed turn leaves its verdicts behind).
    const here = new Set(kept.map((p) => `${p.segmentId}/${p.offset}`))
    const mine = verdicts.filter(
      (v) => v.sessionId === sessionId && here.has(`${v.segmentId}/${v.offset}`),
    )
    const verdictAt = (segmentId: string, offset: number) =>
      mine.find((v) => v.segmentId === segmentId && v.offset === offset)?.verdict ?? null
    const quotes: (ExcerptParts & {
      segmentId: string
      offset: number
      verdict: Verdict['verdict'] | null
    })[] = []
    for (const p of kept) {
      if (quotes.length >= limit) break
      const text = segments.get(p.segmentId)
      if (text)
        quotes.push({
          ...excerptParts(text, p.offset, p.offset + p.length),
          segmentId: p.segmentId,
          offset: p.offset,
          verdict: verdictAt(p.segmentId, p.offset),
        })
    }
    return {
      sessionId,
      title: titles.get(sessionId) ?? '',
      count: list.reduce((a, o) => a + o.count, 0),
      yes: mine.filter((v) => v.verdict === 'yes').length,
      no: mine.filter((v) => v.verdict === 'no').length,
      unsure: mine.filter((v) => v.verdict === 'unsure').length,
      quotes,
    }
  })
}

/** Spec 010: the Enrichment tab and the team lexicon, as one study shows them. */
export const makeEnrichmentQueries = (deps: TranscriptsDeps) => {
  const studyOf = async (accountId: string, studyId: string) => {
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    if (!found) return err('FOLDER_ACCESS_REQUIRED' as const)
    return ok({ access, ...found })
  }

  /** The team's terms found in the study's validated interviews, with their occurrences there. */
  const studyTerms = async (teamId: string, studyId: string, validated: ReadonlySet<string>) => {
    const [terms, occurrences] = await Promise.all([
      deps.store.teamTerms(teamId),
      deps.store.occurrencesOf(studyId),
    ])
    const byTerm = new Map<string, Occurrence[]>()
    for (const o of occurrences)
      if (validated.has(o.sessionId)) byTerm.set(o.termId, [...(byTerm.get(o.termId) ?? []), o])
    return {
      terms: terms.filter((t) => t.status !== 'merged' && byTerm.has(t.id)),
      byTerm,
    }
  }

  const enrichment = async (accountId: string, studyId: string) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions, toValidate } = study.value
    const validated = new Set(sessions.map((s) => s.id))
    const [transcripts, runs, { terms, byTerm }] = await Promise.all([
      deps.store.transcriptsOf(studyId),
      deps.store.runsOf(studyId),
      studyTerms(access.teamId, studyId, validated),
    ])
    const imported = new Map(transcripts.map((t) => [t.sessionId, t]))
    const open = runs.find((r) => r.finishedAt === null) ?? null
    // An interview a person stopped shows as stopped at once, before the reading gets to it.
    const live = isLive(open, deps.clock.now()) ? withStops(open) : null
    const shown: LexiconRun | null = live ?? runs[0] ?? null
    const toDecideIn = new Map<string, number>()
    for (const t of terms)
      if (toDecide(t))
        for (const o of new Set((byTerm.get(t.id) ?? []).map((x) => x.sessionId)))
          toDecideIn.set(o, (toDecideIn.get(o) ?? 0) + 1)

    const interviews = sessions.map((s) => {
      const t = imported.get(s.id)
      const reading = live?.sessions.find((r) => r.sessionId === s.id) ?? null
      const last = runs.flatMap((r) => r.sessions).find((r) => r.sessionId === s.id)
      const state: EnrichmentState = !s.transcript
        ? 'no-transcript'
        : !t
          ? 'not-read'
          : fileChanged(s, t)
            ? 'changed'
            : !t.readAt
              ? 'not-read'
              : (toDecideIn.get(s.id) ?? 0) > 0
                ? 'to-decide'
                : 'read'
      return {
        sessionId: s.id,
        title: s.title,
        interviewDate: s.interviewDate,
        state,
        toDecide: toDecideIn.get(s.id) ?? 0,
        readAt: t?.readAt ? t.readAt.toISOString() : null,
        reading: reading?.state ?? null,
        // The live reading first: an interview stopped there shows so before the reading gets to it.
        failure: ((reading ?? last)?.state === 'failed'
          ? ((reading ?? last)?.failure ?? null)
          : null) as LexiconFailure | null,
      }
    })

    const costs = await deps.ai.costs(runs.map((r) => runRef(r.id)))
    const names = await deps.store.accountNames(shown ? [shown.startedBy] : [])
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      interviews,
      toValidate,
      counts: {
        read: interviews.filter((i) => i.state === 'read' || i.state === 'to-decide').length,
        toDecide: terms.filter(toDecide).length,
        accepted: terms.filter((t) => t.status === 'accepted' || t.status === 'edited').length,
      },
      run: shown
        ? {
            id: shown.id,
            phase: shown.phase,
            total: shown.sessions.length,
            done: shown.sessions.filter((r) => r.state === 'done').length,
            failed: shown.sessions.filter((r) => r.state === 'failed').length,
            leftOut: shown.leftOut,
            batchesTotal: shown.batchesTotal,
            batchesDone: shown.batchesDone,
            failure: shown.failure,
            startedBy: names.has(shown.startedBy)
              ? { id: shown.startedBy, name: names.get(shown.startedBy) ?? '' }
              : null,
            finished: shown.finishedAt !== null || shown !== live,
          }
        : null,
      lastRunCost: runs[0] ? (costs.get(runRef(runs[0].id)) ?? null) : null,
      cost: runs.length ? sum(runs.map((r) => costs.get(runRef(r.id)))) : 0,
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, studyId, provider))
        : false,
      anonymised: access.anonymised,
    })
  }

  const lexicon = async (accountId: string, studyId: string, filter: LexiconFilter) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const titles = new Map(sessions.map((s) => [s.id, s.title]))
    const { terms, byTerm } = await studyTerms(access.teamId, studyId, new Set(titles.keys()))
    const total = (t: LexiconTerm) => (byTerm.get(t.id) ?? []).reduce((a, o) => a + o.count, 0)
    const all = terms
      .filter((t) => matches(t, filter))
      .filter(
        (t) =>
          !filter.sessionId ||
          (byTerm.get(t.id) ?? []).some((o) => o.sessionId === filter.sessionId),
      )
      .sort((a, b) => total(b) - total(a) || a.form.localeCompare(b.form))
    const from = Math.max(0, Number(filter.cursor ?? 0) || 0)
    const page = all.slice(from, from + PAGE)
    const [transcripts, others, names, verdicts] = await Promise.all([
      deps.store.transcriptsOf(studyId),
      deps.store.otherStudies(
        page.map((t) => t.id),
        studyId,
      ),
      deps.store.accountNames(page.flatMap((t) => (t.decidedBy ? [t.decidedBy] : []))),
      deps.store.verdictsOf(studyId),
    ])
    const segments = new Map(transcripts.flatMap((t) => t.segments.map((s) => [s.id, s.text])))
    const view = (t: LexiconTerm) => {
      const occurrences = perInterview(
        byTerm.get(t.id) ?? [],
        segments,
        titles,
        QUOTES_SHOWN,
        verdicts.filter((v) => v.termId === t.id),
      )
      return {
        id: t.id,
        version: t.version,
        form: t.form,
        kind: t.kind,
        correction: t.correction,
        category: t.category,
        definition: t.definition,
        language: t.language,
        scope: t.scope,
        status: t.status,
        origin: t.origin,
        quote: t.quote,
        variants: t.variants.map((v) => ({ ...v })),
        occurrences,
        otherStudies: others.get(t.id) ?? 0,
        decidedBy:
          t.decidedBy && names.has(t.decidedBy)
            ? { id: t.decidedBy, name: names.get(t.decidedBy) ?? '' }
            : null,
        decidedAt: t.decidedAt ? t.decidedAt.toISOString() : null,
      }
    }
    return ok({
      terms: page.map(view),
      next: from + PAGE < all.length ? String(from + PAGE) : null,
      total: all.length,
      pageSize: PAGE,
    })
  }

  /**
   * Every occurrence of one term in the study, counted now in the imported text (never stale), up
   * to 500 quotes per interview.
   */
  const occurrences = async (accountId: string, studyId: string, termId: string) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const term = await deps.store.getTerm(termId)
    if (!term || term.teamId !== access.teamId || term.status === 'merged')
      return err('TERM_NOT_FOUND' as const)
    const titles = new Map(sessions.map((s) => [s.id, s.title]))
    const transcripts = (await deps.store.transcriptsOf(studyId)).filter((t) =>
      titles.has(t.sessionId),
    )
    const rows = countOccurrences(
      transcripts.map((t) => ({
        sessionId: t.sessionId,
        language: t.language,
        segments: t.segments,
      })),
      [term],
      ALL_QUOTES,
    )
    const segments = new Map(transcripts.flatMap((t) => t.segments.map((s) => [s.id, s.text])))
    const verdicts = (await deps.store.verdictsOf(studyId)).filter((v) => v.termId === termId)
    return ok({ occurrences: perInterview(rows, segments, titles, ALL_QUOTES, verdicts) })
  }

  return { enrichment, lexicon, occurrences }
}

export type EnrichmentQueries = ReturnType<typeof makeEnrichmentQueries>
