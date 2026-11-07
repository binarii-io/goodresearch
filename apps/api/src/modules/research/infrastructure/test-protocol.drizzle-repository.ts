import { ConcurrencyError } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { TestProtocolRepository } from '../domain/test-protocol.repository.ts'
import {
  TestProtocol,
  type TestProtocolContent,
  type TestProtocolOrigin,
} from '../domain/test-protocol.ts'
import {
  researchProtocolChecks,
  researchTestProtocols,
  researchTestProtocolVersions,
} from './schema.ts'

/**
 * Spec 037: each save adds an immutable copy, numbered from 1 (the stored version plus one), in the
 * same transaction as the save.
 */
const keepVersion = (
  tx: Executor,
  p: { studyId: string; content: unknown; updatedAt: Date; updatedBy: string | null },
  version: number,
) =>
  tx.insert(researchTestProtocolVersions).values({
    studyId: p.studyId,
    version,
    content: p.content,
    savedAt: p.updatedAt,
    savedBy: p.updatedBy,
  })

export const drizzleTestProtocolRepository = (tx: Executor): TestProtocolRepository => ({
  findByStudy: async (studyId) => {
    const [row] = await tx
      .select()
      .from(researchTestProtocols)
      .where(eq(researchTestProtocols.studyId, studyId))
    return row
      ? TestProtocol.fromPersistence({
          ...row,
          content: row.content as TestProtocolContent,
          origin: row.origin as TestProtocolOrigin,
        })
      : null
  },

  insert: (protocol) =>
    tx.transaction(async (t) => {
      const inserted = await t
        .insert(researchTestProtocols)
        .values({ ...protocol.snapshot(), version: 0 })
        .onConflictDoNothing({ target: researchTestProtocols.studyId })
        .returning({ id: researchTestProtocols.studyId })
      if (inserted.length === 0) throw new ConcurrencyError()
      await keepVersion(t, protocol.snapshot(), 1)
    }),

  update: (protocol) =>
    tx.transaction(async (t) => {
      const p = protocol.snapshot()
      const updated = await t
        .update(researchTestProtocols)
        .set({
          content: p.content,
          origin: p.origin,
          updatedBy: p.updatedBy,
          updatedAt: p.updatedAt,
          version: sql`${researchTestProtocols.version} + 1`,
        })
        .where(
          and(
            eq(researchTestProtocols.studyId, p.studyId),
            eq(researchTestProtocols.version, p.version),
          ),
        )
        .returning({ id: researchTestProtocols.studyId })
      if (updated.length === 0) throw new ConcurrencyError()
      await keepVersion(t, p, p.version + 2)
    }),

  mark: async (row) => {
    await tx
      .insert(researchProtocolChecks)
      .values(row)
      .onConflictDoUpdate({
        target: [researchProtocolChecks.studyId, researchProtocolChecks.kind],
        set: {
          protocolVersion: row.protocolVersion,
          markedBy: row.markedBy,
          markedAt: row.markedAt,
        },
      })
  },

  unmark: async (studyId, kind) => {
    await tx
      .delete(researchProtocolChecks)
      .where(
        and(eq(researchProtocolChecks.studyId, studyId), eq(researchProtocolChecks.kind, kind)),
      )
  },
})
