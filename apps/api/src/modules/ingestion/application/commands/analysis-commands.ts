import { err, newId, ok, type Result } from '@goodresearch/shared'
import {
  type Analysis,
  type AnalysisFailure,
  decideProposals,
  filesChanged,
  isDate,
  markAlreadySet,
  mergeProposals,
  newToDecide,
  type Proposal,
  type ProposalDecision,
  READ_MAX,
  READ_WINDOW,
  released,
  ruleProposals,
} from '../../domain/analysis.ts'
import { attachmentCandidates } from '../../domain/attachments.ts'
import { GOOGLE_DOC_MIME } from '../../domain/classify.ts'
import { DriveConnectionLost, TranscriptUnreadable } from '../../domain/drive-gateway.ts'
import {
  chipNames,
  completeNames,
  matchMembers,
  type Person,
  participantsOf,
  personName,
} from '../../domain/header-rules.ts'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { attachmentLabel, normalisedBase } from '../../domain/normalised-name.ts'
import { nameKey } from '../../domain/pseudonyms.ts'
import { fromPlaceholders, QUOTE_MAX, quoteFound, withPlaceholders } from '../../domain/quotes.ts'
import { decide, personDecided, type Session, splitNames } from '../../domain/session.ts'
import { looksLikeTranscript } from '../../domain/transcript-text.ts'
import { resolveStudyAccess } from '../access.ts'
import { readRefreshToken } from '../connection.ts'
import {
  type Actor,
  AiUnavailable,
  type AnalysisRun,
  type IngestionDeps,
  type PlannedSummary,
} from '../ports.ts'
import { makePlannedSync } from './planned-sync.ts'

/** The ledger ref of a session's analyses: its cost is the sum of their entries (FR-010). */
export const analysisRef = (sessionId: string) => `session-analysis:${sessionId}`

/** Sessions analyzed at once in a run (SC-007). */
const RUN_PARALLEL = 3
/** A run without heartbeat for this long is stale (research R6). */
export const RUN_STALE_MS = 10 * 60_000
/** Tokens the AI answers with, at most, for the estimate. */
const ANSWER_TOKENS = 1_000
const WRITE_ATTEMPTS = 3
/** Characters of meeting notes read for the invited people. */
const NOTES_WINDOW = 3_000
/** The exclusion reason the app writes for a summary (shown in the person's language). */
export const NOT_A_TRANSCRIPT_REASON = 'not-a-transcript'
/** Reading a transcript is tried twice before Drive is said unavailable. */
const READ_ATTEMPTS = 2

type Failure =
  | 'SESSION_NOT_FOUND'
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NOT_AN_INTERVIEW_STUDY'
  | 'SESSION_DECIDED'
  | 'ANALYSIS_CONSENT_REQUIRED'
  | 'ANALYSIS_RUNNING'
  | 'NOTHING_TO_ANALYZE'
  | 'VERSION_CONFLICT'
  | 'PROPOSAL_NOT_FOUND'
  | 'VALIDATION'
  | 'MEDIA_UNAVAILABLE'

/** What the analyses of one study read once (files, sessions, schedule, members, Drive access). */
type StudyContext = {
  readonly studyId: string
  readonly anonymised: boolean
  readonly files: readonly InventoryFile[]
  readonly fileById: ReadonlyMap<string, InventoryFile>
  readonly sessions: readonly Session[]
  readonly schedule: readonly PlannedSummary[] | null
  readonly members: readonly { id: string; name: string }[]
  readonly token: string | null
}

export const isLive = (run: AnalysisRun | null, now: Date): run is AnalysisRun =>
  run !== null &&
  run.state === 'running' &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/**
 * Spec 009: analyzing the interviews. The app's rules run first; the AI is asked only for what is
 * still missing, with its quotes checked; proposals never overwrite what a person decided.
 */
