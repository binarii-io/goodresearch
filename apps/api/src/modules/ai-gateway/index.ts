// Public API of the AI Gateway module (spec 004). The gateway itself reaches other modules through
// `createAiGatewayModule(...).gateway`, wired in compose.ts.
export { AiProviderRequired, type Gateway } from './application/gateway.ts'
export {
  type ChatMessage,
  failureOf,
  ProviderCallError,
  type StreamPart,
  type ToolSpec,
} from './application/ports.ts'
export type { AiFailure } from './domain/failure.ts'
export { isAuthorisationFailure } from './domain/failure.ts'
export { registerAiRoutes } from './infrastructure/http.routes.ts'
export { createAiGatewayModule } from './infrastructure/module.ts'
