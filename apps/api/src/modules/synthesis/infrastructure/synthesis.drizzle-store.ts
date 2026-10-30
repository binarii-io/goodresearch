import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { SynthesisStore } from '../application/ports.ts'
import type { PublishedDeck } from '../domain/debrief.ts'
import type { InsightRun, InsightsFailure, RecommendationRun } from '../domain/insight-run.ts'
import type { FactPolarity, Insight, Link } from '../domain/insights.ts'
import type { RecLink, Recommendation } from '../domain/recommendations.ts'
import type { Takeaways } from '../domain/takeaways.ts'
import {
  synthesisConsents,
  synthesisInsightFacts,
  synthesisInsights,
  synthesisPublishedDecks,
  synthesisRecommendationInsights,
  synthesisRecommendationRuns,
  synthesisRecommendations,
  synthesisRuns,
  synthesisTakeaways,
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

const recRunOf = (r: typeof synthesisRecommendationRuns.$inferSelect): RecommendationRun => ({
  ...r,
  failure: r.failure as InsightsFailure | null,
})

const recLinkOf = (r: typeof synthesisRecommendationInsights.$inferSelect): RecLink => ({
  insightId: r.insightId,
  state: r.state as RecLink['state'],
  origin: r.origin as RecLink['origin'],
  snapshot: {
    statementEn: r.insightStatementEn,
    themeKey: r.insightThemeKey,
    level: r.insightLevel as RecLink['snapshot']['level'],
  },
  by: r.by,
  at: r.at,
})

const recommendationOf = (
  r: typeof synthesisRecommendations.$inferSelect,
  links: readonly RecLink[],
): Recommendation => ({
  id: r.id,
  projectId: r.projectId,
  action: { en: r.actionEn, fr: r.actionFr },
  rationale: { en: r.rationaleEn, fr: r.rationaleFr },
  successMeasure: { en: r.measureEn, fr: r.measureFr },
  kind: r.kind as Recommendation['kind'],
  impact: r.impact as Recommendation['impact'],
  effort: r.effort as Recommendation['effort'],
  owner: r.owner,
  translation: r.translation as Recommendation['translation'],
  pendingTranslation: (r.pendingTranslation as Recommendation['pendingTranslation']) ?? null,
  origin: r.origin as Recommendation['origin'],
  status: r.status as Recommendation['status'],
  runId: r.runId,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
  links,
})

const recommendationRow = (r: Recommendation): typeof synthesisRecommendations.$inferInsert => ({
  id: r.id,
  projectId: r.projectId,
  actionEn: r.action.en,
  actionFr: r.action.fr,
  rationaleEn: r.rationale.en,
  rationaleFr: r.rationale.fr,
  measureEn: r.successMeasure.en,
  measureFr: r.successMeasure.fr,
  kind: r.kind,
  impact: r.impact,
  effort: r.effort,
  owner: r.owner,
  translation: r.translation,
  pendingTranslation: r.pendingTranslation
    ? { from: r.pendingTranslation.from, fields: [...r.pendingTranslation.fields] }
    : null,
  origin: r.origin,
  status: r.status,
  runId: r.runId,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
})

const recLinkRows = (r: Recommendation) =>
  r.links.map((l) => ({
    recommendationId: r.id,
    insightId: l.insightId,
    state: l.state,
    origin: l.origin,
    insightStatementEn: l.snapshot.statementEn,
    insightThemeKey: l.snapshot.themeKey,
    insightLevel: l.snapshot.level,
    by: l.by,
    at: l.at,
  }))

const takeawaysOf = (r: typeof synthesisTakeaways.$inferSelect): Takeaways => ({
  projectId: r.projectId,
  text: { en: r.textEn, fr: r.textFr },
  translation: r.translation as Takeaways['translation'],
  pendingTranslation: (r.pendingTranslation as Takeaways['pendingTranslation']) ?? null,
  savedBy: r.savedBy,
  savedAt: r.savedAt,
  version: r.version,
  savedOver: r.savedOver ?? null,
  withProposed: r.withProposed,
  draft: {
    text: r.draftEn !== null && r.draftFr !== null ? { en: r.draftEn, fr: r.draftFr } : null,
    state: r.draftState as Takeaways['draft']['state'],
    withProposed: r.draftWithProposed,
    savedOver: r.draftSavedOver ?? null,
    by: r.draftBy,
    at: r.draftAt,
  },
})

const deckOf = (r: typeof synthesisPublishedDecks.$inferSelect): PublishedDeck => ({
  projectId: r.projectId,
  fileId: r.fileId,
  folderId: r.folderId,
  studyId: r.studyId,
  link: r.link,
  language: r.language === 'fr' ? 'fr' : 'en',
  withProposed: r.withProposed,
  fingerprint: r.fingerprint,
  studyIds: r.studyIds ?? [],
  revision: r.revision,
  publishedBy: r.publishedBy,
  publishedAt: r.publishedAt,
  version: r.version,
})

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

  const recommendationsWhere = async (where: ReturnType<typeof eq>) => {
    // Creation order (ids are UUID v7): a decision never moves a recommendation.
    const rows = await db
      .select()
      .from(synthesisRecommendations)
      .where(where)
      .orderBy(synthesisRecommendations.id)
    if (rows.length === 0) return []
    const links = await db
      .select()
      .from(synthesisRecommendationInsights)
      .where(
        inArray(
          synthesisRecommendationInsights.recommendationId,
          rows.map((r) => r.id),
        ),
      )
    const byRec = new Map<string, RecLink[]>()
    for (const l of links)
      byRec.set(l.recommendationId, [...(byRec.get(l.recommendationId) ?? []), recLinkOf(l)])
    return rows.map((r) => recommendationOf(r, byRec.get(r.id) ?? []))
  }

  const insertRecommendation = async (tx: Tx, r: Recommendation) => {
    await tx.insert(synthesisRecommendations).values(recommendationRow(r))
    if (r.links.length > 0) await tx.insert(synthesisRecommendationInsights).values(recLinkRows(r))
  }

  const updateRecommendation = async (tx: Tx, r: Recommendation, expected: number) => {
    const { id: _, ...row } = recommendationRow(r)
    const updated = await tx
      .update(synthesisRecommendations)
      .set(row)
      .where(
        and(eq(synthesisRecommendations.id, r.id), eq(synthesisRecommendations.version, expected)),
      )
      .returning({ id: synthesisRecommendations.id })
    if (updated.length === 0) return 'stale' as const
    await tx
      .delete(synthesisRecommendationInsights)
      .where(eq(synthesisRecommendationInsights.recommendationId, r.id))
    if (r.links.length > 0) await tx.insert(synthesisRecommendationInsights).values(recLinkRows(r))
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

    openRecommendationRun: async (projectId) => {
      const [row] = await db
        .select()
        .from(synthesisRecommendationRuns)
        .where(
          and(
            eq(synthesisRecommendationRuns.projectId, projectId),
            isNull(synthesisRecommendationRuns.finishedAt),
          ),
        )
      return row ? recRunOf(row) : null
    },
    recommendationRunsOf: async (projectId) =>
      (
        await db
          .select()
          .from(synthesisRecommendationRuns)
          .where(eq(synthesisRecommendationRuns.projectId, projectId))
          .orderBy(desc(synthesisRecommendationRuns.startedAt))
      ).map(recRunOf),
    getRecommendationRun: async (id) => {
      const [row] = await db
        .select()
        .from(synthesisRecommendationRuns)
        .where(eq(synthesisRecommendationRuns.id, id))
      return row ? recRunOf(row) : null
    },
    startRecommendationRun: async (run) => {
      const inserted = await db
        .insert(synthesisRecommendationRuns)
        .values(run)
        .onConflictDoNothing()
        .returning({ id: synthesisRecommendationRuns.id })
      return inserted.length > 0
    },
    // `stopRequested` is written only by `requestRecommendationStop`.
    saveRecommendationRun: async (run) => {
      await db
        .update(synthesisRecommendationRuns)
        .set({
          calls: run.calls,
          callsDone: run.callsDone,
          leftOut: run.leftOut,
          failure: run.failure,
          heartbeatAt: run.heartbeatAt,
          finishedAt: run.finishedAt,
        })
        .where(
          and(
            eq(synthesisRecommendationRuns.id, run.id),
            isNull(synthesisRecommendationRuns.finishedAt),
          ),
        )
    },
    requestRecommendationStop: async (runId) => {
      await db
        .update(synthesisRecommendationRuns)
        .set({ stopRequested: true })
        .where(eq(synthesisRecommendationRuns.id, runId))
    },
    recommendationsOf: (projectId) =>
      recommendationsWhere(eq(synthesisRecommendations.projectId, projectId)),
    getRecommendation: async (id) =>
      (await recommendationsWhere(eq(synthesisRecommendations.id, id)))[0] ?? null,
    saveRecommendation: async (r, expected) => {
      if (expected === null) {
        await db.transaction((tx) => insertRecommendation(tx, r))
        return 'ok'
      }
      return db.transaction((tx) => updateRecommendation(tx, r, expected))
    },
    applyRecommendations: ({ creates, updates }) =>
      db.transaction(async (tx) => {
        for (const r of creates) await insertRecommendation(tx, r)
        let skipped = 0
        for (const u of updates)
          if ((await updateRecommendation(tx, u.recommendation, u.expected)) === 'stale') skipped++
        return { skipped }
      }),
    getTakeaways: async (projectId) => {
      const [row] = await db
        .select()
        .from(synthesisTakeaways)
        .where(eq(synthesisTakeaways.projectId, projectId))
      return row ? takeawaysOf(row) : null
    },
    saveTakeaways: async (t, expected) => {
      const values = {
        textEn: t.text.en,
        textFr: t.text.fr,
        translation: t.translation,
        pendingTranslation: t.pendingTranslation
          ? { from: t.pendingTranslation.from, fields: [...t.pendingTranslation.fields] }
          : null,
        savedBy: t.savedBy,
        savedAt: t.savedAt,
        version: t.version,
        savedOver: t.savedOver ? [...t.savedOver] : null,
        withProposed: t.withProposed,
      }
      // One statement: inserted when never saved, else updated only at the version seen.
      const saved = await db
        .insert(synthesisTakeaways)
        .values({ projectId: t.projectId, ...values })
        .onConflictDoUpdate({
          target: synthesisTakeaways.projectId,
          set: values,
          setWhere: eq(synthesisTakeaways.version, expected),
        })
        .returning({ version: synthesisTakeaways.version })
      return saved.length > 0 && (expected === 0 || saved[0]?.version === t.version)
        ? 'ok'
        : 'stale'
    },
    saveDraft: async (projectId, draft) => {
      const values = {
        draftEn: draft.text?.en ?? null,
        draftFr: draft.text?.fr ?? null,
        draftState: draft.state,
        draftWithProposed: draft.withProposed,
        draftSavedOver: draft.savedOver ? [...draft.savedOver] : null,
        draftBy: draft.by,
        draftAt: draft.at,
      }
      await db
        .insert(synthesisTakeaways)
        .values({ projectId, ...values })
        .onConflictDoUpdate({ target: synthesisTakeaways.projectId, set: values })
    },
    getPublishedDeck: async (projectId) => {
      const [row] = await db
        .select()
        .from(synthesisPublishedDecks)
        .where(eq(synthesisPublishedDecks.projectId, projectId))
      return row ? deckOf(row) : null
    },
    savePublishedDeck: async (d, expected) => {
      const values = {
        fileId: d.fileId,
        folderId: d.folderId,
        studyId: d.studyId,
        link: d.link,
        language: d.language,
        withProposed: d.withProposed,
        fingerprint: d.fingerprint,
        studyIds: [...d.studyIds],
        revision: d.revision,
        publishedBy: d.publishedBy,
        publishedAt: d.publishedAt,
        version: d.version,
      }
      // A new publication replaces the record whatever it was; an update only at the version seen.
      const saved = await db
        .insert(synthesisPublishedDecks)
        .values({ projectId: d.projectId, ...values })
        .onConflictDoUpdate({
          target: synthesisPublishedDecks.projectId,
          set: values,
          ...(expected === null ? {} : { setWhere: eq(synthesisPublishedDecks.version, expected) }),
        })
        .returning({ version: synthesisPublishedDecks.version })
      return saved.length > 0 && saved[0]?.version === d.version ? 'ok' : 'stale'
    },
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
