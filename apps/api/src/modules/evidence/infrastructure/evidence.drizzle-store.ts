import { and, count, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { EvidenceStore, Reading, StoredVerbatim } from '../application/ports.ts'
import type { FactsFailure, FactsRun } from '../domain/analysis-run.ts'
import type { TextAnalysed } from '../domain/analysis-state.ts'
import type { Fact, FactStatus, Polarity, Translation } from '../domain/facts.ts'
import {
  evidenceConsents,
  evidenceFacts,
  evidenceFactVerbatims,
  evidenceReadings,
  evidenceRuns,
  evidenceSpeakers,
  evidenceVerbatims,
} from './schema.ts'

/** Thrown inside a transaction to roll it back when a fact changed meanwhile. */
const STALE = Symbol('stale')

const runOf = (r: typeof evidenceRuns.$inferSelect): FactsRun => ({
  ...r,
  sessions: r.sessions.map((s) => ({
    ...s,
    ...(s.failure ? { failure: s.failure as FactsFailure } : {}),
  })) as FactsRun['sessions'],
  failure: r.failure as FactsFailure | null,
})

const verbatimOf = (r: typeof evidenceVerbatims.$inferSelect): StoredVerbatim => ({
  ...r,
  origin: r.origin as StoredVerbatim['origin'],
})

const readingOf = (r: typeof evidenceReadings.$inferSelect): Reading => ({
  ...r,
  textAnalysed: r.textAnalysed as TextAnalysed,
})

const factRow = (f: Fact) => ({
  id: f.id,
  sessionId: f.sessionId,
  studyId: f.studyId,
  statementEn: f.statement.en,
  statementFr: f.statement.fr,
  translation: f.translation,
  polarity: f.polarity,
  themeId: f.theme?.id ?? null,
  themeTitle: f.theme?.title ?? null,
  origin: f.origin,
  status: f.status,
  runId: f.runId,
  decidedBy: f.decidedBy,
  decidedAt: f.decidedAt,
  version: f.version,
})

export const createEvidenceStore = (db: Db): EvidenceStore => {
  const factsWhere = async (where: ReturnType<typeof eq>): Promise<Fact[]> => {
    // Creation order (ids are UUID v7): a decision, which rewrites the row, never moves a fact.
    const rows = await db.select().from(evidenceFacts).where(where).orderBy(evidenceFacts.id)
    if (rows.length === 0) return []
    const links = await db
      .select()
      .from(evidenceFactVerbatims)
      .where(
        inArray(
          evidenceFactVerbatims.factId,
          rows.map((r) => r.id),
        ),
      )
    return rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        studyId: r.studyId,
        statement: { en: r.statementEn, fr: r.statementFr },
        translation: r.translation as Translation,
        polarity: r.polarity as Polarity,
        theme: r.themeId ? { id: r.themeId, title: r.themeTitle ?? '' } : null,
        verbatimIds: links.filter((l) => l.factId === r.id).map((l) => l.verbatimId),
        origin: r.origin as Fact['origin'],
        status: r.status as FactStatus,
        runId: r.runId,
        decidedBy: r.decidedBy,
        decidedAt: r.decidedAt,
        version: r.version,
      }))
  }

  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

  /** A fact saved if still at version `expected`, with its verbatims. */
  const updateFact = async (tx: Tx, fact: Fact, expected: number) => {
    const { id: _, ...row } = factRow(fact)
    const updated = await tx
      .update(evidenceFacts)
      .set(row)
      .where(and(eq(evidenceFacts.id, fact.id), eq(evidenceFacts.version, expected)))
      .returning({ id: evidenceFacts.id })
    if (updated.length === 0) return 'stale' as const
    await tx.delete(evidenceFactVerbatims).where(eq(evidenceFactVerbatims.factId, fact.id))
    if (fact.verbatimIds.length > 0)
      await tx
        .insert(evidenceFactVerbatims)
        .values(fact.verbatimIds.map((verbatimId) => ({ factId: fact.id, verbatimId })))
    return 'ok' as const
  }

  /** Verbatims set aside, and taken out of the facts still to decide. */
  const setAsideIn = async (tx: Tx, verbatimIds: readonly string[]) => {
    if (verbatimIds.length === 0) return
    await tx
      .update(evidenceVerbatims)
      .set({ setAside: true })
      .where(inArray(evidenceVerbatims.id, [...verbatimIds]))
    const proposed = tx
      .select({ id: evidenceFacts.id })
      .from(evidenceFacts)
      .where(eq(evidenceFacts.status, 'proposed'))
    const touched = await tx
      .delete(evidenceFactVerbatims)
      .where(
        and(
          inArray(evidenceFactVerbatims.verbatimId, [...verbatimIds]),
          inArray(evidenceFactVerbatims.factId, proposed),
        ),
      )
      .returning({ factId: evidenceFactVerbatims.factId })
    const ids = [...new Set(touched.map((t) => t.factId))]
    if (ids.length === 0) return
    await tx
      .update(evidenceFacts)
      .set({ version: sql`${evidenceFacts.version} + 1` })
      .where(inArray(evidenceFacts.id, ids))
    // A proposed fact left without verbatim goes.
    const linked = tx.select({ id: evidenceFactVerbatims.factId }).from(evidenceFactVerbatims)
    await tx
      .delete(evidenceFacts)
      .where(and(inArray(evidenceFacts.id, ids), notInArray(evidenceFacts.id, linked)))
  }

  const insertFacts = async (tx: Pick<Db, 'insert'>, facts: readonly Fact[], at: Date) => {
    if (facts.length === 0) return
    await tx.insert(evidenceFacts).values(facts.map((f) => ({ ...factRow(f), createdAt: at })))
    const links = facts.flatMap((f) =>
      f.verbatimIds.map((verbatimId) => ({ factId: f.id, verbatimId })),
    )
    if (links.length > 0) await tx.insert(evidenceFactVerbatims).values(links)
  }

  return {
    openRun: async (studyId) => {
      const [row] = await db
        .select()
        .from(evidenceRuns)
        .where(and(eq(evidenceRuns.studyId, studyId), isNull(evidenceRuns.finishedAt)))
      return row ? runOf(row) : null
    },
    runsOf: async (studyId) =>
      (
        await db
          .select()
          .from(evidenceRuns)
          .where(eq(evidenceRuns.studyId, studyId))
          .orderBy(desc(evidenceRuns.startedAt))
      ).map(runOf),
    getRun: async (id) => {
      const [row] = await db.select().from(evidenceRuns).where(eq(evidenceRuns.id, id))
      return row ? runOf(row) : null
    },
    startRun: async (run) => {
      const inserted = await db
        .insert(evidenceRuns)
        .values({ ...run, sessions: [...run.sessions], stoppedSessions: [...run.stoppedSessions] })
        .onConflictDoNothing()
        .returning({ id: evidenceRuns.id })
      return inserted.length > 0
    },
    // `stopRequested` and `stoppedSessions` are written only by `requestStop` and
    // `requestSessionStop`: a run saving its progress never clears them.
    saveRun: async (run) => {
      await db
        .update(evidenceRuns)
        .set({
          sessions: [...run.sessions],
          leftOut: run.leftOut,
          failure: run.failure,
          heartbeatAt: run.heartbeatAt,
          finishedAt: run.finishedAt,
        })
        .where(and(eq(evidenceRuns.id, run.id), isNull(evidenceRuns.finishedAt)))
    },
    requestStop: async (runId) => {
      await db.update(evidenceRuns).set({ stopRequested: true }).where(eq(evidenceRuns.id, runId))
    },
    // One statement: the row lock orders it with the worker's `saveRun`, so an interview the worker
    // already saved as done can no longer be taken out.
    requestSessionStop: async (runId, sessionId) => {
      const updated = await db
        .update(evidenceRuns)
        .set({
          stoppedSessions: sql`case when ${evidenceRuns.stoppedSessions} ? ${sessionId} then ${evidenceRuns.stoppedSessions} else ${evidenceRuns.stoppedSessions} || jsonb_build_array(${sessionId}::text) end`,
        })
        .where(
          and(
            eq(evidenceRuns.id, runId),
            isNull(evidenceRuns.finishedAt),
            sql`exists (select 1 from jsonb_array_elements(${evidenceRuns.sessions}) e where e->>'sessionId' = ${sessionId} and e->>'state' not in ('done', 'failed'))`,
          ),
        )
        .returning({ id: evidenceRuns.id })
      return updated.length > 0
    },

    readingsOf: async (studyId) =>
      (await db.select().from(evidenceReadings).where(eq(evidenceReadings.studyId, studyId))).map(
        readingOf,
      ),
    verbatimsOf: async (sessionId) =>
      (
        await db.select().from(evidenceVerbatims).where(eq(evidenceVerbatims.sessionId, sessionId))
      ).map(verbatimOf),
    verbatimsOfStudy: async (studyId) =>
      (await db.select().from(evidenceVerbatims).where(eq(evidenceVerbatims.studyId, studyId))).map(
        verbatimOf,
      ),
    factsOf: (sessionId) => factsWhere(eq(evidenceFacts.sessionId, sessionId)),
    factsOfStudy: (studyId) => factsWhere(eq(evidenceFacts.studyId, studyId)),
    factCounts: async (studyId, sessionIds) =>
      sessionIds.length === 0
        ? []
        : (
            await db
              .select({ status: evidenceFacts.status, count: count() })
              .from(evidenceFacts)
              .where(
                and(
                  eq(evidenceFacts.studyId, studyId),
                  inArray(evidenceFacts.sessionId, [...sessionIds]),
                ),
              )
              .groupBy(evidenceFacts.status)
          ).map((row) => ({ status: row.status as FactStatus, count: row.count })),
    getFact: async (id) => (await factsWhere(eq(evidenceFacts.id, id)))[0] ?? null,
    factsByIds: async (ids) =>
      ids.length === 0 ? [] : factsWhere(inArray(evidenceFacts.id, [...ids])),
    verbatimsByIds: async (ids) =>
      ids.length === 0
        ? []
        : (
            await db
              .select()
              .from(evidenceVerbatims)
              .where(inArray(evidenceVerbatims.id, [...ids]))
          ).map(verbatimOf),

    replaceReading: async ({ sessionId, keep, verbatims, facts, reading }) => {
      await db.transaction(async (tx) => {
        await tx
          .delete(evidenceFacts)
          .where(and(eq(evidenceFacts.sessionId, sessionId), eq(evidenceFacts.status, 'proposed')))
        // AI verbatims no decided fact uses, not set aside and not found again, go.
        const used = tx.select({ id: evidenceFactVerbatims.verbatimId }).from(evidenceFactVerbatims)
        await tx
          .delete(evidenceVerbatims)
          .where(
            and(
              eq(evidenceVerbatims.sessionId, sessionId),
              eq(evidenceVerbatims.origin, 'ai'),
              eq(evidenceVerbatims.setAside, false),
              notInArray(evidenceVerbatims.id, used),
              keep.length > 0 ? notInArray(evidenceVerbatims.id, [...keep]) : sql`true`,
            ),
          )
        // A fact taken up by this reading but decided meanwhile stays as the person decided it, and
        // the new verbatims only it cited are not added (review of PR #14).
        const still = facts.length
          ? new Set(
              (
                await tx
                  .select({ id: evidenceFacts.id })
                  .from(evidenceFacts)
                  .where(
                    inArray(
                      evidenceFacts.id,
                      facts.map((f) => f.id),
                    ),
                  )
              ).map((r) => r.id),
            )
          : new Set<string>()
        const kept = facts.filter((f) => !still.has(f.id))
        const cited = new Set(kept.flatMap((f) => f.verbatimIds))
        const skipped = new Set(facts.filter((f) => still.has(f.id)).flatMap((f) => f.verbatimIds))
        const added = verbatims.filter(
          (v) => !skipped.has(v.id) || cited.has(v.id) || keep.includes(v.id),
        )
        if (added.length > 0) await tx.insert(evidenceVerbatims).values([...added])
        await insertFacts(tx, kept, reading.readAt)
        await tx
          .insert(evidenceReadings)
          .values(reading)
          .onConflictDoUpdate({ target: evidenceReadings.sessionId, set: reading })
      })
    },

    saveFact: async (fact, expected) => {
      if (expected === null) {
        await db.transaction((tx) => insertFacts(tx, [fact], fact.decidedAt ?? new Date()))
        return 'ok'
      }
      return db.transaction((tx) => updateFact(tx, fact, expected))
    },
    addVerbatim: async (v, attachTo) =>
      db
        .transaction(async (tx) => {
          await tx.insert(evidenceVerbatims).values(v)
          if (!attachTo) return 'ok' as const
          if ((await updateFact(tx, attachTo.fact, attachTo.expected)) === 'stale') throw STALE
          return 'ok' as const
        })
        .catch((error: unknown) => {
          if (error === STALE) return 'stale' as const
          throw error
        }),
    resizeVerbatim: async (id, place) => {
      await db
        .update(evidenceVerbatims)
        .set({ ...place, origin: 'person' })
        .where(eq(evidenceVerbatims.id, id))
    },
    setAside: async (verbatimId) => {
      await db.transaction((tx) => setAsideIn(tx, [verbatimId]))
    },
    moveVerbatims: async (moves) => {
      for (const m of moves)
        await db
          .update(evidenceVerbatims)
          .set({ segmentId: m.segmentId, offset: m.offset, length: m.length })
          .where(eq(evidenceVerbatims.id, m.id))
    },
    attributeSpeaker: async ({ sessionId, speaker, participant, setAside, by, at }) => {
      await db.transaction(async (tx) => {
        // An interviewer's words are no evidence: their verbatims are set aside with the same write.
        if (setAside) {
          const theirs = await tx
            .select({ id: evidenceVerbatims.id })
            .from(evidenceVerbatims)
            .where(
              and(
                eq(evidenceVerbatims.sessionId, sessionId),
                eq(evidenceVerbatims.speaker, speaker),
                eq(evidenceVerbatims.setAside, false),
              ),
            )
          await setAsideIn(
            tx,
            theirs.map((v) => v.id),
          )
        }
        await tx
          .insert(evidenceSpeakers)
          .values({ sessionId, speaker, participant, decidedBy: by, decidedAt: at })
          .onConflictDoUpdate({
            target: [evidenceSpeakers.sessionId, evidenceSpeakers.speaker],
            set: { participant, decidedBy: by, decidedAt: at },
          })
        await tx
          .update(evidenceVerbatims)
          .set({ participant: participant === 'interviewer' ? null : participant })
          .where(
            and(eq(evidenceVerbatims.sessionId, sessionId), eq(evidenceVerbatims.speaker, speaker)),
          )
      })
    },
    speakersOf: async (sessionId) =>
      new Map(
        (
          await db.select().from(evidenceSpeakers).where(eq(evidenceSpeakers.sessionId, sessionId))
        ).map((r) => [r.speaker, r.participant]),
      ),

    hasConsent: async (accountId, studyId, provider) => {
      const [row] = await db
        .select()
        .from(evidenceConsents)
        .where(
          and(eq(evidenceConsents.accountId, accountId), eq(evidenceConsents.studyId, studyId)),
        )
      return row?.provider === provider
    },
    giveConsent: async (accountId, studyId, provider, at) => {
      await db
        .insert(evidenceConsents)
        .values({ accountId, studyId, provider, givenAt: at })
        .onConflictDoUpdate({
          target: [evidenceConsents.accountId, evidenceConsents.studyId],
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
