import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { UsabilityFactStore } from '../application/usability-ports.ts'
import type { Polarity, Translation } from '../domain/facts.ts'
import type { UsabilityFact } from '../domain/usability-facts.ts'
import { evidenceFacts, evidenceUsabilitySupports } from './schema.ts'

type FactRow = typeof evidenceFacts.$inferSelect
type SupportRow = typeof evidenceUsabilitySupports.$inferSelect

const factOf = (r: FactRow, s: SupportRow): UsabilityFact => ({
  id: r.id,
  observationId: s.observationId,
  studyId: r.studyId,
  sessionId: r.sessionId ?? '',
  statement: { en: r.statementEn, fr: r.statementFr },
  translation: r.translation as Translation,
  polarity: r.polarity as Polarity,
  theme: { id: r.themeId ?? '', title: r.themeTitle ?? '' },
  origin: r.origin as 'ai' | 'person',
  status: r.status as UsabilityFact['status'],
  support: {
    quote: s.quote,
    momentMs: s.momentMs,
    screenshotKey: s.screenshotKey,
    participant: s.participant,
  },
  decidedBy: r.decidedBy ?? '',
  decidedAt: r.decidedAt ?? r.createdAt,
  version: r.version,
})

const factRow = (f: UsabilityFact) => ({
  statementEn: f.statement.en,
  statementFr: f.statement.fr,
  translation: f.translation,
  polarity: f.polarity,
  themeId: f.theme.id,
  themeTitle: f.theme.title,
  origin: f.origin,
  status: f.status,
  decidedBy: f.decidedBy,
  decidedAt: f.decidedAt,
  version: f.version,
})

const supportRow = (f: UsabilityFact) => ({
  observationId: f.observationId,
  quote: f.support.quote,
  momentMs: f.support.momentMs,
  screenshotKey: f.support.screenshotKey,
  participant: f.support.participant,
})

/** Spec 038: usability facts, in the facts table with source `usability` and their support. */
export const createUsabilityFactStore = (db: Db): UsabilityFactStore => {
  const usability = eq(evidenceFacts.source, 'usability')
  const read = async (where: ReturnType<typeof eq>) =>
    (
      await db
        .select({ fact: evidenceFacts, support: evidenceUsabilitySupports })
        .from(evidenceFacts)
        .innerJoin(
          evidenceUsabilitySupports,
          eq(evidenceUsabilitySupports.factId, evidenceFacts.id),
        )
        .where(and(usability, where))
        .orderBy(evidenceFacts.id)
    ).map((r) => factOf(r.fact, r.support))
  return {
    byObservation: async (observationId) =>
      (await read(eq(evidenceUsabilitySupports.observationId, observationId)))[0] ?? null,
    get: async (id) => (await read(eq(evidenceFacts.id, id)))[0] ?? null,
    put: async (fact, at) => {
      await db.transaction(async (tx) => {
        await tx
          .insert(evidenceFacts)
          .values({
            id: fact.id,
            source: 'usability',
            sessionId: fact.sessionId,
            studyId: fact.studyId,
            runId: null,
            createdAt: at,
            ...factRow(fact),
          })
          .onConflictDoUpdate({ target: evidenceFacts.id, set: factRow(fact) })
        await tx
          .insert(evidenceUsabilitySupports)
          .values({ factId: fact.id, ...supportRow(fact) })
          .onConflictDoUpdate({ target: evidenceUsabilitySupports.factId, set: supportRow(fact) })
      })
    },
    save: async (fact, expected) => {
      const done = await db
        .update(evidenceFacts)
        .set(factRow(fact))
        .where(and(eq(evidenceFacts.id, fact.id), eq(evidenceFacts.version, expected), usability))
        .returning({ id: evidenceFacts.id })
      return done.length ? 'ok' : 'conflict'
    },
    deleteByObservation: async (observationId) => {
      const ids = db
        .select({ id: evidenceUsabilitySupports.factId })
        .from(evidenceUsabilitySupports)
        .where(eq(evidenceUsabilitySupports.observationId, observationId))
      // The support goes with its fact (cascade).
      await db.delete(evidenceFacts).where(and(usability, inArray(evidenceFacts.id, ids)))
    },
    ofStudies: async (studyIds) =>
      studyIds.length === 0 ? [] : read(inArray(evidenceFacts.studyId, [...studyIds])),
    byIds: async (ids) => (ids.length === 0 ? [] : read(inArray(evidenceFacts.id, [...ids]))),
  }
}

/** In memory, for the use-case tests. */
export const createMemoryUsabilityFactStore = (): UsabilityFactStore & {
  readonly facts: Map<string, UsabilityFact>
} => {
  const facts = new Map<string, UsabilityFact>()
  const all = () => [...facts.values()]
  return {
    facts,
    byObservation: async (id) => all().find((f) => f.observationId === id) ?? null,
    get: async (id) => facts.get(id) ?? null,
    put: async (fact) => {
      facts.set(fact.id, fact)
    },
    save: async (fact, expected) => {
      if (facts.get(fact.id)?.version !== expected) return 'conflict'
      facts.set(fact.id, fact)
      return 'ok'
    },
    deleteByObservation: async (id) => {
      for (const f of all()) if (f.observationId === id) facts.delete(f.id)
    },
    ofStudies: async (ids) => all().filter((f) => ids.includes(f.studyId)),
    byIds: async (ids) => ids.flatMap((id) => facts.get(id) ?? []),
  }
}
