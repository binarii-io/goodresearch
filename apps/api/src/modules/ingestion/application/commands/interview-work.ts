import { err, ok, type Result } from '@goodresearch/shared'
import type { Actor } from '../ports.ts'
import type { SessionQueries } from '../queries/session-queries.ts'
import type { AnalysisCommands } from './analysis-commands.ts'
import type { SessionCommands } from './session-commands.ts'

export type InterviewCardKind = 'suggestions' | 'validate' | 'exclude'

/** What the assistant asks for; the app builds the lines from its own data (spec 025 FR-008). */
export type InterviewItem = {
  readonly interviewId: string
  /** Suggestions: only these fields; all of them without any. */
  readonly fields?: readonly string[] | undefined
  /** Exclusions: why. */
  readonly reason?: string | undefined
}

export type InterviewLine = {
  index: number
  interviewId: string
  interview: string
  /** The interview as the card showed it: a later change stops the line. */
  version: number
  field: string | null
  fileId: string | null
  value: string
  /** Why the line starts unticked: another date found, no transcript. */
  flag: string | null
  reason: string | null
  outcome?: string
}

const shownValue = (p: {
  text: string | null
  people: readonly { name: string }[] | null
  attachment: { name: string } | null
}): string =>
  p.text ?? p.people?.map((person) => person.name).join(', ') ?? p.attachment?.name ?? ''

/**
 * Cards on a study's interviews (spec 025). The model names interviews; every value shown comes
 * from the app, and Apply runs the Fieldwork commands, so their rules hold and a person's decision
 * is never overwritten.
 */
export const makeInterviewWork = (deps: {
  queries: SessionQueries
  analysis: AnalysisCommands
  sessions: SessionCommands
}) => {
  const read = async (actor: Actor, studyId: string) => {
    const view = await deps.queries.fieldwork(actor, studyId)
    if (!view.ok) return view
    if (view.value.anonymised) return err('STUDY_ANONYMISED')
    return ok(view.value)
  }

  return {
    prepare: async (
      actor: Actor,
      studyId: string,
      kind: InterviewCardKind,
      items: readonly InterviewItem[],
    ): Promise<Result<{ lines: InterviewLine[] }, string>> => {
      const view = await read(actor, studyId)
      if (!view.ok) return view
      if (view.value.run?.state === 'running') return err('ANALYSIS_RUNNING')
      const lines: InterviewLine[] = []
      for (const item of items) {
        const s = view.value.sessions.find((one) => one.id === item.interviewId)
        if (!s) return err('INTERVIEW_NOT_FOUND')
        const base = {
          interviewId: s.id,
          interview: s.title ?? s.defaultTitle,
          version: s.version,
          field: null,
          fileId: null,
          flag: null,
          reason: null,
        }
        // A person's decision stands: only what is still open can be on a card.
        if (s.state !== 'proposed') continue
        if (kind === 'suggestions') {
          for (const p of s.analysis?.proposals ?? []) {
            if (p.status !== 'proposed') continue
            if (item.fields && !item.fields.includes(p.field)) continue
            lines.push({
              ...base,
              index: lines.length,
              field: p.field,
              fileId: p.attachment?.fileId ?? null,
              value: shownValue(p),
              flag: p.otherDate ? `other-date:${p.otherDate}` : null,
            })
          }
        } else if (kind === 'validate') {
          lines.push({
            ...base,
            index: lines.length,
            value: base.interview,
            flag: s.transcript === null ? 'no-transcript' : null,
          })
        } else {
          const reason = item.reason?.trim() ?? ''
          if (!reason) return err('REASON_REQUIRED')
          lines.push({ ...base, index: lines.length, value: base.interview, reason })
        }
      }
      return lines.length ? ok({ lines }) : err('NOTHING_TO_DECIDE')
    },

    /** Runs the lines kept; each gives its outcome, and a failure stops only its interview. */
    apply: async (
      actor: Actor,
      studyId: string,
      kind: InterviewCardKind,
      lines: readonly InterviewLine[],
      excluded: ReadonlySet<number>,
      reasons: ReadonlyMap<number, string>,
    ): Promise<Result<{ outcomes: string[] }, string>> => {
      const view = await read(actor, studyId)
      if (!view.ok) return view
      if (view.value.run?.state === 'running') return err('ANALYSIS_RUNNING')
      const outcomes: string[] = lines.map((l) => (excluded.has(l.index) ? 'skipped' : ''))
      const set = (kept: readonly InterviewLine[], outcome: string) => {
        for (const l of kept) outcomes[l.index] = outcome
      }
      for (const id of new Set(lines.map((l) => l.interviewId))) {
        const kept = lines.filter((l) => l.interviewId === id && !excluded.has(l.index))
        if (kept.length === 0) continue
        const s = view.value.sessions.find((one) => one.id === id)
        if (!s) {
          set(kept, 'INTERVIEW_NOT_FOUND')
          continue
        }
        if (kept.some((l) => l.version !== s.version)) {
          set(kept, 'VERSION_CONFLICT')
          continue
        }
        try {
          const done =
            kind === 'suggestions'
              ? await deps.analysis.decide({
                  actor,
                  sessionId: id,
                  version: s.version,
                  decisions: kept.map((l) => ({
                    field: l.field as never,
                    ...(l.fileId ? { fileId: l.fileId } : {}),
                    action: 'accept' as const,
                  })),
                })
              : await deps.sessions.decide({
                  actor,
                  sessionId: id,
                  version: s.version,
                  decision: kind,
                  ...(kind === 'exclude'
                    ? { reason: reasons.get(kept[0]?.index ?? -1) ?? kept[0]?.reason ?? '' }
                    : {}),
                })
          set(kept, done.ok ? 'done' : String(done.error))
        } catch {
          set(kept, 'INTERNAL')
        }
      }
      return ok({ outcomes })
    },
  }
}

export type InterviewWork = ReturnType<typeof makeInterviewWork>
