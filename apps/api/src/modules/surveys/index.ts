// Public API of the surveys module (spec 028).

export { figuresText } from './application/queries/figures-text.ts'
export { registerSurveysRoutes } from './infrastructure/http.routes.ts'
export { createSurveysModule } from './infrastructure/module.ts'
export { createThemesAi } from './infrastructure/prompts/themes.ts'
