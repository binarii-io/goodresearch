import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { SynthesisStore } from '../application/ports.ts'
import type { InsightRun, InsightsFailure } from '../domain/insight-run.ts'
import type { FactPolarity, Insight, Link } from '../domain/insights.ts'
import {
  synthesisConsents,
  synthesisInsightFacts,
  synthesisInsights,
  synthesisRuns,
} from './schema.ts'

const runOf = (r: typeof synthesisRuns.$inferSelect): InsightRun => ({
  ...r,
  failure: r.failure as InsightsFailure | null,
})

const linkOf = (r: typeof synthesisInsightFacts.$inferSelect): Link => ({
  factId: r.factId,
  role: r.role as Link['role'],
  state: r.state as Link['state'],
  origin: r.origin as Link['origin'],
  snapshot: {
    version: r.factVersion,
    polarity: r.factPolarity as FactPolarity,
    themeId: r.factThemeId,
    statementEn: r.factStatementEn,
  },
  by: r.by,
  at: r.at,
})

const insightOf = (r: typeof synthesisInsights.$inferSelect, links: readonly Link[]): Insight => ({
  id: r.id,
  projectId: r.projectId,
  theme: { key: r.themeKey, title: r.themeTitle },
  statement: { en: r.statementEn, fr: r.statementFr },
  description: { en: r.descriptionEn, fr: r.descriptionFr },
  counterEvidence: { en: r.counterEn, fr: r.counterFr },
  minorityView: { en: r.minorityEn, fr: r.minorityFr },
  translation: r.translation as Insight['translation'],
  origin: r.origin as Insight['origin'],
  status: r.status as Insight['status'],
  runId: r.runId,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
  links,
  pendingTranslation: r.pendingTranslation ?? null,
})

const insightRow = (i: Insight): typeof synthesisInsights.$inferInsert => ({
  id: i.id,
  projectId: i.projectId,
  themeKey: i.theme.key,
  themeTitle: i.theme.title,
  statementEn: i.statement.en,
  statementFr: i.statement.fr,
  descriptionEn: i.description.en,
  descriptionFr: i.description.fr,
  counterEn: i.counterEvidence.en,
  counterFr: i.counterEvidence.fr,
  minorityEn: i.minorityView.en,
  minorityFr: i.minorityView.fr,
  translation: i.translation,
  origin: i.origin,
  status: i.status,
  runId: i.runId,
  decidedBy: i.decidedBy,
  decidedAt: i.decidedAt,
  version: i.version,
  pendingTranslation: i.pendingTranslation
    ? { from: i.pendingTranslation.from, fields: [...i.pendingTranslation.fields] }
    : null,
})

const linkRows = (i: Insight) =>
  i.links.map((l) => ({
    insightId: i.id,
    factId: l.factId,
    role: l.role,
    state: l.state,
    origin: l.origin,
    factVersion: l.snapshot.version,
    factPolarity: l.snapshot.polarity,
    factThemeId: l.snapshot.themeId,
    factStatementEn: l.snapshot.statementEn,
    by: l.by,
    at: l.at,
  }))

