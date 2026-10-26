// Public API of the transcripts module (spec 010): imported transcripts and the team lexicon.
export { registerTranscriptsRoutes } from './infrastructure/http.routes.ts'
export { createTranscriptsModule } from './infrastructure/module.ts'
export { createLexiconAi } from './infrastructure/prompts/lexicon.ts'
