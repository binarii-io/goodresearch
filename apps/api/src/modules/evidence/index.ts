// Public API of the evidence module: verbatims and facts of the interviews (spec 012).

export { registerEvidenceRoutes } from './infrastructure/http.routes.ts'
export { createEvidenceModule } from './infrastructure/module.ts'
export { createFactsAi } from './infrastructure/prompts/facts.ts'