export const makeAnalysisCommands = (deps: IngestionDeps) => {
  const sync = makePlannedSync(deps)
  const contextOf = async (
    accountId: string,
    studyId: string,
  ): Promise<Result<StudyContext, Failure>> => {
    const access = await resolveStudyAccess(deps, accountId, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (access.kind !== 'full') return err('FOLDER_ACCESS_REQUIRED')
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY')
    const [files, sessions, schedule, members, connection] = await Promise.all([
      deps.store.listFiles(studyId, {}),
      deps.store.listSessions(studyId),
      deps.schedule.list(accountId, studyId),
      deps.members.ofTeam(access.teamId),
      deps.store.getConnection(accountId),
    ])
    return ok({
      studyId,
      anonymised: access.anonymised,
      files,
      fileById: new Map(files.map((f) => [f.id, f])),
      sessions,
      schedule,
      members,
      token: deps.drive ? await readRefreshToken(deps, connection) : null,
    })
  }

  /**
   * Every interviewee of the study with the date of their interview (accepted or proposed): the
   * pseudonyms follow the order of the dates whatever the order of the analyses (research R10).
   */
  const studyInterviewees = (
    ctx: StudyContext,
    extra: readonly { name: string; date: string | null }[] = [],
  ) => [
    ...ctx.sessions.flatMap((o) => {
      const proposed = o.analysis?.proposals ?? []
      const date =
        o.interviewDate ??
        (proposed.find((p) => p.field === 'date')?.value as string | undefined) ??
        (o.transcriptFileId
          ? ctx.fileById.get(o.transcriptFileId)?.modifiedAt?.slice(0, 10)
          : null) ??
        null
      // Accepted interviewees, and proposed ones not rejected: the codes follow the dates of
      // the interviews, and a rejected name never gets one.
      return [
        ...o.roster.filter((r) => r.role === 'interviewee').map((r) => r.name),
        ...proposed.flatMap((p) =>
          p.field === 'interviewees' && p.status !== 'rejected' ? p.value.map((v) => v.name) : [],
        ),
      ].map((name) => ({ key: nameKey(name), date }))
    }),
    ...extra.map((e) => ({ key: nameKey(e.name), date: e.date })),
  ]

  /** Names the app knows: replaced by placeholders before the AI under anonymisation (R4). */
  const knownNames = (ctx: StudyContext, s: Session) => [
    ...(ctx.schedule ?? []).flatMap((p) => [p.interviewee, ...splitNames(p.interviewers)]),
    ...s.roster.map((r) => r.name),
    ...ctx.members.map((m) => m.name),
  ]

  const readText = async (
    ctx: StudyContext,
    file: InventoryFile,
    maxChars: number,
  ): Promise<{ text: string | null; failure: AnalysisFailure | null }> => {
    if (!deps.drive || !ctx.token) return { text: null, failure: 'DRIVE_NOT_CONNECTED' }
    // A network failure (DNS, timeout, outage) is tried once more, then reported on the row.
    for (let attempt = 1; ; attempt++) {
      try {
        const text = await deps.drive.gateway.readTextStart(ctx.token, file, maxChars)
        return text === null ? { text: null, failure: 'FILE_NOT_FOUND' } : { text, failure: null }
      } catch (error) {
        if (error instanceof TranscriptUnreadable)
          return { text: null, failure: 'UNREADABLE_FORMAT' }
        if (error instanceof DriveConnectionLost)
          return { text: null, failure: 'DRIVE_NOT_CONNECTED' }
        if (attempt >= READ_ATTEMPTS) {
          deps.log.warn(
            { err: error instanceof Error ? error.message : 'unknown', fileId: file.id },
            'transcript not read: Drive unavailable',
          )
          return { text: null, failure: 'DRIVE_UNAVAILABLE' }
        }
      }
    }
  }

  /** One analysis (research R3, R4): the proposals, not merged yet with the previous ones. */
  const analyze = async (
    accountId: string,
    s: Session,
    ctx: StudyContext,
    runId: string | null,
  ): Promise<Analysis> => {
    const transcript = s.transcriptFileId ? ctx.fileById.get(s.transcriptFileId) : undefined
    const media = s.media.flatMap((m) => {
      const f = ctx.fileById.get(m.fileId)
      return f ? [f] : []
    })
    const planned = s.plannedInterviewId
      ? (ctx.schedule?.find((p) => p.id === s.plannedInterviewId) ?? null)
      : null
    // Meeting notes of a document: the invited people, with their full names (spec 009).
    const notes =
      transcript?.mimeType === GOOGLE_DOC_MIME && ctx.token && deps.drive
        ? ((await deps.drive.gateway
            .readNotesStart(ctx.token, transcript.id, NOTES_WINDOW)
            .catch(() => null)) ?? '')
        : ''
    const invited = [...new Set([...chipNames(notes), ...participantsOf(notes)])]
    const input = (text: string | null) => ({
      invited,
      text,
      transcriptName: transcript?.name ?? null,
      mediaNames: media.map((m) => m.name),
      fileDate: (transcript ?? media[0])?.modifiedAt ?? null,
      planned,
      members: ctx.members,
    })

    let failure: AnalysisFailure | null = null
    let text: string | null = null
    if (s.transcriptFileId) {
      if (!transcript) failure = 'FILE_NOT_FOUND'
      else ({ text, failure } = await readText(ctx, transcript, READ_WINDOW))
    }
    // Spec 009: a file without speaker turns is a summary, not a transcript (no AI asked).
    if (text && !looksLikeTranscript(text)) {
      failure = 'NOT_A_TRANSCRIPT'
      text = null
    }
    let rules = ruleProposals(input(text))
    // Nobody told apart in the first part: read once more, up to twice as far (FR-002).
    if (transcript && text && rules.needsAi && text.length >= READ_WINDOW) {
      const longer = await readText(ctx, transcript, READ_MAX)
      if (longer.text) {
        text = longer.text
        rules = ruleProposals(input(text))
      }
    }

    let interviewees: {
      value: readonly Person[]
      origin: Proposal['origin']
      quote: string | null
    } | null = rules.interviewees ? { ...rules.interviewees, quote: null } : null
    let interviewers: {
      value: readonly Person[]
      origin: Proposal['origin']
      quote: string | null
    } | null = rules.interviewers ? { ...rules.interviewers, quote: null } : null
    let date = rules.date ? { ...rules.date, quote: null as string | null } : null
    let usedAi = false

    if (rules.needsAi && text && !failure) {
      const sent = ctx.anonymised
        ? withPlaceholders(text, knownNames(ctx, s))
        : { text, names: new Map<string, string>() }
      const back = (t: string) => fromPlaceholders(t, sent.names)
      try {
        usedAi = true
        const answer = await deps.analyzer.analyze(accountId, analysisRef(s.id), sent.text)
        // Constitution IV: a proposal is kept only with a quote found in the text sent.
        const found = (people: readonly { name: string; quote: string }[]) =>
          people
            // A long quote is cut: its beginning is still an exact excerpt.
            .map((p) => ({ ...p, quote: p.quote.slice(0, QUOTE_MAX) }))
            .filter((p) => p.name.trim() && quoteFound(sent.text, p.quote))
            .slice(0, 10)
            .map((p) => ({
              name: (completeNames([personName(back(p.name))], invited)[0] ?? '').slice(0, 120),
              quote: back(p.quote),
            }))
        const ees = found(answer.interviewees)
        const ers = found(answer.interviewers)
        if (!interviewees && ees[0])
          interviewees = {
            value: ees.map((p) => ({ name: p.name, memberId: null })),
            origin: 'ai',
            quote: ees[0].quote,
          }
        if (!interviewers && ers[0]) {
          const matched = matchMembers(
            ers.map((p) => p.name),
            ctx.members,
          )
          interviewers = {
            value: [
              ...matched.interviewers,
              ...matched.others.map((name) => ({ name, memberId: null })),
            ],
            origin: 'ai',
            quote: ers[0].quote,
          }
        }
        const aiDate = answer.date
        if (
          (!date || date.origin === 'file-date') &&
          aiDate &&
          isDate(aiDate.value) &&
          quoteFound(sent.text, aiDate.quote.slice(0, QUOTE_MAX))
        )
          date = {
            value: aiDate.value,
            origin: 'ai',
            otherDate: date?.value ?? null,
            quote: back(aiDate.quote.slice(0, QUOTE_MAX)),
          }
      } catch (error) {
        failure = error instanceof AiUnavailable ? 'AI_PROVIDER_REQUIRED' : 'AI_FAILED'
      }
    }

    const proposals: Proposal[] = []
    const common = { otherDate: null, status: 'proposed' as const }
    if (interviewees) proposals.push({ ...common, field: 'interviewees', ...interviewees })
    if (interviewers) proposals.push({ ...common, field: 'interviewers', ...interviewers })
    if (date)
      proposals.push({
        field: 'date',
        value: date.value,
        origin: date.origin,
        quote: date.quote,
        otherDate: date.otherDate,
        status: 'proposed',
      })
    if (rules.language)
      proposals.push({
        ...common,
        field: 'language',
        value: rules.language,
        origin: 'rule',
        quote: null,
      })

    // The name from what the interview holds, else what is proposed (research R8).
    const role = (r: 'interviewee' | 'interviewer') =>
      s.roster.filter((x) => x.role === r).map((x) => x.name)
    const nameDate = s.interviewDate ?? date?.value ?? null
    const people = role('interviewee').length
      ? role('interviewee')
      : (interviewees?.value.map((p) => p.name) ?? [])
    let shown = people
    if (ctx.anonymised && people.length) {
      const codes = await deps.store.ensurePseudonyms(
        ctx.studyId,
        studyInterviewees(
          ctx,
          people.map((name) => ({ name, date: nameDate })),
        ),
        deps.clock.now(),
      )
      shown = people.map((n) => codes.get(nameKey(n)) ?? 'P??')
    }
    const base = normalisedBase({
      date: nameDate,
      interviewees: shown,
      interviewers: role('interviewer').length
        ? role('interviewer')
        : (interviewers?.value.map((p) => p.name) ?? []),
    })
    if (base) proposals.push({ ...common, field: 'name', value: base, origin: 'rule', quote: null })

    const held = new Set(
      ctx.sessions
        .filter((o) => o.id !== s.id)
        .flatMap((o) => [
          ...(o.transcriptFileId ? [o.transcriptFileId] : []),
          ...o.media.map((m) => m.fileId),
          ...o.attachments.map((a) => a.fileId),
        ]),
    )
    // The label of an attachment is taken now, from its original name (renames keep it).
    const knownPeople = [
      ...s.roster.map((r) => r.name),
      ...(interviewees?.value ?? []).map((p) => p.name),
      ...(interviewers?.value ?? []).map((p) => p.name),
    ]
    for (const a of attachmentCandidates(s, ctx.files, held)) {
      const fileName = ctx.fileById.get(a.fileId)?.name ?? ''
      const label = attachmentLabel(fileName, knownPeople) || null
      proposals.push({
        ...common,
        field: 'attachment',
        value: { ...a, label },
        origin: 'rule',
        quote: null,
      })
    }

    return {
      state: failure ? 'failed' : 'done',
      failure,
      runId,
      by: accountId,
      at: deps.clock.now(),
      filesRead: [transcript, ...media]
        .filter((f): f is InventoryFile => f !== undefined)
        .map((f) => ({ fileId: f.id, name: f.name, modifiedAt: f.modifiedAt })),
      usedAi,
      proposals,
    }
  }

  /**
   * Writes the analysis of a session, merged with what a person decided meanwhile (research R7):
   * re-read and retried when the session changed.
   */
  const store = async (
    sessionId: string,
    change: (current: Session) => Analysis | null,
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const current = await deps.store.getSession(sessionId)
      if (!current) return false
      const next = change(current)
      if ((await deps.store.writeAnalysis(sessionId, current.version, next)) === 'saved')
        return true
    }
    return false
  }

  /**
   * A summary is not an interview: the app excludes it (no person decided it, so a refresh or a
   * person can still change it; "Back to review" brings it back).
   */
  const excludeSummary = async (sessionId: string, analysis: Analysis) => {
    if (analysis.failure !== 'NOT_A_TRANSCRIPT') return
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const current = await deps.store.getSession(sessionId)
      if (!current || current.state !== 'proposed' || personDecided(current)) return
      const next: Session = {
        ...current,
        state: 'excluded',
        excludedReason: NOT_A_TRANSCRIPT_REASON,
        decidedBy: null,
        decidedAt: deps.clock.now(),
        updatedAt: deps.clock.now(),
      }
      if ((await deps.store.saveSession(next, current.version)) === 'saved') return
    }
  }

  /**
   * Something new to decide sends a validated interview back to decide; what it holds and what
   * later phases made from it (cleaning, facts) are kept.
   */
  const reopenIfNew = async (sessionId: string, before: readonly Proposal[]) => {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const current = await deps.store.getSession(sessionId)
      if (!current || current.state !== 'validated') return
      if (!newToDecide(before, current.analysis?.proposals ?? [])) return
      const next = decide(current, 'reopen', current.decidedBy ?? '', deps.clock.now())
      if (!next.ok) return
      if ((await deps.store.saveSession(next.value, current.version)) === 'saved') return
    }
  }

  const merged = (analysis: Analysis) => (current: Session) => ({
    ...analysis,
    proposals: markAlreadySet(
      current,
      mergeProposals(current.analysis?.proposals ?? [], analysis.proposals),
    ),
  })

  /** FR-011: the person agreed to send transcripts of this study to their current provider. */
  const consented = async (
    accountId: string,
    studyId: string,
    consent: boolean,
  ): Promise<Result<true, 'ANALYSIS_CONSENT_REQUIRED'>> => {
    const provider = await deps.analyzer.providerOf(accountId)
    // Without a provider, nothing is sent: the app's rules alone run.
    if (!provider || (await deps.store.hasConsent(accountId, studyId, provider))) return ok(true)
    if (!consent) return err('ANALYSIS_CONSENT_REQUIRED')
    await deps.store.saveConsent(accountId, studyId, provider, deps.clock.now())
    return ok(true)
  }

  /** The sessions a run covers: not decided by a person, never analyzed, failed or changed. */
  /**
   * The sessions a run covers: not decided by a person, and never analyzed, failed or changed —
   * or all of them when the person asks to analyze again (decided proposals are kept).
   */
  const toAnalyze = (ctx: StudyContext, all = false) =>
    ctx.sessions.filter(
      (s) =>
        !personDecided(s) &&
        (all ||
          !s.analysis ||
          // Failed, or left waiting by a run that stopped (a live run refuses a new one).
          s.analysis.state !== 'done' ||
          filesChanged(s, ctx.fileById)),
    )

  return {
    analyzeSession: async (c: {
      actor: Actor
      sessionId: string
      consent?: boolean | undefined
    }): Promise<Result<{ id: string }, Failure>> => {
      const s = await deps.store.getSession(c.sessionId)
      if (!s) return err('SESSION_NOT_FOUND')
      const ctx = await contextOf(c.actor.id, s.studyId)
      if (!ctx.ok) return ctx.error === 'STUDY_NOT_FOUND' ? err('SESSION_NOT_FOUND') : ctx
      // A validated interview can be analyzed again (spec 009, update); an excluded one cannot.
      if (personDecided(s) && s.state !== 'validated') return err('SESSION_DECIDED')
      const run = await deps.store.lastRun(s.studyId)
      if (isLive(run, deps.clock.now()) && run.sessionIds.includes(s.id))
        return err('ANALYSIS_RUNNING')
      if (s.transcriptFileId) {
        const agreed = await consented(c.actor.id, s.studyId, c.consent === true)
        if (!agreed.ok) return agreed
      }
      const analysis = await analyze(c.actor.id, s, ctx.value, null)
      if (!(await store(s.id, merged(analysis)))) return err('VERSION_CONFLICT')
      await excludeSummary(s.id, analysis)
      if (personDecided(s)) await reopenIfNew(s.id, s.analysis?.proposals ?? [])
      return ok({ id: s.id })
    },

    /** FR-008: accept, edit or reject proposals, in one write with the version the person saw. */
    decide: async (c: {
      actor: Actor
      sessionId: string
      version: number
      decisions: readonly ProposalDecision[]
    }): Promise<Result<{ id: string }, Failure>> => {
      const s = await deps.store.getSession(c.sessionId)
      if (!s) return err('SESSION_NOT_FOUND')
      const ctx = await contextOf(c.actor.id, s.studyId)
      if (!ctx.ok) return ctx.error === 'STUDY_NOT_FOUND' ? err('SESSION_NOT_FOUND') : ctx
      if (s.version !== c.version) return err('VERSION_CONFLICT')
      const held = new Set(
        ctx.value.sessions
          .filter((o) => o.id !== s.id)
          .flatMap((o) => [
            ...(o.transcriptFileId ? [o.transcriptFileId] : []),
            ...o.media.map((m) => m.fileId),
            ...o.attachments.map((a) => a.fileId),
          ]),
      )
      const available = new Set(
        ctx.value.files.filter((f) => f.kind === 'other' && !held.has(f.id)).map((f) => f.id),
      )
      // Pseudonyms of every interviewee the name may hold, assigned before the pure decision.
      let pseudonyms: ReadonlyMap<string, string> = new Map()
      if (ctx.value.anonymised) {
        // The interviewees this decision accepts or types: the name may hold them.
        const proposed = s.analysis?.proposals.find((p) => p.field === 'interviewees')
        const edited = c.decisions.flatMap((d) => {
          if (d.field !== 'interviewees' || d.action === 'reject') return []
          const people =
            d.action === 'edit' && Array.isArray(d.value)
              ? (d.value as Person[])
              : proposed?.field === 'interviewees'
                ? proposed.value
                : []
          return people.map((v) => ({ name: v.name, date: s.interviewDate }))
        })
        pseudonyms = await deps.store.ensurePseudonyms(
          s.studyId,
          studyInterviewees(ctx.value, edited),
          deps.clock.now(),
        )
      }
      // A member link must be one of the study's team (ids are never trusted as sent).
      const team = new Set(ctx.value.members.map((m) => m.id))
      const decisions = c.decisions.map((d) =>
        d.field === 'interviewers' && d.action === 'edit' && Array.isArray(d.value)
          ? {
              ...d,
              value: (d.value as Person[]).map((p) => ({
                ...p,
                memberId: p.memberId && team.has(p.memberId) ? p.memberId : null,
              })),
            }
          : d,
      )
      const next = decideProposals(s, decisions, {
        anonymised: ctx.value.anonymised,
        pseudonyms,
        available,
        now: deps.clock.now(),
        newId,
      })
      if (!next.ok) return next
      const written = await deps.store.saveSession(next.value, c.version)
      if (written === 'stale') return err('VERSION_CONFLICT')
      if (written === 'media-taken') return err('MEDIA_UNAVAILABLE')
      // The schedule follows the people and date accepted (spec 009 FR-022).
      await sync.push(c.actor, next.value)
      return ok({ id: s.id })
    },

    estimate: async (actor: Actor, studyId: string, options: { all?: boolean } = {}) => {
      const ctx = await contextOf(actor.id, studyId)
      if (!ctx.ok) return ctx
      const targets = toAnalyze(ctx.value, options.all === true)
      const withTranscript = targets.filter((s) => s.transcriptFileId !== null).length
      const provider = await deps.analyzer.providerOf(actor.id)
      const one = await deps.analyzer.estimate(actor.id, READ_MAX, ANSWER_TOKENS)
      return ok({
        count: targets.length,
        withTranscript,
        // The most it can cost: every interview with a transcript asks the AI once.
        estimatedCost: one === null ? null : one * withTranscript,
        consentNeeded:
          provider !== null && !(await deps.store.hasConsent(actor.id, studyId, provider)),
        aiConnected: provider !== null,
      })
    },

    startRun: async (c: {
      actor: Actor
      studyId: string
      consent?: boolean | undefined
      /** Analyze again the interviews already analyzed. */
      all?: boolean | undefined
    }): Promise<Result<{ runId: string }, Failure>> => {
      const ctx = await contextOf(c.actor.id, c.studyId)
      if (!ctx.ok) return ctx
      const targets = toAnalyze(ctx.value, c.all === true)
      if (targets.length === 0) return err('NOTHING_TO_ANALYZE')
      if (targets.some((s) => s.transcriptFileId)) {
        const agreed = await consented(c.actor.id, c.studyId, c.consent === true)
        if (!agreed.ok) return agreed
      }
      const now = deps.clock.now()
      const run: AnalysisRun = {
        id: newId(),
        studyId: c.studyId,
        startedBy: c.actor.id,
        sessionIds: targets.map((s) => s.id),
        state: 'running',
        stopRequested: false,
        startedAt: now,
        heartbeatAt: now,
        finishedAt: null,
      }
      if (!(await deps.store.startRun(run))) return err('ANALYSIS_RUNNING')
      for (const s of targets)
        await store(s.id, (current) => ({
          ...(current.analysis ?? {
            failure: null,
            by: c.actor.id,
            at: null,
            filesRead: [],
            usedAi: false,
            proposals: [],
          }),
          state: 'waiting',
          runId: run.id,
        }))
      if (!(await deps.enqueueAnalysis({ runId: run.id, studyId: c.studyId }))) {
        await deps.store.finishRun(run.id, 'stopped', now)
        // Nothing will analyze them: they go back to what they were.
        for (const s of targets) await store(s.id, (current) => released(current.analysis, run.id))
        return err('ANALYSIS_RUNNING')
      }
      return ok({ runId: run.id })
    },

    stopRun: async (c: {
      actor: Actor
      studyId: string
      runId: string
    }): Promise<Result<void, Failure>> => {
      const ctx = await contextOf(c.actor.id, c.studyId)
      if (!ctx.ok) return ctx
      const run = await deps.store.getRun(c.runId)
      if (!run || run.studyId !== c.studyId) return err('STUDY_NOT_FOUND')
      await deps.store.requestStop(run.id)
      return ok(undefined)
    },

    /** The worker's job: the sessions of a run, a few at a time, until done or stopped. */
    runJob: async (job: { runId: string; studyId: string }): Promise<void> => {
      const run = await deps.store.getRun(job.runId)
      if (run?.state !== 'running') return
      const ctx = await contextOf(run.startedBy, run.studyId)
      const queue = [...run.sessionIds]
      // A session the run did not reach goes back to what it was.
      const leave = async (sessionId: string) =>
        store(sessionId, (current) =>
          current.analysis?.state === 'waiting'
            ? released(current.analysis, run.id)
            : current.analysis,
        )
      if (!ctx.ok) {
        for (const id of queue) await leave(id)
        await deps.store.finishRun(run.id, 'stopped', deps.clock.now())
        return
      }
      let stopped = false
      const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          if (stopped || (await deps.store.getRun(run.id))?.stopRequested) {
            stopped = true
            await leave(id)
            continue
          }
          const s = await deps.store.getSession(id)
          if (!s || personDecided(s)) {
            if (s) await leave(id)
            continue
          }
          await store(id, (current) =>
            current.analysis ? { ...current.analysis, state: 'analyzing' } : current.analysis,
          )
          try {
            const analysis = await analyze(run.startedBy, s, ctx.value, run.id)
            await store(id, merged({ ...analysis, runId: null }))
            await excludeSummary(id, analysis)
          } catch (error) {
            deps.log.error({ err: error, sessionId: id }, 'session analysis failed')
            await store(id, (current) =>
              current.analysis
                ? { ...current.analysis, state: 'failed', failure: 'AI_FAILED', runId: null }
                : current.analysis,
            )
          }
          await deps.store.heartbeat(run.id, deps.clock.now())
        }
      }
      await Promise.all(Array.from({ length: RUN_PARALLEL }, worker))
      await deps.store.finishRun(run.id, stopped ? 'stopped' : 'done', deps.clock.now())
    },
  }
}

export type AnalysisCommands = ReturnType<typeof makeAnalysisCommands>
