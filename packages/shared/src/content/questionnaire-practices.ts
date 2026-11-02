import { questionnairePractices as en } from './questionnaire-practices.en.ts'
import { questionnairePractices as fr } from './questionnaire-practices.fr.ts'

/** The questionnaire best practices (spec 027 US7): one module per language, as the interview's. */
export const QUESTIONNAIRE_PRACTICES = { en, fr } as const
