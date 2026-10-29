import { err, ok, type Result } from '@goodresearch/shared'
import { ATTACHMENT_LIMIT } from './attachments.ts'
import { meetingOf, nameWords } from './file-words.ts'
import {
  completeNames,
  findDate,
  type Member,
  matchMembers,
  type Person,
  participantsOf,
  speakersOf,
} from './header-rules.ts'
import { languageOf, type SessionLanguage } from './language.ts'
import { BASE_MAX, normalisedBase } from './normalised-name.ts'
import type {
  Analysis,
  Proposal,
  ProposalField,
  ProposalOrigin,
  ProposalStatus,
} from './proposal.ts'
import { nameKey } from './pseudonyms.ts'
import {
  NAME_MAX,
  personDecided,
  ROSTER_MAX,
  type RosterEntry,
  type Session,
  splitNames,
} from './session.ts'

export type { Analysis, AnalysisFailure, Proposal, ProposalField } from './proposal.ts'

/** Characters read first, and once more when nobody is found there (FR-002). */
export const READ_WINDOW = 4_000
export const READ_MAX = 8_000

type Found<T> = { readonly value: T; readonly origin: ProposalOrigin } | null

export type RuleInput = {
  /** The beginning of the transcript, null without transcript. */
  readonly text: string | null
  readonly transcriptName: string | null
  readonly mediaNames: readonly string[]
  /** The transcript's (or first recording's) date at the source. */
  readonly fileDate: string | null
  readonly planned: {
    readonly interviewee: string
    readonly interviewers: string
    readonly scheduledAt: string | null
  } | null
  readonly members: readonly Member[]
  /** Invited people of the meeting notes (another tab of the document), with full names. */
  readonly invited?: readonly string[]
}

export type RuleResult = {
  readonly interviewees: Found<readonly Person[]>
  readonly interviewers: Found<readonly Person[]>
  readonly date: {
    readonly value: string
    readonly origin: ProposalOrigin
    readonly otherDate: string | null
  } | null
  readonly language: SessionLanguage | null
  /** Interviewees or the date are still missing, or the speakers cannot be told apart. */
  readonly needsAi: boolean
}

const dateOfName = (name: string): string | null => {
  const { at } = meetingOf(name)
  if (at !== null) return new Date(at * 60_000).toISOString().slice(0, 10)
  return findDate(name.replace(/_/g, '-'))
}

const header = (text: string) => text.split(/\r?\n/).slice(0, 30).join('\n')

const asPeople = (names: readonly string[]): Person[] =>
  names.slice(0, ROSTER_MAX).map((name) => ({ name: name.slice(0, NAME_MAX), memberId: null }))

/** Research R3: what the app finds by itself, before any AI. */
export const ruleProposals = (input: RuleInput): RuleResult => {
  const names = [input.transcriptName, ...input.mediaNames].filter((n): n is string => !!n)
  const fromHeader = input.text ? findDate(header(input.text)) : null
  const fromName = names.map(dateOfName).find((d) => d !== null) ?? null
  const fromPlanned = input.planned?.scheduledAt?.slice(0, 10) ?? null
  const fromFile = input.fileDate?.slice(0, 10) ?? null
  const sources: [string | null, ProposalOrigin][] = [
    [fromHeader, 'header'],
    [fromName, 'file-name'],
    [fromPlanned, 'planned'],
    [fromFile, 'file-date'],
  ]
  const chosen = sources.find(([value]) => value !== null)
  const otherDate =
    chosen?.[1] === 'header' && fromName !== null && fromName !== fromHeader ? fromName : null
  const date = chosen?.[0] ? { value: chosen[0], origin: chosen[1], otherDate } : null

  let interviewees: Found<readonly Person[]> = null
  let interviewers: Found<readonly Person[]> = null
  let ambiguous = false
  if (input.text) {
    const listed = participantsOf(input.text)
    const origin: ProposalOrigin = listed.length ? 'header' : 'speakers'
    // First names of the transcript take the full names of the invited people (spec 009).
    const people = completeNames(
      listed.length ? listed : speakersOf(input.text),
      input.invited ?? [],
    )
    const { interviewers: members, others } = matchMembers(people, input.members)
    if (members.length) interviewers = { value: members.slice(0, ROSTER_MAX), origin }
    // The linked planned interview names who was interviewed: the others interviewed.
    const planned = new Set(input.planned ? nameWords(input.planned.interviewee) : [])
    const named = others.filter((n) => nameWords(n).some((w) => planned.has(w)))
    if (named.length === 1) {
      interviewees = { value: asPeople(named), origin }
      const rest = others.filter((n) => !named.includes(n))
      if (!members.length && rest.length) interviewers = { value: asPeople(rest), origin }
    } else {
      // Nobody of the team among them: who interviewed whom is not known. A single speaker is no
      // clue either: interviewers often speak alone first (introduction, consent).
      ambiguous = members.length === 0
      if (others.length && !ambiguous) interviewees = { value: asPeople(others), origin }
    }
  }
  if (input.planned) {
    if (!interviewees && input.planned.interviewee.trim())
      interviewees = { value: asPeople([input.planned.interviewee.trim()]), origin: 'planned' }
    if (!interviewers) {
      const split = splitNames(input.planned.interviewers)
      const { interviewers: members, others } = matchMembers(split, input.members)
      const value = [...members, ...asPeople(others)].slice(0, ROSTER_MAX)
      if (value.length) interviewers = { value, origin: 'planned' }
    }
  }
  const needsAi =
    input.text !== null && (!interviewees || !date || date.origin === 'file-date' || ambiguous)
  return {
    interviewees,
    interviewers,
    date,
    language: input.text ? languageOf(input.text) : null,
    needsAi,
  }
}

