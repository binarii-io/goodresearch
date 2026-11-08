import { err, ok, type Result } from '@goodresearch/shared'
import type { FactError, GivenStatement } from '../../domain/facts.ts'
import type { FactBoardStore, UsabilityDecisions } from '../fact-board-ports.ts'
import type { StudyAccess } from '../ports.ts'
import type { UsabilityFactStore } from '../usability-ports.ts'
import type { FactCommandError, makeFactCommands } from './fact-commands.ts'
import type { makeSurveyFactCommands } from './survey-fact-commands.ts'
import type { makeUsabilityFactCommands } from './usability-fact-commands.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type AnyDecision = {
  readonly decision: 'accept' | 'edit' | 'reject' | 'reopen'
  readonly version: number
  readonly statement?: GivenStatement | undefined
}

/**
 * Spec 039 FR-002: one decision path for every fact, whatever its source: accept, edit, reject or
 * reopen at the version seen, with the rules of its source (verbatims of an interview fact, an
 * observation decided with its usability fact, a task fact decided as such).
 */
export const makeFactDecisions = (deps: {
  board: FactBoardStore
  studyAccess: (accountId: string, studyId: string) => Promise<StudyAccess | null>
  interviews: ReturnType<typeof makeFactCommands>
  surveys: ReturnType<typeof makeSurveyFactCommands>
  usabilityStore: UsabilityFactStore
  usability: ReturnType<typeof makeUsabilityFactCommands>
  observations: () => UsabilityDecisions | null
}) => {
  type DecisionError =
    | FactCommandError
    | FactError
    | 'NOT_A_SURVEY_STUDY'
    | Exclude<
        Extract<
          Awaited<ReturnType<UsabilityDecisions['decideObservation']>>,
          { ok: false }
        >['error'],
        'OBSERVATION_NOT_FOUND' | 'SESSION_NOT_FOUND'
      >

  const decide = async (
    actor: Actor,
    factId: string,
    d: AnyDecision,
  ): Promise<Result<{ id: string }, DecisionError>> => {
    const head = await deps.board.head(factId)
    if (!head) return err('FACT_NOT_FOUND')
    // Readers of a study never decide (spec 026): only its team.
    if (!(await deps.studyAccess(actor.id, head.studyId))) return err('FACT_NOT_FOUND')
    if (head.source === 'interview') {
      const done = await deps.interviews.decide(actor, head.studyId, factId, d)
      return done.ok ? ok({ id: factId }) : done
    }
    if (head.source === 'survey') {
      const done = await deps.surveys.decide(actor, head.studyId, factId, d)
      return done.ok ? ok({ id: factId }) : done
    }
    const fact = await deps.usabilityStore.get(factId)
    if (!fact) return err('FACT_NOT_FOUND')
    if (fact.version !== d.version) return err('VERSION_CONFLICT')
    if (fact.support.kind === 'task') {
      const done = await deps.usability.decideTask({
        accountId: actor.id,
        fact,
        decision: d.decision,
        version: d.version,
        statement: d.statement,
      })
      return done.ok ? ok({ id: factId }) : done
    }
    // An observation's fact is decided with its observation (FR-007).
    const observations = deps.observations()
    if (!observations) return err('FACT_NOT_FOUND')
    const edit =
      d.decision !== 'edit'
        ? null
        : d.statement?.en !== undefined
          ? { text: d.statement.en, language: 'en' as const }
          : d.statement?.fr !== undefined
            ? { text: d.statement.fr, language: 'fr' as const }
            : null
    if (d.decision === 'edit' && !edit) return err('VALIDATION')
    const done = await observations.decideObservation(
      actor,
      fact.support.observationId,
      d.decision,
      edit,
    )
    if (done.ok) return ok({ id: factId })
    // Its observation gone (a later analysis replaced it): the fact goes too.
    if (done.error === 'OBSERVATION_NOT_FOUND') await deps.usabilityStore.deleteIds([factId])
    // Its observation or session gone meanwhile: the fact is, for the person.
    return err(
      done.error === 'OBSERVATION_NOT_FOUND' || done.error === 'SESSION_NOT_FOUND'
        ? 'FACT_NOT_FOUND'
        : done.error,
    )
  }

  return {
    decide,

    /** FR-003a: accepts the facts to decide shown, each at its version; the others are skipped. */
    acceptMany: async (actor: Actor, items: readonly { id: string; version: number }[]) => {
      let done = 0
      let changed = 0
      const heads = new Map((await deps.board.heads(items.map((i) => i.id))).map((h) => [h.id, h]))
      // Interview facts by study, through their batch (the study, names and verbatims read once).
      const interviews = new Map<string, { id: string; version: number }[]>()
      for (const item of items) {
        const head = heads.get(item.id)
        if (!head) {
          changed++
          continue
        }
        if (head.source === 'interview') {
          interviews.set(head.studyId, [...(interviews.get(head.studyId) ?? []), item])
          continue
        }
        const result = await decide(actor, item.id, { decision: 'accept', version: item.version })
        if (result.ok) done++
        else changed++
      }
      for (const [studyId, facts] of interviews) {
        const result = await deps.interviews.acceptMany(actor, studyId, facts)
        if (result.ok) {
          done += result.value.done
          changed += result.value.changed
        } else changed += facts.length
      }
      return { done, changed }
    },
  }
}

export type FactDecisions = ReturnType<typeof makeFactDecisions>
