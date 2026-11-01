import { err, ok } from '@goodresearch/shared'
import { outOfDate } from '../../domain/takeaways.ts'
import type { SynthesisDeps } from '../ports.ts'
import { projectOf } from '../project.ts'
import { takeawaysBasis } from '../takeaways-basis.ts'

/** Spec 017: read apart, as it needs every insight and fact; asked only once takeaways exist. */
export const makeTakeawaysQueries = (deps: SynthesisDeps) => ({
  freshness: async (accountId: string, projectId: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return err(project.error)
    const takeaways = await deps.store.getTakeaways(projectId)
    return ok({
      outOfDate: takeaways
        ? outOfDate(
            takeaways.savedOver,
            await takeawaysBasis(deps, project.value, projectId, takeaways.withProposed),
          )
        : false,
    })
  },
})
