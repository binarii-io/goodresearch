import { z } from 'zod'
import { Id, Version } from './common.ts'
import { Polarity, Translation } from './facts.ts'

/** Spec 013: insights of a project, over the accepted facts of its studies. */
export const InsightStatus = z.enum(['proposed', 'validated', 'edited', 'rejected'])
export const InsightOrigin = z.enum(['ai', 'person'])
export const ConfidenceLevel = z.enum(['high', 'medium', 'low'])
export const InsightPolarity = z.enum(['positive', 'negative', 'neutral', 'mixed'])
export const LinkRole = z.enum(['support', 'counter'])
export const LinkState = z.enum(['counted', 'suggested', 'unlinked'])
/** The linked fact now (research R7). */
export const LinkedFactState = z.enum([
  'accepted',
  'to-decide',
  'not-accepted',
  'deleted',
  'outside',
  'changed',
])
export const InsightScope = z.enum(['all', 'unlinked'])
export const InsightsFailure = z.enum([
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
  'INTERRUPTED',
  'NO_FACTS',
])

const Who = z.object({ id: z.string(), name: z.string().nullable() })

/** A theme of the project: the guides' theme sections merged by title, or "Other" (`other`). */
export const InsightTheme = z
  .object({ key: z.string(), title: z.string().nullable() })
  .meta({ id: 'InsightTheme' })

/** Computed by the app, never by the AI (FR-008). */
export const InsightConfidence = z
  .object({
    level: ConfidenceLevel,
    /** Participants of the counted supporting and counter facts. */
    support: z.number().int(),
    counter: z.number().int(),
    panel: z.number().int(),
    /** The supporting participants "high" needs. */
    highAt: z.number().int(),
    /** Participants still missing for "high"; 0 when only counter-evidence holds it back. */
    missingForHigh: z.number().int(),
    /** Counter-evidence lowered it one level. */
    lowered: z.boolean(),
    /** Participants the linked facts still to decide would add once accepted. */
    pendingSupport: z.number().int(),
    pendingCounter: z.number().int(),
    /** The panel and the level once those facts are accepted. */
    panelIfAccepted: z.number().int(),
    levelIfAccepted: ConfidenceLevel,
  })
  .meta({ id: 'InsightConfidence' })

const Bilingual = z.object({ en: z.string(), fr: z.string() })

export const InsightCard = z
  .object({
    id: Id,
    version: Version,
    theme: InsightTheme,
    statement: Bilingual,
    status: InsightStatus,
    origin: InsightOrigin,
    translation: Translation,
    confidence: InsightConfidence,
    polarity: InsightPolarity,
    /** Counted links whose fact changed since (FR-012). */
    evidenceChanged: z.number().int(),
    suggested: z.number().int(),
    /** Linked facts still to decide in their study: counted once accepted. */
    toValidate: z.number().int(),
  })
  .meta({ id: 'InsightCard' })

export const InsightRunView = z
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
  .meta({ id: 'InsightRunView' })

export const InsightsQuery = z.object({
  theme: z.string().max(200).optional(),
  status: InsightStatus.optional(),
  confidence: ConfidenceLevel.optional(),
  polarity: InsightPolarity.optional(),
})

