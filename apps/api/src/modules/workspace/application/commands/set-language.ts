import type { Language } from '@goodresearch/contracts'
import { ok, type Result } from '@goodresearch/shared'
import type { Actor } from '../../domain/actor.ts'

export interface LanguagePreferences {
  setLanguage(accountId: string, language: Language): Promise<void>
}

/** Stores the interface language of the signed-in account (FR-024). */
export const makeSetLanguage =
  (deps: { preferences: LanguagePreferences }) =>
  async (command: { actor: Actor; language: Language }): Promise<Result<void, never>> => {
    await deps.preferences.setLanguage(command.actor.id, command.language)
    return ok(undefined)
  }
