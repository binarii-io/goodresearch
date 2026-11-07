import { standardQuestions as en } from './standard-questions.en.ts'
import { standardQuestions as fr } from './standard-questions.fr.ts'

export type { Scale, StandardQuestions } from './standard-questions.types.ts'

/** Fixed SUS and SEQ texts and the protocol defaults, per protocol language (spec 036). */
export const STANDARD_QUESTIONS = { en, fr } as const
