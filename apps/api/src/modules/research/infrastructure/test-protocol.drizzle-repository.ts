import { ConcurrencyError } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { TestProtocolRepository } from '../domain/test-protocol.repository.ts'
import {
  TestProtocol,
  type TestProtocolContent,
  type TestProtocolOrigin,
} from '../domain/test-protocol.ts'
import { researchProtocolChecks, researchTestProtocols } from './schema.ts'

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

  insert: async (protocol) => {
    const inserted = await tx
      .insert(researchTestProtocols)
      .values({ ...protocol.snapshot(), version: 0 })
      .onConflictDoNothing({ target: researchTestProtocols.studyId })
      .returning({ id: researchTestProtocols.studyId })
    if (inserted.length === 0) throw new ConcurrencyError()
  },

  update: async (protocol) => {
    const p = protocol.snapshot()
    const updated = await tx
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
  },

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
