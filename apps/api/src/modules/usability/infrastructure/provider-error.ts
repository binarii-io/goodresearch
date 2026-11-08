import { AiProviderRequired, ProviderCallError } from '../../ai-gateway/index.ts'
import {
  ProviderAccessLost,
  ProviderMediaUnsupported,
  ProviderMissing,
} from '../application/ports.ts'

/**
 * The gateway's refusals as the analysis names them; other errors stay as they are. Only a refused
 * grant asks to connect again: a missing role or a disabled API is not fixed by reconnecting.
 */
export const providerError = (error: unknown): unknown =>
  error instanceof AiProviderRequired
    ? new ProviderMissing()
    : error instanceof ProviderCallError && error.failure === 'INVALID_CREDENTIAL'
      ? new ProviderAccessLost()
      : error instanceof ProviderCallError && error.failure === 'MEDIA_NOT_SUPPORTED'
        ? new ProviderMediaUnsupported()
        : error
