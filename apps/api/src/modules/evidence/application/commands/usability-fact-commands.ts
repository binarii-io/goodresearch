import { err, holdsName, ok, type Result } from '@goodresearch/shared'
import { STATEMENT_MAX } from '../../domain/facts.ts'
import {
  type ObservationFactInput,
  observationFact,
  usabilityTranslationRef,
} from '../../domain/usability-facts.ts'
import type { TranslateJob } from '../ports.ts'
import type { UsabilityFactDeps } from '../usability-ports.ts'

/**
 * Spec 038 FR-022: the facts of a usability test study follow its decided observations. The
 * Usability analysis module calls them when a person accepts, edits, rejects or reopens one.
 */
export const makeUsabilityFactCommands = (deps: UsabilityFactDeps) => ({
  /** Creates or updates the fact of an accepted or edited observation; refused with a name in it. */
  upsert: async (
    input: ObservationFactInput,
  ): Promise<Result<{ factId: string }, 'VALIDATION' | 'NAME_IN_STATEMENT'>> => {
    const current = await deps.store.byObservation(input.observationId)
    const names = await deps.knownNames(input.accountId, input.studyId)
    const made = observationFact(input, current, names, deps.clock.now(), deps.newId)
    if (!made.ok) return err(made.error)
    const { fact, translate } = made.value
    await deps.store.put(fact, deps.clock.now())
    if (translate)
      await deps.enqueueTranslation({
        factId: fact.id,
        version: fact.version,
        accountId: input.accountId,
        from: input.language,
        text: fact.statement[input.language],
        usability: true,
      })
    return ok({ factId: fact.id })
  },

  /** The observation was rejected or sent back to review: its fact goes. */
  withdraw: async (observationId: string): Promise<void> => {
    await deps.store.deleteByObservation(observationId)
  },

  /** The other language of a usability fact's statement, in the worker (research R9 of spec 012). */
  translateJob: async (job: TranslateJob): Promise<void> => {
    const fact = await deps.store.get(job.factId)
    if (!fact || fact.statement[job.from] !== job.text || fact.translation !== 'translating') return
    const to = job.from === 'en' ? 'fr' : 'en'
    let translated: string | null = null
    try {
      const text = await deps.translate(job.accountId, usabilityTranslationRef(fact.sessionId), {
        text: fact.statement[job.from],
        from: job.from,
        to,
      })
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
})
