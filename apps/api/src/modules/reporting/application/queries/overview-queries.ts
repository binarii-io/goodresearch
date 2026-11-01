import { err, ok, sumCosts } from '@goodresearch/shared'
import { nextStep, type StepCounts, stepsOf } from '../../domain/journey.ts'
import type { ReportingDeps, StatusCount } from '../ports.ts'

const USES = ['analysis', 'lexicon', 'cleaning', 'quality', 'facts'] as const

const counted = (counts: readonly StatusCount[]): StepCounts => {
  const of = (status: string) => counts.find((c) => c.status === status)?.count ?? 0
  const total = counts.reduce((n, c) => n + c.count, 0) - of('rejected')
  return { total, validated: total - of('proposed'), toDecide: of('proposed') }
}

/**
 * Spec 017: where a project stands, in two reads so the numbers never wait for the ledger. They
 * write nothing, and call neither AI nor Drive.
 */
export const makeOverviewQueries = ({ sources }: ReportingDeps) => ({
  /** The journey and the counts: SQL counts, no row of facts, insights or recommendations. */
  get: async (accountId: string, projectId: string) => {
    const studies = await sources.studies(accountId, projectId)
    if (!studies) return err('PROJECT_NOT_FOUND' as const)
    const open = studies.filter((s) => s.access)
    const [parts, insights, recommendations, takeaways] = await Promise.all([
      Promise.all(open.map((s) => sources.studyCounts(s.id))),
      sources.insightCounts(projectId),
      sources.recommendationCounts(projectId),
      sources.takeaways(projectId),
    ])
    const facts = parts.map((p) => counted(p.facts))
    const countsOf = new Map(open.map((s, n) => [s.id, { part: parts[n], facts: facts[n] }]))
    const validated = parts.reduce((n, p) => n + p.interviews.validated, 0)
    const toValidate = parts.reduce((n, p) => n + p.interviews.proposed, 0)
    const steps = stepsOf({
      interviews: {
        total: validated + toValidate,
        validated,
        toDecide: toValidate,
        participants: parts.reduce((n, p) => n + p.interviews.participants, 0),
      },
      facts: {
        total: facts.reduce((n, f) => n + f.total, 0),
        validated: facts.reduce((n, f) => n + f.validated, 0),
        toDecide: facts.reduce((n, f) => n + f.toDecide, 0),
      },
      insights: counted(insights),
      recommendations: counted(recommendations),
      takeawaysWritten: takeaways !== null,
    })
    return ok({
      steps,
      nextStep: nextStep(steps),
      takeaways,
      hiddenStudies: studies.length - open.length,
      studies: studies.map((study) => {
        const { part, facts: fact } = countsOf.get(study.id) ?? {}
        return {
          id: study.id,
          access: study.access,
          counts:
            part && fact
              ? {
                  validated: part.interviews.validated,
                  toValidate: part.interviews.proposed,
                  excluded: part.interviews.excluded,
                  facts: fact.total,
                  factsToDecide: fact.toDecide,
                }
              : null,
        }
      }),
    })
  },

  /** What the project cost, per study and per use; every study counts in the total. */
  costs: async (accountId: string, projectId: string) => {
    const studies = await sources.studies(accountId, projectId)
    if (!studies) return err('PROJECT_NOT_FOUND' as const)
    const [parts, projectRefs] = await Promise.all([
      Promise.all(studies.map((s) => sources.studyCostRefs(s.id))),
      sources.projectCostRefs(projectId),
    ])
    const costs = await sources.costs([
      ...parts.flatMap((refs) => USES.flatMap((use) => refs[use])),
      ...Object.values(projectRefs).flat(),
    ])
    const costOf = (refs: readonly string[]) => sumCosts(refs.map((r) => costs.get(r)))
    const perStudy = parts.map((refs) => {
      const uses = Object.fromEntries(USES.map((use) => [use, costOf(refs[use])])) as Record<
        (typeof USES)[number],
        number | null
      >
      return { total: sumCosts(Object.values(uses)), ...uses }
    })
    const studiesCost = sumCosts(perStudy.map((c) => c.total))
    const projectCosts = {
      insights: costOf(projectRefs.insights),
      recommendations: costOf(projectRefs.recommendations),
      takeaways: costOf(projectRefs.takeaways),
    }
    return ok({
      cost: {
        total: sumCosts([studiesCost, ...Object.values(projectCosts)]),
        studies: studiesCost,
        ...projectCosts,
      },
      studies: studies.flatMap((study, n) => {
        const cost = perStudy[n]
        return study.access && cost ? [{ id: study.id, cost }] : []
      }),
    })
  },
})