export const InsightsOverview = z
  .object({
    themes: z.array(InsightTheme),
    insights: z.array(InsightCard),
    counts: z.object({
      proposed: z.number().int(),
      validated: z.number().int(),
      rejected: z.number().int(),
    }),
    /** Accepted facts of the project's studies and the participants they come from. */
    facts: z.number().int(),
    /** Facts not rejected, still to decide in their study. */
    factsToDecide: z.number().int(),
    panel: z.number().int(),
    run: InsightRunView.nullable(),
    lastRunCost: z.number().nullable(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
  })
  .meta({ id: 'InsightsOverview' })

export const InsightLink = z
  .object({
    factId: Id,
    role: LinkRole,
    state: LinkState,
    origin: InsightOrigin,
    fact: LinkedFactState,
    studyId: Id.nullable(),
    sessionId: Id.nullable(),
    participant: z.string().nullable(),
    /** The fact's version, to decide it from here; null when deleted. */
    version: Version.nullable(),
    /** Null when deleted, or when the viewer cannot open its study. */
    statement: Bilingual.nullable(),
    polarity: Polarity.nullable(),
  })
  .meta({ id: 'InsightLink' })

export const InsightDetail = z
  .object({
    id: Id,
    version: Version,
    theme: InsightTheme,
    statement: Bilingual,
    description: Bilingual,
    counterEvidence: Bilingual,
    minorityView: Bilingual,
    status: InsightStatus,
    origin: InsightOrigin,
    translation: Translation,
    confidence: InsightConfidence,
    polarity: InsightPolarity,
    links: z.array(InsightLink),
    decidedBy: Who.nullable(),
  })
  .meta({ id: 'InsightDetail' })

const Statement = z.string().trim().min(1).max(200)
const Text = (max: number) => z.string().trim().max(max)
/** One language or both; the missing one is translated (spec 012 research R9). */
const Given = <T extends z.ZodType>(t: T) => z.object({ en: t.optional(), fr: t.optional() })

export const CreateInsight = z
  .object({
    themeKey: z.string().min(1).max(200),
    statement: Given(Statement),
    description: Given(Text(1000)).optional(),
    counterEvidence: Given(Text(500)).optional(),
    minorityView: Given(Text(500)).optional(),
    support: z.array(Id).min(1).max(200),
    counter: z.array(Id).max(200).optional(),
  })
  .meta({ id: 'CreateInsight' })

export const EditInsight = z
  .object({
    version: Version,
    themeKey: z.string().min(1).max(200).optional(),
    statement: Given(Statement).optional(),
    description: Given(Text(1000)).optional(),
    counterEvidence: Given(Text(500)).optional(),
    minorityView: Given(Text(500)).optional(),
  })
  .meta({ id: 'EditInsight' })

export const DecideInsight = z
  .object({ version: Version, decision: z.enum(['validate', 'reject']) })
  .meta({ id: 'DecideInsight' })

export const ValidateInsights = z
  .object({
    insights: z
      .array(z.object({ id: Id, version: Version }))
      .min(1)
      .max(200),
  })
  .meta({ id: 'ValidateInsights' })

export const InsightsBulkResult = z
  .object({ done: z.number().int(), changed: z.number().int() })
  .meta({ id: 'InsightsBulkResult' })

export const LinkFact = z.object({ version: Version, role: LinkRole }).meta({ id: 'LinkFact' })
export const InsightVersion = z.object({ version: Version }).meta({ id: 'InsightVersion' })
export const InsightVersionQuery = z.object({ version: z.coerce.number().int().nonnegative() })

export const ProjectFactsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(200).optional(),
  polarity: Polarity.optional(),
  theme: z.string().max(200).optional(),
  study: Id.optional(),
  unlinked: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  status: z.enum(['accepted', 'to-decide']).optional(),
})

export const ProjectFact = z
  .object({
    id: Id,
    version: Version,
    studyId: Id,
    studyName: z.string(),
    sessionId: Id,
    participant: z.string().nullable(),
    /** Null when the viewer cannot open its study (FR-018). */
    statement: Bilingual.nullable(),
    status: z.enum(['accepted', 'to-decide']),
    polarity: Polarity,
    theme: InsightTheme,
    insights: z.number().int(),
  })
  .meta({ id: 'ProjectFact' })

export const ProjectFactsPage = z
  .object({
    items: z.array(ProjectFact),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    studies: z.array(z.object({ id: Id, name: z.string() })),
  })
  .meta({ id: 'ProjectFactsPage' })

/** The estimate also lists the studies to choose from: an empty choice is allowed. */
export const InsightRunRequest = z
  .object({
    studyIds: z.array(Id).max(100),
    scope: InsightScope,
    /** The facts still to decide are sent too (FR-003, update). */
    withProposed: z.boolean().default(false),
  })
  .meta({ id: 'InsightRunRequest' })

export const InsightRunEstimate = z
  .object({
    facts: z.number().int(),
    calls: z.number().int(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
    /** The project's studies the person can open, with their accepted facts. */
    studies: z.array(
      z.object({
        id: Id,
        name: z.string(),
        facts: z.number().int(),
        toDecide: z.number().int(),
      }),
    ),
  })
  .meta({ id: 'InsightRunEstimate' })

export const StartInsightRun = z
  .object({
    studyIds: z.array(Id).min(1).max(100),
    scope: InsightScope,
    withProposed: z.boolean().default(false),
    consent: z.boolean(),
  })
  .meta({ id: 'StartInsightRun' })
export const InsightRunStarted = z.object({ runId: Id }).meta({ id: 'InsightRunStarted' })

export const InsightsParams = z.object({ projectId: Id })
export const InsightParams = z.object({ projectId: Id, insightId: Id })
export const InsightFactParams = z.object({ projectId: Id, insightId: Id, factId: Id })
export const InsightRunParams = z.object({ projectId: Id, runId: Id })