const keyOf = (p: Proposal) => (p.field === 'attachment' ? `attachment:${p.value.fileId}` : p.field)

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const decided = (p: Proposal) => p.status === 'accepted' || p.status === 'edited'

/**
 * Constitution IV: a new analysis never replaces what a person decided, and never proposes again a
 * value they rejected. Decided proposals the new analysis no longer makes are kept.
 */
export const mergeProposals = (
  previous: readonly Proposal[],
  next: readonly Proposal[],
): Proposal[] => {
  const before = new Map(previous.map((p) => [keyOf(p), p]))
  const merged = next.map((p) => {
    const old = before.get(keyOf(p))
    if (old && decided(old)) return old
    if (old?.status === 'rejected' && same(old.value, p.value)) return old
    return p
  })
  const kept = new Set(merged.map(keyOf))
  return [
    ...merged,
    ...previous.filter((p) => !kept.has(keyOf(p)) && (decided(p) || p.status === 'rejected')),
  ]
}

/**
 * An analysis brings something new to decide: a proposal open now that was not open, with the
 * same value, before it. A validated interview then goes back to decide (spec 009, update).
 */
export const newToDecide = (previous: readonly Proposal[], next: readonly Proposal[]): boolean =>
  next.some(
    (p) =>
      p.status === 'proposed' &&
      !previous.some(
        (o) => o.status === 'proposed' && keyOf(o) === keyOf(p) && same(o.value, p.value),
      ),
  )

const rosterNames = (s: Session, role: RosterEntry['role']) =>
  s.roster.filter((r) => r.role === role).map((r) => r.name)

/** Proposals equal to what the interview already holds need no decision. */
export const markAlreadySet = (s: Session, proposals: readonly Proposal[]): Proposal[] =>
  proposals.map((p) => {
    if (p.status !== 'proposed') return p
    const current =
      p.field === 'interviewees' || p.field === 'interviewers'
        ? rosterNames(s, p.field === 'interviewees' ? 'interviewee' : 'interviewer')
        : p.field === 'date'
          ? s.interviewDate
          : p.field === 'language'
            ? s.language
            : p.field === 'name'
              ? s.title
              : p.field === 'attachment' && s.attachments.some((a) => a.fileId === p.value.fileId)
                ? p.value
                : null
    const value =
      p.field === 'interviewees' || p.field === 'interviewers'
        ? p.value.map((v) => v.name)
        : p.value
    return same(current, value) ? { ...p, status: 'already-set' } : p
  })

export type ProposalDecision = {
  readonly field: ProposalField
  readonly fileId?: string | undefined
  readonly action: 'accept' | 'edit' | 'reject'
  /** For `edit`: people, a date, a language or a name (checked at the boundary and here). */
  readonly value?: unknown
}

export type DecisionContext = {
  readonly anonymised: boolean
  /** Pseudonyms of the study by name key, assigned before (research R10). */
  readonly pseudonyms: ReadonlyMap<string, string>
  /** Files no other interview holds (attachments). */
  readonly available: ReadonlySet<string>
  readonly now: Date
  readonly newId: () => string
}

export type DecisionError =
  | 'SESSION_DECIDED'
  | 'PROPOSAL_NOT_FOUND'
  | 'VALIDATION'
  | 'MEDIA_UNAVAILABLE'

export const isDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

const isPeople = (v: unknown): v is Person[] =>
  Array.isArray(v) &&
  v.length <= ROSTER_MAX &&
  v.every(
    (p) =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Person).name === 'string' &&
      (p as Person).name.trim().length >= 1 &&
      (p as Person).name.trim().length <= NAME_MAX,
  )

/** The interview's name from its current values; pseudonyms instead of names when anonymised. */
export const nameFrom = (
  s: Pick<Session, 'interviewDate' | 'roster'>,
  anonymised: boolean,
  pseudonyms: ReadonlyMap<string, string>,
): string | null =>
  normalisedBase({
    date: s.interviewDate,
    interviewees: s.roster
      .filter((r) => r.role === 'interviewee')
      .map((r) => (anonymised ? (pseudonyms.get(nameKey(r.name)) ?? null) : r.name))
      .filter((n): n is string => n !== null),
    interviewers: rosterNames(s as Session, 'interviewer'),
  })

