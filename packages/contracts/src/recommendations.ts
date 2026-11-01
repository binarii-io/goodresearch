import { z } from 'zod'
import { Id, Version } from './common.ts'
import { Translation } from './facts.ts'
import {
  ConfidenceLevel,
  InsightOrigin,
  InsightPolarity,
  InsightStatus,
  InsightsFailure,
  InsightTheme,
  LinkState,
} from './insights.ts'

/** Spec 014: recommendations and key takeaways of a project. */
export const RecommendationKind = z.enum(['build', 'test', 'investigate'])
export const Rating = z.enum(['high', 'medium', 'low'])
/** The linked insight now (research R3). */
export const LinkedInsightState = z.enum([
  'validated',
  'to-decide',
  'rejected',
  'deleted',
  'changed',
])

const Bilingual = z.object({ en: z.string(), fr: z.string() })
const Who = z.object({ id: z.string(), name: z.string().nullable() })

export const RecommendationCard = z
  .object({
    id: Id,
    version: Version,
    action: Bilingual,
    kind: RecommendationKind,
    /** Computed: `test` for a build resting only on low-confidence insights (FR-006). */
    kindShown: RecommendationKind,
    downgraded: z.boolean(),
    impact: Rating,
    effort: Rating,
    /** Computed: impact × 2 − effort. */
    priority: z.number().int(),
    owner: z.string().nullable(),
    status: InsightStatus,
    origin: InsightOrigin,
    translation: Translation,
    insights: z.number().int(),
    insightsToValidate: z.number().int(),
    insightsChanged: z.number().int(),
    suggested: z.number().int(),
  })
  .meta({ id: 'RecommendationCard' })

export const RecommendationRunView = z
  .object({
    id: Id,
    calls: z.number().int(),
    callsDone: z.number().int(),
    leftOut: z.number().int(),
    failure: InsightsFailure.nullable(),
    stopping: z.boolean(),
    startedBy: Who,
    finished: z.boolean(),
  })
  .meta({ id: 'RecommendationRunView' })

export const TakeawaysView = z
  .object({
    text: Bilingual,
    translation: Translation,
    version: Version,
    savedBy: Who.nullable(),
    savedAt: z.string().nullable(),
    outOfDate: z.boolean(),
    /** It rests on what was still to decide when saved (FR-010, update). */
    withProposed: z.boolean(),
    /** What it rests on that is still to decide now. */
    toValidate: z.number().int(),
    /** What the drafts of the project cost (USD). */
    cost: z.number().nullable(),
    draft: z.object({
      text: Bilingual.nullable(),
      state: z.enum(['none', 'drafting', 'ready', 'failed']),
      withProposed: z.boolean(),
    }),
  })
  .meta({ id: 'TakeawaysView' })

export const RecommendationsQuery = z.object({
  status: InsightStatus.optional(),
  kind: RecommendationKind.optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
})

export const RecommendationsOverview = z
  .object({
    recommendations: z.array(RecommendationCard),
    counts: z.object({
      proposed: z.number().int(),
      validated: z.number().int(),
      rejected: z.number().int(),
    }),
    /** Validated insights, and those still to decide, of the project. */
    insights: z.number().int(),
    insightsToDecide: z.number().int(),
    run: RecommendationRunView.nullable(),
    lastRunCost: z.number().nullable(),
    /** The known part when a call has no price: see `costIncomplete`. */
    cost: z.number().nullable(),
    costIncomplete: z.boolean(),
    consentNeeded: z.boolean(),
    takeaways: TakeawaysView,
  })
  .meta({ id: 'RecommendationsOverview' })

export const RecommendationLink = z
  .object({
    insightId: Id,
    state: LinkState,
    origin: InsightOrigin,
    insight: LinkedInsightState,
    statement: Bilingual.nullable(),
    theme: InsightTheme.nullable(),
    level: ConfidenceLevel.nullable(),
    polarity: InsightPolarity.nullable(),
    version: Version.nullable(),
  })
  .meta({ id: 'RecommendationLink' })

