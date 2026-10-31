import { err, newId, ok, type Result } from '@goodresearch/shared'
import type { Stance } from '../../domain/figures.ts'
import { requalified, setStance } from '../../domain/remarks.ts'
import { type StudyError, studyOf } from '../interviews.ts'
import type { QualityDeps } from '../ports.ts'

/** FR-007, FR-008a: what people say about a remark. No AI call; it changes only the counts. */
export const makeRemarkCommands = (deps: QualityDeps) => {
  const remarkOf = async (studyId: string, remarkId: string) => {
    const remark = await deps.store.getRemark(remarkId)
    return remark?.studyId === studyId ? remark : null
  }

  const stance = async (
    accountId: string,
    studyId: string,
    remarkId: string,
    input: { stance: Stance | null; version: number },
  ): Promise<
    Result<undefined, StudyError | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'PERSON_REMARK_STANCE'>
  > => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const remark = await remarkOf(studyId, remarkId)
    if (!remark) return err('NOT_FOUND')
    if (remark.version !== input.version) return err('VERSION_CONFLICT')
    const changed = setStance(remark, input.stance, accountId, deps.clock.now())
    if (!changed.ok) return changed
    if (!(await deps.store.saveStance(changed.value, input.version))) return err('VERSION_CONFLICT')
    return ok(undefined)
  }

  const requalify = async (
    accountId: string,
    studyId: string,
    reformulationId: string,
    input: { reason: string; recommendation?: string | undefined },
  ): Promise<Result<{ remarkId: string }, StudyError | 'NOT_FOUND' | 'ALREADY_REQUALIFIED'>> => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const found = await deps.store.getReformulation(reformulationId)
    if (found?.studyId !== studyId) return err('NOT_FOUND')
    if (found.requalifiedRemarkId) return err('ALREADY_REQUALIFIED')
    const remark = requalified(found, {
      id: newId(),
      reason: input.reason,
      recommendation: input.recommendation,
      by: accountId,
      at: deps.clock.now(),
    })
    if (!(await deps.store.requalify(remark, reformulationId))) return err('ALREADY_REQUALIFIED')
    return ok({ remarkId: remark.id })
  }

  const withdraw = async (
    accountId: string,
    studyId: string,
    remarkId: string,
    version: number,
  ): Promise<Result<undefined, StudyError | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'AI_REMARK'>> => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const remark = await remarkOf(studyId, remarkId)
    if (!remark) return err('NOT_FOUND')
    if (remark.origin !== 'person') return err('AI_REMARK')
    if (!(await deps.store.withdrawRemark(remarkId, version))) return err('VERSION_CONFLICT')
    return ok(undefined)
  }

  return { stance, requalify, withdraw }
}

export type RemarkCommands = ReturnType<typeof makeRemarkCommands>