/**
 * FR-008: the person accepts, edits or rejects proposals. People replace the roster entries of
 * their role (ids kept for the same names), the date and language set the fields, and the name,
 * decided last, follows the values accepted in the same decision.
 */
export const decideProposals = (
  s: Session,
  decisions: readonly ProposalDecision[],
  ctx: DecisionContext,
): Result<Session, DecisionError> => {
  if (personDecided(s)) return err('SESSION_DECIDED')
  const proposals = [...(s.analysis?.proposals ?? [])]
  const find = (d: ProposalDecision) =>
    proposals.findIndex(
      (p) => p.field === d.field && (p.field !== 'attachment' || p.value.fileId === d.fileId),
    )
  if (decisions.some((d) => find(d) < 0) || !s.analysis) return err('PROPOSAL_NOT_FOUND')
  let next: Session = { ...s, updatedAt: ctx.now }
  const ordered = [...decisions].sort((a, b) => +(a.field === 'name') - +(b.field === 'name'))
  for (const d of ordered) {
    const i = find(d)
    const p = proposals[i] as Proposal
    if (d.action === 'reject') {
      proposals[i] = { ...p, status: 'rejected' }
      continue
    }
    const status: ProposalStatus = d.action === 'edit' ? 'edited' : 'accepted'
    const value = d.action === 'edit' ? d.value : p.value
    switch (p.field) {
      case 'interviewees':
      case 'interviewers': {
        if (!isPeople(value) || (p.field === 'interviewees' && value.length === 0))
          return err('VALIDATION')
        const role = p.field === 'interviewees' ? 'interviewee' : 'interviewer'
        const current = next.roster.filter((r) => r.role === role)
        const entries: RosterEntry[] = value.map((person) => {
          const name = person.name.trim()
          const known = current.find((r) => nameKey(r.name) === nameKey(name))
          return {
            id: known?.id ?? ctx.newId(),
            name,
            role,
            memberId: role === 'interviewer' ? (person.memberId ?? null) : null,
          }
        })
        const roster = [...next.roster.filter((r) => r.role !== role), ...entries]
        if (roster.length > ROSTER_MAX) return err('VALIDATION')
        next = { ...next, roster }
        proposals[i] = { ...p, value, status }
        break
      }
      case 'date':
        if (!isDate(value)) return err('VALIDATION')
        next = { ...next, interviewDate: value }
        proposals[i] = { ...p, value, status }
        break
      case 'language':
        if (value !== 'en' && value !== 'fr' && value !== 'other') return err('VALIDATION')
        next = { ...next, language: value }
        proposals[i] = { ...p, value, status }
        break
      case 'name': {
        const name =
          d.action === 'edit'
            ? typeof value === 'string'
              ? value.trim()
              : ''
            : (nameFrom(next, ctx.anonymised, ctx.pseudonyms) ?? p.value)
        if (name.length < 1 || name.length > BASE_MAX) return err('VALIDATION')
        next = { ...next, title: name }
        proposals[i] = { ...p, value: name, status }
        break
      }
      case 'attachment': {
        const { fileId } = p.value
        if (next.attachments.some((a) => a.fileId === fileId)) break
        if (!ctx.available.has(fileId)) return err('MEDIA_UNAVAILABLE')
        if (next.attachments.length >= ATTACHMENT_LIMIT) return err('VALIDATION')
        next = {
          ...next,
          attachments: [...next.attachments, { fileId, label: p.value.label ?? null }],
        }
        proposals[i] = { ...p, status: 'accepted' }
        break
      }
    }
  }
  return ok({ ...next, analysis: { ...s.analysis, proposals } })
}

/** The files of a session now differ from those its analysis read (renamed, changed, added). */
export const filesChanged = (
  s: Session,
  files: ReadonlyMap<string, { readonly name: string; readonly modifiedAt: string | null }>,
): boolean => {
  if (!s.analysis) return false
  const ids = [s.transcriptFileId, ...s.media.map((m) => m.fileId)].filter(
    (id): id is string => id !== null,
  )
  const read = s.analysis.filesRead
  return (
    ids.length !== read.length ||
    read.some((r) => {
      const now = files.get(r.fileId)
      return (
        !ids.includes(r.fileId) || !now || now.name !== r.name || now.modifiedAt !== r.modifiedAt
      )
    })
  )
}

/**
 * A session's analysis once its run left it (stopped, not started, failed): back to what it was —
 * none when the run only put a placeholder, else done or failed as before.
 */
export const released = (a: Analysis | null, runId: string): Analysis | null => {
  if (!a || a.runId !== runId) return a
  if (a.at === null && a.proposals.length === 0) return null
  return { ...a, state: a.failure ? 'failed' : 'done', runId: null }
}

/** Waiting or analyzing for a run that is no longer going: it reads interrupted (no endless spinner). */
export const shownAnalysis = (a: Analysis | null, liveRunId: string | null): Analysis | null =>
  a && (a.state === 'waiting' || a.state === 'analyzing') && a.runId !== liveRunId
    ? { ...a, state: 'failed', failure: 'INTERRUPTED' }
    : a
