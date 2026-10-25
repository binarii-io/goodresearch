import { z } from 'zod'
import { Id, Timestamp } from './common.ts'

export const PublicationKind = z.enum(['guide', 'best-practices', 'schedule'])

export const PublicationState = z.enum([
  'in-sync',
  'out-of-date',
  'changed-in-drive',
  'conflict',
  'unavailable',
])

/** A file published from a study's preparation (spec 007). */
export const Publication = z
  .object({
    id: Id,
    kind: PublicationKind,
    fileName: z.string(),
    webLink: z.string(),
    language: z.enum(['en', 'fr']),
    state: PublicationState,
    unavailableReason: z.enum(['missing', 'trashed', 'moved']).nullable(),
    counts: z.object({
      fromDrive: z.number().int(),
      conflicts: z.number().int(),
      notUnderstood: z.number().int(),
      rejected: z.number().int(),
    }),
    lastEditor: z.string().nullable(),
    publishedBy: z.string().nullable(),
    publishedAt: Timestamp,
    updatedBy: z.string().nullable(),
    updatedAt: Timestamp,
    lastCheckedAt: Timestamp.nullable(),
    /** After a check: whether the acting person can edit the file at the source, and its owner. */
    access: z.object({ canEdit: z.boolean(), owner: z.string().nullable() }).nullable(),
  })
  .meta({ id: 'Publication' })

/** One difference read from a published file; values are those of the compared item. */
export const DriveChange = z
  .object({
    id: Id,
    key: z.string(),
    kind: z.enum([
      'changed',
      'added',
      'removed',
      'reordered',
      'conflict',
      'not-understood',
      'invalid',
    ]),
    base: z.unknown(),
    app: z.unknown(),
    drive: z.unknown(),
    decision: z.enum(['pending', 'accepted', 'rejected']),
  })
  .meta({ id: 'DriveChange' })

export const PublishPreparation = z
  .object({
    kinds: z.array(PublicationKind).min(1).max(3),
    language: z.enum(['en', 'fr']),
    /** The person's time zone, for the schedule's dates (IANA name). */
    timeZone: z
      .string()
      .max(64)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone })
          return true
        } catch {
          return false
        }
      }, 'Unknown time zone'),
  })
  .meta({ id: 'PublishPreparation' })

export const DecideDriveChanges = z
  .object({
    decisions: z
      .array(
        z.object({
          changeId: Id,
          decision: z.enum(['accept', 'reject']),
          /** The final value chosen for a conflict (same shape as the item). */
          final: z.unknown().optional(),
        }),
      )
      .min(1)
      .max(500),
  })
  .meta({ id: 'DecideDriveChanges' })

export const DecisionResult = z
  .object({
    applied: z.number().int(),
    rejected: z.number().int(),
    alreadyDecided: z.number().int(),
  })
  .meta({ id: 'DecisionResult' })

export const UpdatePublication = z
  .object({ replaceDriveChanges: z.boolean().default(false) })
  .meta({ id: 'UpdatePublication' })

export const PublicationParams = z.object({ publicationId: Id })
