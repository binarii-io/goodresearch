import { err, holdsName, ok, type Result } from '@goodresearch/shared'
import { type FactError, type GivenStatement, STATEMENT_MAX } from '../../domain/facts.ts'
import {
  decideTaskFact,
  type ObservationFactInput,
  observationFact,
  type TaskFactInput,
  taskFact,
  type UsabilityFact,
  usabilityStudyRef,
  usabilityTranslationRef,
} from '../../domain/usability-facts.ts'
import type { TranslateJob } from '../ports.ts'
import type { UsabilityFactDeps } from '../usability-ports.ts'

/**
 * Specs 038 and 039: the facts of a usability test study. An observation's fact follows its
 * observation (to decide, accepted, edited, rejected), written when the Usability analysis module
 * analyses a session or a person decides an observation; a task's fact follows the decided outcomes
 * of the task across the study's sessions.
 */
const unchanged = (f: UsabilityFact, i: ObservationFactInput) =>
  f.support.kind === 'observation' &&
  f.statement[i.language] === i.statement.trim() &&
  f.status === i.status &&
  f.decidedBy === i.decidedBy &&
  f.polarity === i.polarity &&
  f.theme.id === i.theme.id &&
  f.origin === i.origin &&
  f.support.quote === i.quote &&
  f.support.momentMs === Math.max(0, Math.round(i.momentMs)) &&
  f.support.screenshotKey === i.screenshotKey &&
  f.support.participant === i.participant

export const makeUsabilityFactCommands = (deps: UsabilityFactDeps) => {
  const translateLater = async (fact: UsabilityFact, accountId: string, from: 'en' | 'fr') => {
    await deps.enqueueTranslation({
      factId: fact.id,
      version: fact.version,
      accountId,
      from,
      text: fact.statement[from],
      usability: true,
    })
  }

  /** Creates or updates the fact of an observation; refused with a name in it. */
  const upsert = async (
    input: ObservationFactInput,
  ): Promise<Result<{ factId: string }, 'VALIDATION' | 'NAME_IN_STATEMENT'>> => {
    const current = await deps.store.byObservation(input.observationId)
    // Nothing changed (a sync run again): no write, no translation, no new version.
    if (current && unchanged(current, input)) return ok({ factId: current.id })
    const names = await deps.knownNames(input.accountId, input.studyId)
    const made = observationFact(input, current, names, deps.newId)
    if (!made.ok) return err(made.error)
    const { fact, translate } = made.value
    await deps.store.put(fact, deps.clock.now())
    if (translate) await translateLater(fact, input.accountId, input.language)
    return ok({ factId: fact.id })
  }

  return {
    upsert,

    /**
     * Spec 039: the facts of a session's observations after its analysis: each given one upserted,
     * those of observations no longer there (or giving no fact) removed. A statement the app
     * refuses (a name) leaves that observation without a fact, logged.
     */
    syncSession: async (sessionId: string, items: readonly ObservationFactInput[]) => {
      for (const item of items) {
        const done = await upsert(item)
        if (!done.ok)
          deps.log.warn({ observationId: item.observationId, error: done.error }, 'fact not made')
      }
      const kept = new Set(items.map((i) => i.observationId))
      for (const fact of await deps.store.ofSession(sessionId))
        if (fact.support.kind === 'observation' && !kept.has(fact.support.observationId))
          await deps.store.deleteIds([fact.id])
    },

    /** An observation that gives no fact any more (rejected by the checks, still to decide). */
    remove: async (observationId: string) => {
      const fact = await deps.store.byObservation(observationId)
      if (fact) await deps.store.deleteIds([fact.id])
    },

    /**
     * Spec 039 FR-008a: the task facts of a study from the decided outcomes of its tasks; a task
     * with no decided outcome left has no fact.
     */
    syncTasks: async (studyId: string, tasks: readonly TaskFactInput[]) => {
      const current = await deps.store.tasksOf(studyId)
      const byTask = new Map(
        current.flatMap((f) => (f.support.kind === 'task' ? [[f.support.taskId, f] as const] : [])),
      )
      const counted = new Set<string>()
      for (const input of tasks) {
        const total =
          input.outcomes.success +
          input.outcomes.partial +
          input.outcomes.failure +
          input.outcomes.notAttempted
        if (total === 0) continue
        counted.add(input.task.id)
        const current = byTask.get(input.task.id) ?? null
        const next = taskFact(input, current, deps.newId)
        if (!next) continue
        // Never over a decision taken meanwhile (version checked); a fact another sync just made
        // for the same task is left to it.
        if (current) await deps.store.save(next, current.version)
        else
          await deps.store
            .put(next, deps.clock.now())
            .catch((error: unknown) =>
              deps.log.warn({ error: String(error), task: input.task.id }, 'task fact not made'),
            )
      }
      const gone = [...byTask.entries()].filter(([task]) => !counted.has(task)).map(([, f]) => f.id)
      if (gone.length) await deps.store.deleteIds(gone)
    },

    /** Spec 039: a person decides a task fact (an observation's fact is decided with it). */
    decideTask: async (c: {
      accountId: string
      fact: UsabilityFact
      decision: 'accept' | 'reject' | 'edit' | 'reopen'
      version: number
      statement?: GivenStatement | undefined
    }): Promise<Result<UsabilityFact, FactError>> => {
      const names = await deps.knownNames(c.accountId, c.fact.studyId)
      const next = decideTaskFact(
        c.fact,
        { decision: c.decision, version: c.version, statement: c.statement },
        c.accountId,
        deps.clock.now(),
        names,
      )
      if (!next.ok) return next
      if ((await deps.store.save(next.value, c.version)) === 'conflict')
        return err('VERSION_CONFLICT')
      // Only a person's statement in one language asks for the other (as for interview facts).
      const en = c.statement?.en !== undefined
      const fr = c.statement?.fr !== undefined
      if (c.decision === 'edit' && en !== fr)
        await translateLater(next.value, c.accountId, en ? 'en' : 'fr')
      return ok(next.value)
    },

    /** The other language of a usability fact's statement, in the worker (research R9 of spec 012). */
    translateJob: async (job: TranslateJob): Promise<void> => {
      const fact = await deps.store.get(job.factId)
      if (!fact || fact.statement[job.from] !== job.text || fact.translation !== 'translating')
        return
      const to = job.from === 'en' ? 'fr' : 'en'
      let translated: string | null = null
      try {
        const text = await deps.translate(
          job.accountId,
          fact.sessionId
            ? usabilityTranslationRef(fact.sessionId)
            : usabilityStudyRef(fact.studyId),
          { text: fact.statement[job.from], from: job.from, to },
        )
        const names = await deps.knownNames(job.accountId, fact.studyId)
        const clean = text.trim().slice(0, STATEMENT_MAX)
        translated = clean.length > 0 && !holdsName(clean, names) ? clean : null
      } catch (error) {
        deps.log.warn({ error: String(error), factId: fact.id }, 'translation failed')
      }
      await deps.store.save(
        translated === null
          ? { ...fact, translation: 'not-translated' }
          : { ...fact, statement: { ...fact.statement, [to]: translated }, translation: 'done' },
        fact.version,
      )
    },
  }
}
