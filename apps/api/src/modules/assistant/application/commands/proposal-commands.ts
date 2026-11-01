import { err, ok, type Result } from '@goodresearch/shared'
import { decideProposal } from '../../domain/proposal.ts'
import type { Actor, AssistantDeps, GuideDraft, StoredProposal } from '../ports.ts'
import { proposalView } from '../views.ts'

export type ProposalError = 'PROPOSAL_NOT_FOUND' | 'PROPOSAL_DECIDED'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Spec 005 US3: a proposal runs only on the person's Apply, through the app's own commands (same
 * permissions, validation and versions), at most once; dismissing is recorded for the model.
 */
export const makeProposalCommands = (deps: AssistantDeps) => {
  const load = async (actor: Actor, proposalId: string) => {
    const found = await deps.store.getProposal(proposalId)
    // Someone else's proposal does not exist for this person (privacy, FR-008).
    if (!found || found.ownerId !== actor.id || found.proposal.state === 'invalid') return null
    return found.proposal
  }

  const run = async (actor: Actor, p: StoredProposal) => {
    const v = p.values
    switch (p.kind) {
      case 'create_project': {
        const r = await deps.actions.createProject({
          actor,
          name: str(v.name),
          goal: str(v.goal),
          teamId: str(v.teamId),
        })
        return r.ok ? { ok: true as const, result: { kind: 'project' as const, id: r.id } } : r
      }
      case 'update_project_goal': {
        const r = await deps.actions.updateProjectGoal({
          actor,
          projectId: p.targetId ?? '',
          goal: str(v.goal),
          version: p.targetVersion ?? -1,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'project' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'rename_project': {
        const r = await deps.actions.renameProject({
          actor,
          projectId: p.targetId ?? '',
          name: str(v.name),
          version: p.targetVersion ?? -1,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'project' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'create_study': {
        const r = await deps.actions.createStudy({
          actor,
          projectId: p.targetId ?? '',
          name: str(v.name),
        })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: r.id } } : r
      }
      case 'attach_study':
      case 'detach_study': {
        const change = { actor, projectId: str(v.projectId), studyId: p.targetId ?? '' }
        const r = await (p.kind === 'attach_study'
          ? deps.actions.attachStudy(change)
          : deps.actions.detachStudy(change))
        return r.ok
          ? { ok: true as const, result: { kind: 'project' as const, id: change.projectId } }
          : r
      }
      case 'update_study_goal': {
        const r = await deps.actions.updateStudyGoal({
          actor,
          studyId: p.targetId ?? '',
          goal: str(v.goal),
          version: p.targetVersion ?? -1,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'propose_interview_guide': {
        const r = await deps.actions.saveGuide({
          actor,
          studyId: p.targetId ?? '',
          guide: v.guide as GuideDraft,
          version: p.targetVersion,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      // Never proposed: done at once when the assistant calls them.
      case 'open_project':
      case 'open_study':
      case 'report_guide_progress':
      case 'report_project_progress':
      case 'load_skill':
      case 'check_guide_questions':
        return { ok: false as const, error: 'PROPOSAL_DECIDED' }
      case 'rename_study': {
        const r = await deps.actions.renameStudy({
          actor,
          studyId: p.targetId ?? '',
          name: str(v.name),
          version: p.targetVersion ?? -1,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
    }
  }

  return {
    apply: async (c: {
      actor: Actor
      proposalId: string
    }): Promise<Result<ReturnType<typeof proposalView>, ProposalError>> => {
      const p = await load(c.actor, c.proposalId)
      if (!p) return err('PROPOSAL_NOT_FOUND')
      const allowed = decideProposal(p.state, 'applying')
      if (!allowed.ok) return allowed
      // Claim it first: a second Apply (double click, another tab) finds it taken.
      const claimed = await deps.store.transitionProposal(p.id, 'proposed', {
        ...p,
        state: 'applying',
      })
      if (!claimed) return err('PROPOSAL_DECIDED')
      const outcome = await run(c.actor, p)
      const decided: StoredProposal = outcome.ok
        ? {
            ...p,
            state: 'applied',
            resultKind: outcome.result.kind,
            resultId: outcome.result.id,
            decidedAt: deps.clock.now(),
          }
        : { ...p, state: 'failed', error: outcome.error, decidedAt: deps.clock.now() }
      await deps.store.saveProposal(decided)
      return ok(proposalView(decided))
    },

    dismiss: async (c: {
      actor: Actor
      proposalId: string
    }): Promise<Result<ReturnType<typeof proposalView>, ProposalError>> => {
      const p = await load(c.actor, c.proposalId)
      if (!p) return err('PROPOSAL_NOT_FOUND')
      const allowed = decideProposal(p.state, 'dismissed')
      if (!allowed.ok) return allowed
      const decided: StoredProposal = { ...p, state: 'dismissed', decidedAt: deps.clock.now() }
      if (!(await deps.store.transitionProposal(p.id, 'proposed', decided)))
        return err('PROPOSAL_DECIDED')
      return ok(proposalView(decided))
    },
  }
}

export type ProposalCommands = ReturnType<typeof makeProposalCommands>
