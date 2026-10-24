// Public API of the assistant module (spec 005).
export type { ResearchActions } from './application/ports.ts'
export { registerAssistantRoutes } from './infrastructure/http.routes.ts'
export { createAssistantModule } from './infrastructure/module.ts'
