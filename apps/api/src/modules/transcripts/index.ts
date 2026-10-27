// Public API of the transcripts module: imported transcripts, the team lexicon (spec 010) and
// Cleaning (spec 011). Later phases read an interview's latest clean version from the module.
export { registerTranscriptsRoutes } from './infrastructure/http.routes.ts'
export { createTranscriptsModule } from './infrastructure/module.ts'
export { createCleaningAi } from './infrastructure/prompts/cleaning.ts'
export { createLexiconAi } from './infrastructure/prompts/lexicon.ts'