export const RecommendationDetail = z
  .object({
    id: Id,
    version: Version,
    action: Bilingual,
    rationale: Bilingual,
    successMeasure: Bilingual,
    kind: RecommendationKind,
    kindShown: RecommendationKind,
    downgraded: z.boolean(),
    impact: Rating,
    effort: Rating,
    priority: z.number().int(),
    owner: z.string().nullable(),
    status: InsightStatus,
    origin: InsightOrigin,
    translation: Translation,
    links: z.array(RecommendationLink),
  })
  .meta({ id: 'RecommendationDetail' })

const Given = (max: number) =>
  z.object({ en: z.string().trim().max(max).optional(), fr: z.string().trim().max(max).optional() })

export const CreateRecommendation = z
  .object({
    action: Given(200),
    rationale: Given(1000).optional(),
    successMeasure: Given(300).optional(),
    kind: RecommendationKind,
    impact: Rating,
    effort: Rating,
    owner: z.string().trim().max(100).optional(),
    insights: z.array(Id).min(1).max(100),
  })
  .meta({ id: 'CreateRecommendation' })

export const EditRecommendation = z
  .object({
    version: Version,
    action: Given(200).optional(),
    rationale: Given(1000).optional(),
    successMeasure: Given(300).optional(),
    kind: RecommendationKind.optional(),
    impact: Rating.optional(),
    effort: Rating.optional(),
    owner: z.string().trim().max(100).nullable().optional(),
  })
  .meta({ id: 'EditRecommendation' })

export const DecideRecommendation = z
  .object({ version: Version, decision: z.enum(['validate', 'reject']) })
  .meta({ id: 'DecideRecommendation' })

export const ValidateRecommendations = z
  .object({
    recommendations: z
      .array(z.object({ id: Id, version: Version }))
      .min(1)
      .max(200),
  })
  .meta({ id: 'ValidateRecommendations' })

/** "Validate all shown": `blocked` rest only on insights still to decide. */
export const RecommendationsBulkResult = z
  .object({ done: z.number().int(), changed: z.number().int(), blocked: z.number().int() })
  .meta({ id: 'RecommendationsBulkResult' })

export const RecommendationRunRequest = z
  .object({ withProposed: z.boolean().default(false) })
  .meta({ id: 'RecommendationRunRequest' })
export const StartRecommendationRun = z
  .object({ withProposed: z.boolean().default(false), consent: z.boolean() })
  .meta({ id: 'StartRecommendationRun' })
export const RecommendationRunEstimate = z
  .object({
    insights: z.number().int(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'RecommendationRunEstimate' })

export const SaveTakeaways = z
  .object({ version: Version, text: Given(1200), fromDraft: z.boolean().optional() })
  .meta({ id: 'SaveTakeaways' })
export const TakeawaysEstimateRequest = z
  .object({ withProposed: z.boolean().default(false) })
  .meta({ id: 'TakeawaysEstimateRequest' })
export const TakeawaysEstimate = z
  .object({
    items: z.number().int(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'TakeawaysEstimate' })

export const DraftTakeaways = z
  .object({ consent: z.boolean(), withProposed: z.boolean().default(false) })
  .meta({ id: 'DraftTakeaways' })

export const RecommendationParams = z.object({ projectId: Id, recommendationId: Id })
export const RecommendationInsightParams = z.object({
  projectId: Id,
  recommendationId: Id,
  insightId: Id,
})

export const InsightsToLinkQuery = z.object({
  q: z.string().trim().max(200).optional(),
  theme: z.string().max(200).optional(),
  level: ConfidenceLevel.optional(),
  unused: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const InsightToLink = z
  .object({
    id: Id,
    statement: Bilingual,
    theme: InsightTheme,
    level: ConfidenceLevel,
    polarity: InsightPolarity,
    status: InsightStatus,
    version: Version,
    /** Recommendations (not rejected) resting on it. */
    recommendations: z.number().int(),
  })
  .meta({ id: 'InsightToLink' })
export const InsightsToLink = z.array(InsightToLink).meta({ id: 'InsightsToLink' })

/** Spec 017: whether what the key takeaways rest on changed since they were saved. */
export const TakeawaysFreshness = z
  .object({ outOfDate: z.boolean() })
  .meta({ id: 'TakeawaysFreshness' })
