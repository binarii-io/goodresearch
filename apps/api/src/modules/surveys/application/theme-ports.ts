import type { Accepted } from '../domain/responses.ts'

type Bilingual = { readonly en: string; readonly fr: string }

/** Spec 029: a theme of one open item (data-model.md). */
export type StoredTheme = {
  readonly id: string
  readonly studyId: string
  readonly itemId: string
  readonly label: Bilingual
  readonly description: Bilingual
  readonly translation: 'done' | 'translating' | 'not-translated'
  readonly origin: 'ai' | 'person'
  readonly status: 'proposed' | 'accepted' | 'rejected'
  readonly mergedInto: string | null
  readonly version: number
  readonly runId: string | null
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly createdAt: Date
}

export type ThemeRun = {
  readonly id: string
  readonly studyId: string
  readonly itemId: string
  readonly state: 'running' | 'done' | 'failed' | 'stopped'
  readonly parts: number
  readonly partsDone: number
  readonly answersSent: number
  readonly leftOut: number
  readonly droppedQuotes: number
  readonly droppedThemes: number
  readonly failure: string | null
  readonly startedBy: string
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

export type ThemeAnswer = {
  readonly themeId: string
  readonly sourceId: string
  readonly quote: string | null
}

export type ThemeStore = {
  /** The counted answers of an open item (raw text, masked by the caller), oldest first. */
  openAnswers(
    studyId: string,
    fileId: string,
    accepted: Accepted,
    itemId: string,
  ): Promise<readonly { readonly sourceId: string; readonly text: string }[]>
  themesOf(studyId: string, itemId: string): Promise<readonly StoredTheme[]>
  answersOf(studyId: string, itemId: string): Promise<readonly ThemeAnswer[]>
  getTheme(id: string): Promise<StoredTheme | null>
  /** Saved if still at version `expected`. */
  saveTheme(theme: StoredTheme, expected: number): Promise<'ok' | 'conflict'>
  liveRun(studyId: string): Promise<ThemeRun | null>
  getRun(id: string): Promise<ThemeRun | null>
  /** `busy` when another run of the study is live. */
  startRun(run: ThemeRun): Promise<'ok' | 'busy'>
  saveRun(run: ThemeRun): Promise<void>
  /** New themes with their answers, and answers joining existing themes, in one transaction. */
  addThemes(
    created: readonly { theme: StoredTheme; answers: readonly ThemeAnswer[] }[],
    joined: readonly ThemeAnswer[],
  ): Promise<void>
  /** An answer moved to a theme of its item, or out of every theme (`to` null). */
  moveAnswer(studyId: string, itemId: string, sourceId: string, to: string | null): Promise<void>
  /** The answers of `from` go to `into`; `from` are rejected, merged into it; all at the versions read. */
  merge(
    into: StoredTheme,
    from: readonly StoredTheme[],
    by: string,
    at: Date,
  ): Promise<'ok' | 'conflict'>
}

export type ThemesJob = {
  readonly runId: string
  readonly studyId: string
  readonly accountId: string
  readonly onlyNew: boolean
}

export type ThemeTranslationJob = {
  readonly themeId: string
  readonly version: number
  readonly accountId: string
  readonly from: 'en' | 'fr'
  /** The texts a person wrote; the others stay as they are. */
  readonly fields: readonly ('label' | 'description')[]
}