export const createSynthesisStore = (db: Db): SynthesisStore => {
  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

  const insightsWhere = async (where: ReturnType<typeof eq>) => {
    // Creation order (ids are UUID v7): a decision, which rewrites the row, never moves an insight.
    const rows = await db
      .select()
      .from(synthesisInsights)
      .where(where)
      .orderBy(synthesisInsights.id)
    if (rows.length === 0) return []
    const links = await db
      .select()
      .from(synthesisInsightFacts)
      .where(
        inArray(
          synthesisInsightFacts.insightId,
          rows.map((r) => r.id),
        ),
      )
    const byInsight = new Map<string, Link[]>()
    for (const l of links)
      byInsight.set(l.insightId, [...(byInsight.get(l.insightId) ?? []), linkOf(l)])
    return rows.map((r) => insightOf(r, byInsight.get(r.id) ?? []))
  }

  const insert = async (tx: Tx, i: Insight) => {
    await tx.insert(synthesisInsights).values(insightRow(i))
    if (i.links.length > 0) await tx.insert(synthesisInsightFacts).values(linkRows(i))
  }

  /** An insight saved if still at version `expected`, with its links. */
  const update = async (tx: Tx, i: Insight, expected: number) => {
    const { id: _, ...row } = insightRow(i)
    const updated = await tx
      .update(synthesisInsights)
      .set(row)
      .where(and(eq(synthesisInsights.id, i.id), eq(synthesisInsights.version, expected)))
      .returning({ id: synthesisInsights.id })
    if (updated.length === 0) return 'stale' as const
    await tx.delete(synthesisInsightFacts).where(eq(synthesisInsightFacts.insightId, i.id))
    if (i.links.length > 0) await tx.insert(synthesisInsightFacts).values(linkRows(i))
    return 'ok' as const
  }

  return {
    openRun: async (projectId) => {
      const [row] = await db
        .select()
        .from(synthesisRuns)
        .where(and(eq(synthesisRuns.projectId, projectId), isNull(synthesisRuns.finishedAt)))
      return row ? runOf(row) : null
    },
    runsOf: async (projectId) =>
      (
        await db
          .select()
          .from(synthesisRuns)
          .where(eq(synthesisRuns.projectId, projectId))
          .orderBy(desc(synthesisRuns.startedAt))
      ).map(runOf),
    getRun: async (id) => {
      const [row] = await db.select().from(synthesisRuns).where(eq(synthesisRuns.id, id))
      return row ? runOf(row) : null
    },
    startRun: async (run) => {
      const inserted = await db
        .insert(synthesisRuns)
        .values({ ...run, studyIds: [...run.studyIds] })
        .onConflictDoNothing()
        .returning({ id: synthesisRuns.id })
      return inserted.length > 0
    },
    // `stopRequested` is written only by `requestStop`: a run saving its progress never clears it.
    saveRun: async (run) => {
      await db
        .update(synthesisRuns)
        .set({
          calls: run.calls,
          callsDone: run.callsDone,
          leftOut: run.leftOut,
          failure: run.failure,
          heartbeatAt: run.heartbeatAt,
          finishedAt: run.finishedAt,
        })
        .where(and(eq(synthesisRuns.id, run.id), isNull(synthesisRuns.finishedAt)))
    },
    requestStop: async (runId) => {
      await db.update(synthesisRuns).set({ stopRequested: true }).where(eq(synthesisRuns.id, runId))
    },

    insightsOf: (projectId) => insightsWhere(eq(synthesisInsights.projectId, projectId)),
    getInsight: async (id) => (await insightsWhere(eq(synthesisInsights.id, id)))[0] ?? null,
    saveInsight: async (insight, expected) => {
      if (expected === null) {
        await db.transaction((tx) => insert(tx, insight))
        return 'ok'
      }
      return db.transaction((tx) => update(tx, insight, expected))
    },
    applyRun: ({ creates, updates }) =>
      db.transaction(async (tx) => {
        for (const i of creates) await insert(tx, i)
        let skipped = 0
        for (const u of updates)
          if ((await update(tx, u.insight, u.expected)) === 'stale') skipped++
        return { skipped }
      }),

    hasConsent: async (accountId, projectId, provider) => {
      const [row] = await db
        .select()
        .from(synthesisConsents)
        .where(
          and(
            eq(synthesisConsents.accountId, accountId),
            eq(synthesisConsents.projectId, projectId),
          ),
        )
      return row?.provider === provider
    },
    giveConsent: async (accountId, projectId, provider, at) => {
      await db
        .insert(synthesisConsents)
        .values({ accountId, projectId, provider, givenAt: at })
        .onConflictDoUpdate({
          target: [synthesisConsents.accountId, synthesisConsents.projectId],
          set: { provider, givenAt: at },
        })
    },
    accountNames: async (ids) => {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const rows = await db
        .select({ id: auth_users.id, name: auth_users.name, status: auth_users.status })
        .from(auth_users)
        .where(inArray(auth_users.id, unique))
      return new Map(rows.filter((r) => r.status !== 'deleted').map((r) => [r.id, r.name]))
    },
  }
}
