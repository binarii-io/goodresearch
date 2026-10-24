// Public API of the AI Gateway module (spec 004). The gateway itself reaches other modules through
// `createAiGatewayModule(...).gateway`, wired in compose.ts.
export { registerAiRoutes } from './infrastructure/http.routes.ts'
export { createAiGatewayModule } from './infrastructure/module.ts'
