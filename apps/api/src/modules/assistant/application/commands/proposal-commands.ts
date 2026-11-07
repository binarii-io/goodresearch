import type { QuestionnaireDraft, TestProtocolDraft } from '@goodresearch/contracts'
import { err, ok, type Result } from '@goodresearch/shared'
import { decideProposal, isInterviewCard } from '../../domain/proposal.ts'
import type {
  Actor,
  AssistantDeps,
  FolderLineInput,
  GuideDraft,
  InterviewCardLine,
  PublishableKind,
  StoredProposal,
} from '../ports.ts'
import { proposalView } from '../views.ts'

export type ProposalError =
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_DECIDED'
  | 'NAME_REQUIRED'
  | 'NAME_MISMATCH'
  | 'FOLDER_CHANGES_REQUIRED'

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
        const r = p.targetId
          ? await deps.actions.createStudy({
              actor,
              projectId: p.targetId,
              name: str(v.name),
              ...('goal' in v ? { goal: str(v.goal) } : {}),
              ...(v.type === 'survey' || v.type === 'usability-test' ? { type: v.type } : {}),
            })
          : await deps.actions.createTeamStudy({
              actor,
              teamId: str(v.teamId),
              name: str(v.name),
              goal: str(v.goal),
              ...(v.type === 'survey' || v.type === 'usability-test' ? { type: v.type } : {}),
            })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: r.id } } : r
      }
      case 'folder_consent': {
        // What the person agreed to is the provider the card names, and only that one.
        const provider = await deps.research.aiProvider(actor.id)
        if (!provider || provider !== p.preview.provider)
          return { ok: false as const, error: 'AI_PROVIDER_REQUIRED' }
        await deps.store.saveFolderConsent(actor.id, p.targetId ?? '', provider, deps.clock.now())
        return {
          ok: true as const,
          result: { kind: 'study' as const, id: p.targetId ?? '' },
        }
      }
      case 'propose_analysis': {
        const studyId = p.targetId ?? ''
        // What the person agreed to is what the card states: this provider, and consent only if
        // the card asked for it.
        const provider = await deps.research.aiProvider(actor.id)
        if (!provider || provider !== p.preview.provider)
          return { ok: false as const, error: 'AI_PROVIDER_REQUIRED' }
        const r = await deps.actions.startAnalysis({
          actor,
          studyId,
          consent: p.preview.consentNeeded === true,
          all: v.again === true,
        })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: studyId } } : r
      }
      case 'publish_preparation': {
        const studyId = p.targetId ?? ''
        const r = await deps.actions.publishPreparation({
          actor,
          studyId,
          kinds: v.kinds as PublishableKind[],
          language: v.language === 'fr' ? 'fr' : 'en',
        })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: studyId } } : r
      }
      case 'attach_folder': {
        const studyId = p.targetId ?? ''
        const r = await deps.actions.attachFolder({ actor, studyId, link: str(v.link) })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: studyId } } : r
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
      case 'propose_opening_form':
      case 'propose_closing_form': {
        const r = await deps.actions.setFormOpen({
          actor,
          publicationId: str(v.publicationId),
          open: p.kind === 'propose_opening_form',
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'propose_survey_facts': {
        const r = await deps.actions.createSurveyFacts({
          actor,
          studyId: p.targetId ?? '',
          facts: v.facts as Parameters<typeof deps.actions.createSurveyFacts>[0]['facts'],
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'propose_theme_analysis': {
        const studyId = p.targetId ?? ''
        // What the person agreed to is what the card states: this provider.
        const provider = await deps.research.aiProvider(actor.id)
        if (!provider || provider !== p.preview.provider)
          return { ok: false as const, error: 'AI_PROVIDER_REQUIRED' }
        const r = await deps.actions.startThemes({
          actor,
          studyId,
          itemId: String(v.itemId),
          onlyNew: v.onlyNew === true,
        })
        return r.ok ? { ok: true as const, result: { kind: 'study' as const, id: studyId } } : r
      }
      case 'propose_target_rule': {
        const r = await deps.actions.saveTargetRule({
          actor,
          studyId: p.targetId ?? '',
          accepted: v.accepted as Record<string, string[]>,
          version: p.targetVersion,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'propose_protocol': {
        const r = await deps.actions.saveTestProtocol({
          actor,
          studyId: p.targetId ?? '',
          protocol: v.protocol as TestProtocolDraft,
          version: p.targetVersion,
        })
        return r.ok
          ? { ok: true as const, result: { kind: 'study' as const, id: p.targetId ?? '' } }
          : r
      }
      case 'propose_questionnaire': {
        const r = await deps.actions.saveQuestionnaire({
          actor,
          studyId: p.targetId ?? '',
          questionnaire: v.questionnaire as QuestionnaireDraft,
          version: p.targetVersion,
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
      // Only through `confirmDelete`, with the name the person typed.
      case 'delete_project':
        return { ok: false as const, error: 'NAME_REQUIRED' }
      // Never proposed: done at once when the assistant calls them.
      case 'open_project':
      case 'open_study':
      case 'report_guide_progress':
      case 'report_questionnaire_progress':
      case 'check_questionnaire_items':
      case 'report_protocol_progress':
      case 'check_protocol_tasks':
      case 'count_responses':
      case 'survey_analysis_state':
      case 'read_figures':
      case 'report_project_progress':
      case 'report_study_progress':
      case 'connect_source':
      case 'offer_choices':
      case 'browse_folder':
      case 'find_files':
      case 'count_interviews':
      case 'list_interviews':
      case 'read_file':
      case 'propose_folder_changes':
      case 'propose_accepting_suggestions':
      case 'propose_validating_interviews':
      case 'propose_excluding_interviews':
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
      if (p.kind === 'delete_project') return err('NAME_REQUIRED')
      // Spec 022: only the consent, at the source, decides this card.
      if (p.kind === 'connect_source') return err('PROPOSAL_NOT_FOUND')
      // Spec 024: the person chooses the lines, on the card's own route.
      if (p.kind === 'propose_folder_changes' || isInterviewCard(p.kind))
        return err('FOLDER_CHANGES_REQUIRED')
      const allowed = decideProposal(p.state, 'applying')
      if (!allowed.ok) return allowed
      // Claim it first: a second Apply (double click, another tab) finds it taken.
      const claimed = await deps.store.transitionProposal(p.id, 'proposed', {
        ...p,
        state: 'applying',
      })
      if (!claimed) return err('PROPOSAL_DECIDED')
      let outcome: Awaited<ReturnType<typeof run>>
      try {
        outcome = await run(c.actor, p)
      } catch (error) {
        // The card must not stay claimed for ever: its next reader sees that it failed.
        await deps.store.saveProposal({
          ...p,
          state: 'failed',
          error: 'INTERNAL',
          decidedAt: deps.clock.now(),
        })
        throw error
      }
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

    /** Spec 025: the only way to run a card on interviews: the lines kept, each with its outcome. */
    applyInterviewLines: async (c: {
      actor: Actor
      proposalId: string
      excluded: readonly number[]
      reasons: readonly { index: number; reason: string }[]
    }): Promise<Result<ReturnType<typeof proposalView>, ProposalError>> => {
      const p = await load(c.actor, c.proposalId)
      if (!p || !isInterviewCard(p.kind)) return err('PROPOSAL_NOT_FOUND')
      const allowed = decideProposal(p.state, 'applying')
      if (!allowed.ok) return allowed
      const claimed = await deps.store.transitionProposal(p.id, 'proposed', {
        ...p,
        state: 'applying',
      })
      if (!claimed) return err('PROPOSAL_DECIDED')
      const fail = (error: string): StoredProposal => ({
        ...p,
        state: 'failed',
        error,
        decidedAt: deps.clock.now(),
      })
      const kind = (
        {
          propose_accepting_suggestions: 'suggestions',
          propose_validating_interviews: 'validate',
          propose_excluding_interviews: 'exclude',
        } as const
      )[p.kind as 'propose_accepting_suggestions']
      let outcome: Awaited<ReturnType<typeof deps.actions.applyInterviewCard>>
      try {
        outcome = await deps.actions.applyInterviewCard({
          actor: c.actor,
          studyId: p.targetId ?? '',
          kind,
          lines: p.values.lines as InterviewCardLine[],
          excluded: c.excluded,
          reasons: c.reasons,
        })
      } catch (error) {
        await deps.store.saveProposal(fail('INTERNAL'))
        throw error
      }
      if (!outcome.ok) {
        const failed = fail(outcome.error)
        await deps.store.saveProposal(failed)
        return ok(proposalView(failed))
      }
      const { outcomes } = outcome
      const decided: StoredProposal = {
        ...p,
        state: 'applied',
        resultKind: 'study',
        resultId: p.targetId,
        preview: {
          ...p.preview,
          interviewLines: (p.preview.interviewLines ?? []).map((l, i) => ({
            ...l,
            reason: c.reasons.find((r) => r.index === l.index)?.reason ?? l.reason,
            outcome: outcomes[i] ?? 'skipped',
          })),
        },
        decidedAt: deps.clock.now(),
      }
      await deps.store.saveProposal(decided)
      return ok(proposalView(decided))
    },

    /** Spec 024: the only way to run a batch: the lines kept, each with its outcome. */
    applyFolderChanges: async (c: {
      actor: Actor
      proposalId: string
      excluded: readonly number[]
    }): Promise<Result<ReturnType<typeof proposalView>, ProposalError>> => {
      const p = await load(c.actor, c.proposalId)
      if (p?.kind !== 'propose_folder_changes') return err('PROPOSAL_NOT_FOUND')
      const allowed = decideProposal(p.state, 'applying')
      if (!allowed.ok) return allowed
      const claimed = await deps.store.transitionProposal(p.id, 'proposed', {
        ...p,
        state: 'applying',
      })
      if (!claimed) return err('PROPOSAL_DECIDED')
      const fail = (error: string): StoredProposal => ({
        ...p,
        state: 'failed',
        error,
        decidedAt: deps.clock.now(),
      })
      let outcome: Awaited<ReturnType<typeof deps.actions.applyFolderChanges>>
      try {
        outcome = await deps.actions.applyFolderChanges({
          actor: c.actor,
          studyId: p.targetId ?? '',
          lines: p.values.lines as readonly FolderLineInput[],
          excluded: c.excluded,
        })
      } catch (error) {
        await deps.store.saveProposal(fail('INTERNAL'))
        throw error
      }
      if (!outcome.ok) {
        const failed = fail(outcome.error)
        await deps.store.saveProposal(failed)
        return ok(proposalView(failed))
      }
      const { outcomes } = outcome
      const decided: StoredProposal = {
        ...p,
        state: 'applied',
        resultKind: 'study',
        resultId: p.targetId,
        preview: {
          ...p.preview,
          lines: (p.preview.lines ?? []).map((l, i) => ({
            ...l,
            outcome: outcomes[i] ?? 'skipped',
          })),
        },
        decidedAt: deps.clock.now(),
      }
      await deps.store.saveProposal(decided)
      return ok(proposalView(decided))
    },

    /**
     * Spec 020: the only way to run a deletion. The name comes from the person's request and is
     * never stored; a wrong one leaves the card open, to try again.
     */
    confirmDelete: async (c: {
      actor: Actor
      proposalId: string
      name: string
    }): Promise<Result<ReturnType<typeof proposalView>, ProposalError>> => {
      const p = await load(c.actor, c.proposalId)
      if (!p || p.kind !== 'delete_project') return err('PROPOSAL_NOT_FOUND')
      const allowed = decideProposal(p.state, 'applying')
      if (!allowed.ok) return allowed
      const projectId = p.targetId ?? ''
      const project = await deps.research.getProject(c.actor.id, projectId)
      // Renamed since the card was shown: the card is out of date, so it ends with its reason.
      const renamed = project !== null && project.name !== p.preview.projectName
      if (project && !renamed && c.name.trim() !== project.name) return err('NAME_MISMATCH')
      const claimed = await deps.store.transitionProposal(p.id, 'proposed', {
        ...p,
        state: 'applying',
      })
      if (!claimed) return err('PROPOSAL_DECIDED')
      if (renamed) {
        const stale: StoredProposal = {
          ...p,
          state: 'failed',
          error: 'NAME_MISMATCH',
          decidedAt: deps.clock.now(),
        }
        await deps.store.saveProposal(stale)
        return ok(proposalView(stale))
      }
      let outcome: Awaited<ReturnType<typeof deps.actions.deleteProject>>
      try {
        outcome = await deps.actions.deleteProject({ actor: c.actor, projectId, name: c.name })
      } catch (error) {
        // The card must not stay claimed for ever: its next reader sees that it failed.
        await deps.store.saveProposal({
          ...p,
          state: 'failed',
          error: 'INTERNAL',
          decidedAt: deps.clock.now(),
        })
        throw error
      }
      const decided: StoredProposal = outcome.ok
        ? { ...p, state: 'applied', decidedAt: deps.clock.now() }
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
