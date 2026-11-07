import { usabilityPractices as en } from './usability-practices.en.ts'
import { usabilityPractices as fr } from './usability-practices.fr.ts'

/** The usability test best practices (spec 036 US7): one module per language, as the interview's. */
export const USABILITY_PRACTICES = { en, fr } as const
