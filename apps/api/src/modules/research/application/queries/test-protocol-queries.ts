import type { StandardTexts, TestProtocol, TestProtocolDraft } from '@goodresearch/contracts'
import { err, ok, type Result, STANDARD_QUESTIONS } from '@goodresearch/shared'
import { and, asc, eq } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import {
  checkProtocol,
  checksOf,
  checkTask,
  plannedMinutes,
  scenarioWords,
} from '../../domain/protocol-checks.ts'
import type { ProtocolReadinessKind } from '../../domain/test-protocol.repository.ts'
import type { TestProtocolContent } from '../../domain/test-protocol.ts'
import {
  researchProtocolChecks,
  researchStudies,
  researchTestProtocols,
  researchTestProtocolVersions,
} from '../../infrastructure/schema.ts'
import type { StudyActionGate, TeamDirectory } from '../ports.ts'

type Denied = 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_A_USABILITY_TEST_STUDY'

/** The fixed SUS and SEQ texts of the protocol's language, when on (FR-006, FR-006a). */
export const standardTextsOf = (
  p: Pick<TestProtocolContent, 'framing' | 'questionnaire' | 'easeQuestion'>,
): StandardTexts => {
  const texts = STANDARD_QUESTIONS[p.framing.language]
  return {
    sus:
      p.questionnaire === 'sus-v1'
        ? { ...texts['sus-v1'], items: [...texts['sus-v1'].items] }
        : null,
    seq: p.easeQuestion === 'seq-v1' ? { ...texts['seq-v1'] } : null,
  }
}

/** The rules on a draft of the assistant, before it has ids (FR-007). */
export const checkTestProtocolDraft = (draft: TestProtocolDraft) => {
  const content = {
    ...draft,
    tasks: draft.tasks.map((t, i) => ({ ...t, id: String(i) })),
    retiredTaskIds: [],
  } as TestProtocolContent
  const scenario = scenarioWords(content.scenario)
  return {
    tasks: content.tasks.map((t) => ({
      instruction: t.instruction,
      flags: checkTask(t, scenario),
    })),
    whole: checkProtocol(content),
    plannedMinutes: plannedMinutes(content),
  }
}

