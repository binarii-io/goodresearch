// Public API of the synthesis module: the project's insights (spec 013).
export { registerSynthesisRoutes } from './infrastructure/http.routes.ts'
export { createSynthesisModule } from './infrastructure/module.ts'
export { createInsightsAi } from './infrastructure/prompts/insights.ts'
export { registerRecommendationRoutes } from './infrastructure/recommendation.routes.ts'
