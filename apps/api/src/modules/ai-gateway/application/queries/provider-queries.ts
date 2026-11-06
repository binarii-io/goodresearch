import type { GrantProblem } from '../../domain/grant-problem.ts'
import { VERTEX_REGIONS } from '../../domain/provider.ts'
import { type AiDeps, type StoredConnection, servingOf, sharedOpenTo } from '../ports.ts'

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
  grantProblem: c.grantProblem,
})

export const makeProviderQueries = (deps: AiDeps) => ({
  view: (c: StoredConnection) => toView(c, deps.config.models[c.provider]),

  page: async (accountId: string) => {
    const [connection, pending, open] = await Promise.all([
      deps.store.getConnection(accountId),
      deps.store.getPendingGrant(accountId, deps.clock.now()),
      sharedOpenTo(deps, accountId),
    ])
    const serving = await servingOf(deps, accountId, connection)
    const shared = deps.config.shared
    return {
      offered: [...deps.config.offered],
      regions: [...VERTEX_REGIONS],
      // A Google grant refused by Google (withdrawn, expired, a re-authentication required by the
      // person's organisation, unreadable) is not reused: the person reconnects (spec 030).
      googleGranted:
        pending !== null || (connection?.provider === 'vertex' && connection.grantProblem === null),
      connection: connection ? toView(connection, deps.config.models[connection.provider]) : null,
      // Spec 035: the usage of what serves the person now (the shared provider's calls only).
      usage: await deps.store.usageSummary(
        accountId,
        serving?.kind === 'shared' ? true : undefined,
      ),
      // Spec 035: the shared provider as the person may know it, never its credential.
      shared: shared ? { provider: shared.credential.provider, model: shared.model, open } : null,
      serving: serving?.kind ?? null,
    }
  },

  /** For `Me`: is the mandatory provider step needed (FR-002)? */
  gate: async (
    accountId: string,
  ): Promise<{
    required: boolean
    status: 'none' | 'working' | 'needs-attention'
    /** Spec 030: a refused Vertex AI grant is reconnected where the person is, not in the setup. */
    grantProblem: GrantProblem | null
  }> => {
    // A provider the deployer no longer offers counts as none: the person chooses again, unless
    // the instance's shared provider serves them (spec 035).
    const serving = await servingOf(deps, accountId)
    if (serving?.kind === 'own')
      return {
        required: deps.config.offered.length > 0,
        status: serving.connection.status,
        grantProblem: serving.connection.grantProblem,
      }
    return {
      required: deps.config.offered.length > 0 && serving === null,
      status: 'none',
      grantProblem: null,
    }
  },
})

export type ProviderQueries = ReturnType<typeof makeProviderQueries>