/** Reads of a study's test protocol (spec 036), with the same gates as the guide. */
export const makeTestProtocolQueries = (deps: {
  db: Db
  teams: TeamDirectory
  gate: StudyActionGate
}) => {
  const { db } = deps

  const studyOf = async (studyId: string) => {
    const [row] = await db
      .select({ teamId: researchStudies.teamId, type: researchStudies.type })
      .from(researchStudies)
      .where(eq(researchStudies.id, studyId))
    return row ?? null
  }

  const protocolOf = async (studyId: string): Promise<TestProtocol | null> => {
    const [row] = await db
      .select({ p: researchTestProtocols, updatedByName: auth_users.name })
      .from(researchTestProtocols)
      .leftJoin(auth_users, eq(auth_users.id, researchTestProtocols.updatedBy))
      .where(eq(researchTestProtocols.studyId, studyId))
    if (!row) return null
    const content = row.p.content as TestProtocolContent
    const marks = await db
      .select({ mark: researchProtocolChecks, name: auth_users.name })
      .from(researchProtocolChecks)
      .leftJoin(auth_users, eq(auth_users.id, researchProtocolChecks.markedBy))
      .where(eq(researchProtocolChecks.studyId, studyId))
    return {
      studyId,
      content: content as TestProtocol['content'],
      origin: row.p.origin as TestProtocol['origin'],
      // An anonymised (deleted) account has an empty name.
      updatedBy: row.updatedByName === null ? null : { name: row.updatedByName },
      updatedAt: row.p.updatedAt.toISOString(),
      version: row.p.version,
      checks: checksOf(content),
      plannedMinutes: plannedMinutes(content),
      standard: standardTextsOf(content),
      readiness: marks.map((m) => ({
        kind: m.mark.kind as ProtocolReadinessKind,
        by: m.name === null ? null : { name: m.name },
        at: m.mark.markedAt.toISOString(),
        changedSince: m.mark.protocolVersion !== row.p.version,
      })),
    }
  }

  return {
    /** Spec 026: like the guide, it holds no name: every active member reads it. */
    getTestProtocol: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<TestProtocol | null, Denied>> => {
      const study = await studyOf(studyId)
      const access = await deps.teams.getAccessContext(accountId)
      if (!study || !access) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canRead(accountId, studyId))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.type !== 'usability-test') return err('NOT_A_USABILITY_TEST_STUDY')
      const protocol = await protocolOf(studyId)
      const reader = access.role !== 'admin' && !access.teamIds.includes(study.teamId)
      // Who wrote and checked it stays with the team.
      return ok(
        protocol && reader
          ? {
              ...protocol,
              updatedBy: null,
              readiness: protocol.readiness.map((m) => ({ ...m, by: null })),
            }
          : protocol,
      )
    },

    /**
     * For the files published from it (PR #51 review): the team only (admins included) with the
     * folder open, as the schedule; only the content and its version, nothing computed.
     */
    protocolForTeam: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<{ content: TestProtocol['content']; version: number } | null, Denied>> => {
      const study = await studyOf(studyId)
      const access = await deps.teams.getAccessContext(accountId)
      if (!study || !access || (access.role !== 'admin' && !access.teamIds.includes(study.teamId)))
        return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(accountId, studyId))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.type !== 'usability-test') return err('NOT_A_USABILITY_TEST_STUDY')
      const [row] = await db
        .select({ content: researchTestProtocols.content, version: researchTestProtocols.version })
        .from(researchTestProtocols)
        .where(eq(researchTestProtocols.studyId, studyId))
      return ok(
        row ? { content: row.content as TestProtocol['content'], version: row.version } : null,
      )
    },

    /**
     * Spec 037: the saved versions of a study's protocol, oldest first, without their content; for
     * Ingestion, which checks the person's access to the study before.
     */
    protocolVersions: async (studyId: string): Promise<{ version: number; savedAt: Date }[]> =>
      db
        .select({
          version: researchTestProtocolVersions.version,
          savedAt: researchTestProtocolVersions.savedAt,
        })
        .from(researchTestProtocolVersions)
        .where(eq(researchTestProtocolVersions.studyId, studyId))
        .orderBy(asc(researchTestProtocolVersions.version)),

    /**
     * Spec 038: a saved version's content, for the analysis of the sessions run against it; for
     * Usability, which checks the person's access to the study before.
     */
    protocolVersionContent: async (
      studyId: string,
      version: number,
    ): Promise<TestProtocol['content'] | null> => {
      const [row] = await db
        .select({ content: researchTestProtocolVersions.content })
        .from(researchTestProtocolVersions)
        .where(
          and(
            eq(researchTestProtocolVersions.studyId, studyId),
            eq(researchTestProtocolVersions.version, version),
          ),
        )
      return row ? (row.content as TestProtocol['content']) : null
    },

    /** What the assistant may know: `null` without the right to change, or another type. */
    testProtocolForAssistant: async (
      accountId: string,
      studyId: string,
    ): Promise<{
      version: number | null
      content: TestProtocol['content'] | null
      checksDone: boolean
    } | null> => {
      const study = await studyOf(studyId)
      const access = await deps.teams.getAccessContext(accountId)
      if (!study || !access || study.type !== 'usability-test') return null
      if (access.role !== 'admin' && !access.teamIds.includes(study.teamId)) return null
      if (!(await deps.gate.canAct(accountId, studyId))) return null
      // Only what the assistant reads: content, version and the marks' versions (PR #51 review).
      const [row] = await db
        .select({ content: researchTestProtocols.content, version: researchTestProtocols.version })
        .from(researchTestProtocols)
        .where(eq(researchTestProtocols.studyId, studyId))
      if (!row) return { version: null, content: null, checksDone: false }
      const marks = await db
        .select({
          kind: researchProtocolChecks.kind,
          version: researchProtocolChecks.protocolVersion,
        })
        .from(researchProtocolChecks)
        .where(eq(researchProtocolChecks.studyId, studyId))
      const valid = new Set(marks.filter((m) => m.version === row.version).map((m) => m.kind))
      return {
        version: row.version,
        content: row.content as TestProtocol['content'],
        checksDone: valid.has('pilot') && valid.has('interface') && valid.has('review'),
      }
    },
  }
}

export type TestProtocolQueries = ReturnType<typeof makeTestProtocolQueries>
