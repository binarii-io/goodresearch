import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

export const ResponseState = z.enum([
  'counted',
  'out-of-target',
  'profile-not-answered',
  'refused-consent',
])
export type ResponseState = z.infer<typeof ResponseState>

/** Item id → accepted options (spec 028 FR-009). */
const Accepted = z.record(z.string().max(64), z.array(z.string().min(1).max(600)).min(1).max(20))

export const SaveTargetRule = z
  .object({ accepted: Accepted, version: Version.nullable() })
  .meta({ id: 'SaveTargetRule' })

export const ReadResponses = z.object({ force: z.boolean().default(false) }).meta({
  id: 'ReadResponses',
})

export const ResponsesSummary = z
  .object({
    counts: z.object({
      total: z.number().int(),
      counted: z.number().int(),
      outOfTarget: z.number().int(),
      profileNotAnswered: z.number().int(),
      refusedConsent: z.number().int(),
    }),
    /** Responses of a former form of this study: not counted. */
    fromFormerForm: z.number().int(),
    target: z.number().int().nullable(),
    reading: z
      .object({
        status: z.enum(['done', 'failed', 'stopped']),
        readAt: Timestamp,
        unknownQuestions: z.number().int(),
        unknownValues: z.number().int(),
      })
      .nullable(),
    rule: z
      .object({
        accepted: Accepted,
        version: Version,
        /** Names an item or an option no longer there. */
        stale: z.boolean(),
        origin: z.enum(['person', 'assistant']),
        updatedBy: z.object({ name: z.string() }).nullable(),
        updatedAt: Timestamp,
      })
      .nullable(),
    /** What the rule can filter: choice items of the profiling sections. */
    filterable: z.array(
      z.object({ id: z.string(), text: z.string(), options: z.array(z.string()) }),
    ),
  })
  .meta({ id: 'ResponsesSummary' })
export type ResponsesSummary = z.infer<typeof ResponsesSummary>

export const ResponsesQuery = z.object({
  state: ResponseState.optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export const ResponsesPage = z
  .object({
    items: z.array(z.object({ id: z.string(), submittedAt: Timestamp, state: ResponseState })),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'ResponsesPage' })

export const ResponseParams = z.object({ studyId: Id, responseId: z.string().min(1).max(200) })

export const ResponseDetail = z
  .object({
    id: z.string(),
    submittedAt: Timestamp,
    state: ResponseState,
    answers: z.array(
      z.object({
        itemId: z.string(),
        text: z.string(),
        /** The wording this response answered, when it was changed since. */
        formerText: z.string().nullable(),
        values: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: 'ResponseDetail' })
