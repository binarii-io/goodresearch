import { and, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { AiStore, StoredConnection, UsageEntry } from '../application/ports.ts'
import type { AiFailure } from '../domain/failure.ts'
import type { ProviderKind } from '../domain/provider.ts'
import {
  aiOauthStates,
  aiPendingGoogleGrants,
  aiProviderConnections,
  aiUsageEntries,
} from './schema.ts'

type ConnectionRow = typeof aiProviderConnections.$inferSelect

const toConnection = (row: ConnectionRow): StoredConnection => ({
  accountId: row.accountId,
  provider: row.provider as ProviderKind,
  model: row.model,
  encryptedCredential: row.encryptedCredential,
  credentialHint: row.credentialHint,
  googleAccount: row.googleAccount,
  project: row.gcpProject,
  region: row.gcpRegion,
  status: row.status === 'working' ? 'working' : 'needs-attention',
  lastFailure: row.lastFailure as AiFailure | null,
  lastCheckedAt: row.lastCheckedAt,
})

export const createAiStore = (db: Db): AiStore => ({
  getConnection: async (accountId) => {
    const [row] = await db
      .select()
      .from(aiProviderConnections)
      .where(eq(aiProviderConnections.accountId, accountId))
    return row ? toConnection(row) : null
  },

  saveConnection: async (c) => {
    const values = {
      accountId: c.accountId,
      provider: c.provider,
      model: c.model,
      encryptedCredential: c.encryptedCredential,
      credentialHint: c.credentialHint,
      googleAccount: c.googleAccount,
      gcpProject: c.project,
      gcpRegion: c.region,
      status: c.status,
      lastFailure: c.lastFailure,
      lastCheckedAt: c.lastCheckedAt,
      updatedAt: c.lastCheckedAt,
    }
    const { accountId: _, ...update } = values
    await db
      .insert(aiProviderConnections)
      .values(values)
      .onConflictDoUpdate({ target: aiProviderConnections.accountId, set: update })
  },

  setStatus: async (accountId, status, failure, checkedAt) => {
    await db
      .update(aiProviderConnections)
      .set({
        status,
        lastFailure: failure,
        updatedAt: sql`now()`,
        ...(checkedAt ? { lastCheckedAt: checkedAt } : {}),
      })
      .where(eq(aiProviderConnections.accountId, accountId))
  },

  deleteConnection: async (accountId) => {
    await db.delete(aiProviderConnections).where(eq(aiProviderConnections.accountId, accountId))
  },

  savePendingGrant: async (g) => {
    const { accountId: _, ...update } = g
    await db
      .insert(aiPendingGoogleGrants)
      .values(g)
      .onConflictDoUpdate({ target: aiPendingGoogleGrants.accountId, set: update })
  },

  getPendingGrant: async (accountId, now) => {
    const [row] = await db
      .select()
      .from(aiPendingGoogleGrants)
      .where(
        and(
          eq(aiPendingGoogleGrants.accountId, accountId),
          gt(aiPendingGoogleGrants.expiresAt, now),
        ),
      )
    return row ?? null
  },

  deletePendingGrant: async (accountId) => {
    await db.delete(aiPendingGoogleGrants).where(eq(aiPendingGoogleGrants.accountId, accountId))
  },

  saveOauthState: async (s, now) => {
    await db.delete(aiOauthStates).where(lte(aiOauthStates.expiresAt, now))
    await db.insert(aiOauthStates).values(s)
  },

  takeOauthState: async (state, now) => {
    await db.delete(aiOauthStates).where(lt(aiOauthStates.expiresAt, now))
    const [row] = await db.delete(aiOauthStates).where(eq(aiOauthStates.state, state)).returning()
    return row && row.expiresAt > now ? row : null
  },

  appendUsage: async (entry) => {
    await db.insert(aiUsageEntries).values(entry)
  },

  usageByRefs: async (accountId, refs) => {
    if (refs.length === 0) return []
    const rows = await db
      .select()
      .from(aiUsageEntries)
      .where(and(eq(aiUsageEntries.accountId, accountId), inArray(aiUsageEntries.ref, [...refs])))
    return rows.map((r) => ({
      ...r,
      provider: r.provider as ProviderKind,
      outcome: r.outcome as UsageEntry['outcome'],
    }))
  },

  usageSummary: async (accountId) => {
    const [row] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsageEntries.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsageEntries.outputTokens}), 0)::int`,
      })
      .from(aiUsageEntries)
      .where(eq(aiUsageEntries.accountId, accountId))
    return row ?? { calls: 0, inputTokens: 0, outputTokens: 0 }
  },
})
