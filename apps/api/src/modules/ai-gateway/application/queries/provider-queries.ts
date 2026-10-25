import { VERTEX_REGIONS } from '../../domain/provider.ts'
import type { AiDeps, StoredConnection } from '../ports.ts'

/**
 * What the person sees of their connection: never the credential (FR-006). The model shown is the
 * one calls use now, from the configuration, not the one of the last check.
 */
const toView = (c: StoredConnection, model: string) => ({
  provider: c.provider,
  model,
  status: c.status,
  credentialHint: c.credentialHint,
  googleAccount: c.googleAccount,
  project: c.project,
  region: c.region,
  lastCheckedAt: c.lastCheckedAt.toISOString(),
  lastFailure: c.lastFailure,
})

export const makeProviderQueries = (deps: AiDeps) => ({
  view: (c: StoredConnection) => toView(c, deps.config.models[c.provider]),

  page: async (accountId: string) => {
    const connection = await deps.store.getConnection(accountId)
    const pending = await deps.store.getPendingGrant(accountId, deps.clock.now())
    return {
      offered: [...deps.config.offered],
      regions: [...VERTEX_REGIONS],
      // A Google grant refused by Google (withdrawn, expired, or a re-authentication required by
      // the person's organisation) is not reused: the person is asked for a new consent.
      googleGranted:
        pending !== null ||
        (connection?.provider === 'vertex' &&
          !(
            connection.status === 'needs-attention' &&
            connection.lastFailure === 'INVALID_CREDENTIAL'
          )),
      connection: connection ? toView(connection, deps.config.models[connection.provider]) : null,
      usage: await deps.store.usageSummary(accountId),
    }
  },

  /** For `Me`: is the mandatory provider step needed (FR-002)? */
  gate: async (
    accountId: string,
  ): Promise<{ required: boolean; status: 'none' | 'working' | 'needs-attention' }> => {
    const required = deps.config.offered.length > 0
    const connection = await deps.store.getConnection(accountId)
    // A provider the deployer no longer offers counts as none: the person chooses again.
    if (!connection || !deps.config.offered.includes(connection.provider))
      return { required, status: 'none' }
    return { required, status: connection.status }
  },
})

export type ProviderQueries = ReturnType<typeof makeProviderQueries>
