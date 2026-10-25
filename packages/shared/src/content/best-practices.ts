import { bestPractices as en } from './best-practices.en.ts'
import { bestPractices as fr } from './best-practices.fr.ts'

export type { BestPractices, PracticeBlock, PracticeSection } from './best-practices.types.ts'

/**
 * The interview best practices (spec 006), shown by the web app and published to Drive by the
 * API (spec 007): long-form content localised as one module per language.
 */
export const BEST_PRACTICES = { en, fr } as const
