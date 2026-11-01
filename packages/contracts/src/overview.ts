import { z } from 'zod'

/** Spec 017: where a project stands, for its Overview tab. */
const StepState = z.enum(['empty', 'to-decide', 'done'])
const Counts = {
  state: StepState,
  total: z.number().int(),
  validated: z.number().int(),
  toDecide: z.number().int(),
}

export const JourneyStep = z.discriminatedUnion('key', [
  z.object({ key: z.literal('interviews'), ...Counts, participants: z.number().int() }),
  z.object({ key: z.enum(['facts', 'insights', 'recommendations']), ...Counts }),
  z.object({ key: z.literal('debrief'), state: StepState }),
])

export const ProjectOverview = z
  .object({
    steps: z.array(JourneyStep),
    nextStep: z.enum(['interviews', 'facts', 'insights', 'recommendations', 'debrief']).nullable(),
    takeaways: z
      .object({
        text: z.object({ en: z.string(), fr: z.string() }),
        translation: z.enum(['done', 'translating', 'not-translated']),
      })
      .nullable(),
    /** Studies left out of the counts: the person has no access to their folder. */
    hiddenStudies: z.number().int(),
    studies: z.array(
      z.object({
        id: z.string(),
        access: z.boolean(),
        counts: z
          .object({
            validated: z.number().int(),
            toValidate: z.number().int(),
            excluded: z.number().int(),
            facts: z.number().int(),
            factsToDecide: z.number().int(),
          })
          .nullable(),
      }),
    ),
  })
  .meta({ id: 'ProjectOverview' })

/** What the project cost, read apart from the counts. Null when unknown. */
const Cost = z.number().nullable()

export const ProjectOverviewCosts = z
  .object({
    cost: z.object({
      total: Cost,
      studies: Cost,
      insights: Cost,
      recommendations: Cost,
      takeaways: Cost,
    }),
    /** The studies the person can open. */
    studies: z.array(
      z.object({
        id: z.string(),
        cost: z.object({
          total: Cost,
          analysis: Cost,
          lexicon: Cost,
          cleaning: Cost,
          quality: Cost,
          facts: Cost,
        }),
      }),
    ),
  })
  .meta({ id: 'ProjectOverviewCosts' })

/** Spec 019: the same counts and costs per study, on the team's Studies page. */
export const TeamStudiesOverview = z
  .object({ studies: ProjectOverview.shape.studies })
  .meta({ id: 'TeamStudiesOverview' })

export const TeamStudiesCosts = z
  .object({ studies: ProjectOverviewCosts.shape.studies })
  .meta({ id: 'TeamStudiesCosts' })

/** Spec 020: what deleting a project removes, and the studies that stay. */
export const ProjectDeletion = z
  .object({
    insights: z.number().int(),
    recommendations: z.number().int(),
    hasTakeaways: z.boolean(),
    hasPublishedDeck: z.boolean(),
    studies: z.number().int(),
    /** Those linked only to this project: they end up in no project. */
    studiesWithoutProject: z.number().int(),
  })
  .meta({ id: 'ProjectDeletion' })
