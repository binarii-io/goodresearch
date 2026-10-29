import {
  analysedCorrections,
  applyCorrections,
  fingerprint as fingerprintOf,
} from '../domain/corrections.ts'
import type { LexiconFailure } from '../domain/lexicon-run.ts'
import type { Segment } from '../domain/segments.ts'
import { loadCorrections, personTerms } from './cleaning-corrections.ts'
import type { CleaningDeps, SourceSession } from './ports.ts'

/** Spec 012: the text Analysis reads, set per study. */
export type TextAnalysed = 'with-corrections' | 'clean-only'

export type AnalysedText = {
  readonly turns: readonly Segment[]
  readonly rawImportedAt: Date
  /** Tells two analysed texts of an interview apart. */
  readonly fingerprint: string
}

/**
 * Spec 012 research R2: the transcripts module tells the Evidence module which text to read, so
 * Evidence never reads corrections itself.
 */
export const makeAnalysedText = (
  deps: CleaningDeps,
  lexicon: {
    readonly importTranscript: (
      run: { readonly startedBy: string; readonly studyId: string },
      session: SourceSession,
    ) => Promise<{ transcript: unknown; failure: LexiconFailure | null }>
    readonly liveRun: (studyId: string) => Promise<boolean>
  },
  cleaningLive: (studyId: string) => Promise<boolean>,
) => {
  /**
   * The analysed text of an interview: `with-corrections`, the raw version with every correction
   * not rejected applied; `clean-only`, its latest validated clean version (`not-clean` without).
   * `assign` gives the missing pseudonyms (a run); a read only reads them.
   */
  const analysedText = async (
    accountId: string,
    studyId: string,
    sessionId: string,
    mode: TextAnalysed,
    options: { readonly assign?: boolean } = {},
  ): Promise<AnalysedText | 'no-transcript' | 'not-clean'> => {
    const transcript = await deps.store.getTranscript(sessionId)
    if (!transcript || transcript.studyId !== studyId) return 'no-transcript'
    if (mode === 'clean-only') {
      const latest = await deps.cleaning.latestVersion(sessionId)
      if (!latest) return 'not-clean'
      return {
        turns: latest.segments,
        rawImportedAt: latest.rawImportedAt,
        fingerprint: `clean:${latest.number}`,
      }
    }
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return 'no-transcript'
    const { all } = await loadCorrections(deps, {
      accountId,
      studyId,
      teamId: access.teamId,
      anonymised: access.anonymised,
      transcript,
      assign: options.assign === true,
    })
    const applied = analysedCorrections(all)
    return {
      turns: applyCorrections(transcript.segments, applied).segments,
      rawImportedAt: transcript.importedAt,
      fingerprint: fingerprintOf(applied),
    }
  }

  /**
   * Imports the raw versions missing or changed in Drive, as a cleaning run does (spec 012
   * FR-003). Returns the interviews that could not be imported, with their reason.
   */
  const importTranscripts = async (
    accountId: string,
    studyId: string,
    sessionIds: readonly string[],
  ): Promise<Map<string, LexiconFailure>> => {
    const failed = new Map<string, LexiconFailure>()
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    const sessions = new Map((found?.sessions ?? []).map((s) => [s.id, s]))
    for (const id of sessionIds) {
      const session = sessions.get(id)
      if (!session) {
        failed.set(id, 'FILE_NOT_FOUND')
        continue
      }
      const imported = await lexicon.importTranscript({ startedBy: accountId, studyId }, session)
      if (!imported.transcript) failed.set(id, imported.failure ?? 'FILE_NOT_FOUND')
    }
    return failed
  }

  /** The names of the team's people terms: never sent to the AI (spec 012 FR-007). */
  const personNames = async (accountId: string, studyId: string): Promise<string[]> => {
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return []
    return personTerms(await deps.store.teamTerms(access.teamId)).flatMap((t) => [
      t.form,
      ...t.variants.map((v) => v.spelling),
    ])
  }

  /** A lexicon reading or a cleaning of the study is running (spec 012 FR-012). */
  const enrichmentLive = async (studyId: string) =>
    (await lexicon.liveRun(studyId)) || (await cleaningLive(studyId))

  return { analysedText, importTranscripts, personNames, enrichmentLive }
}
