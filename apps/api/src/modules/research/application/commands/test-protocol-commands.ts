import { ConcurrencyError, err, newId, ok, type Result } from '@goodresearch/shared'
import type { StudyRepository } from '../../domain/study.repository.ts'
import type {
  ProtocolReadinessKind,
  TestProtocolRepository,
} from '../../domain/test-protocol.repository.ts'
import {
  TestProtocol,
  type TestProtocolInput,
  type TestProtocolOrigin,
} from '../../domain/test-protocol.ts'
import type { ResearchCommandDeps, StudyActionGate } from '../ports.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type TestProtocolError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'NOT_A_USABILITY_TEST_STUDY'
  | 'PROTOCOL_NOT_FOUND'

/** The test protocol of a usability test study (spec 036); same access as every study action. */
export const makeTestProtocolCommands = (
  deps: ResearchCommandDeps & {
    studies: StudyRepository
    protocols: TestProtocolRepository
    gate: StudyActionGate
  },
) => {
  const canAct = async (
    actor: Actor,
    studyId: string,
  ): Promise<
    Result<true, 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_A_USABILITY_TEST_STUDY'>
  > => {
    const study = await deps.studies.findById(studyId)
    if (!study) return err('STUDY_NOT_FOUND')
    const access = await deps.teams.getAccessContext(actor.id)
    if (!access || (access.role !== 'admin' && !access.teamIds.includes(study.teamId)))
      return err('STUDY_NOT_FOUND')
    if (study.type !== 'usability-test') return err('NOT_A_USABILITY_TEST_STUDY')
    return (await deps.gate.canAct(actor.id, studyId)) ? ok(true) : err('FOLDER_ACCESS_REQUIRED')
  }

  const saved = async (work: () => Promise<void>): Promise<boolean> => {
    try {
      await work()
      return true
    } catch (error) {
      if (error instanceof ConcurrencyError) return false
      throw error
    }
  }

  return {
    /**
     * Saves the whole protocol against the version seen (`null`: there was none), from the editor,
     * an applied assistant proposal or accepted changes of the published document (`origin`).
     */
    saveTestProtocol: async (c: {
      actor: Actor
      studyId: string
      content: TestProtocolInput
      version: number | null
      origin: TestProtocolOrigin
    }): Promise<Result<{ version: number }, TestProtocolError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const existing = await deps.protocols.findByStudy(c.studyId)
      const change = {
        content: c.content,
        origin: c.origin,
        by: c.actor.id,
        now: deps.clock.now(),
        newId,
      }
      if (!existing) {
        if (c.version !== null) return err('VERSION_CONFLICT')
        const created = TestProtocol.create({ studyId: c.studyId, ...change })
        if (!created.ok) return created
        return (await saved(() => deps.protocols.insert(created.value)))
          ? ok({ version: 0 })
          : err('VERSION_CONFLICT')
      }
      if (existing.version !== c.version) return err('VERSION_CONFLICT')
      const replaced = existing.replace(change)
      if (!replaced.ok) return replaced
      return (await saved(() => deps.protocols.update(existing)))
        ? ok({ version: existing.version + 1 })
        : err('VERSION_CONFLICT')
    },

    /** A person says a check was done, on the current version (US6). It blocks nothing. */
    markProtocolReadiness: async (c: {
      actor: Actor
      studyId: string
      kind: ProtocolReadinessKind
    }): Promise<Result<void, TestProtocolError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const existing = await deps.protocols.findByStudy(c.studyId)
      if (!existing) return err('PROTOCOL_NOT_FOUND')
      await deps.protocols.mark({
        studyId: c.studyId,
        kind: c.kind,
        protocolVersion: existing.version,
        markedBy: c.actor.id,
        markedAt: deps.clock.now(),
      })
      return ok(undefined)
    },

    unmarkProtocolReadiness: async (c: {
      actor: Actor
      studyId: string
      kind: ProtocolReadinessKind
    }): Promise<Result<void, TestProtocolError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      await deps.protocols.unmark(c.studyId, c.kind)
      return ok(undefined)
    },
  }
}

export type TestProtocolCommands = ReturnType<typeof makeTestProtocolCommands>
