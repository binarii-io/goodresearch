import { z } from 'zod'
import { Id, Timestamp } from './common.ts'

export const FileKind = z.enum(['transcript', 'media', 'other'])
const Person = z.object({ id: Id, name: z.string().nullable() })

export const StudySourceView = z
  .object({
    access: z.enum(['full', 'no-folder-access', 'drive-not-connected', 'drive-unavailable']),
    driveConfigured: z.boolean(),
    folderOwner: z.string().nullable(),
    source: z
      .object({
        folderId: z.string(),
        folderName: z.string(),
        ownerName: z.string().nullable(),
        webViewLink: z.string(),
        attachedBy: Person,
        attachedAt: Timestamp,
        inventory: z.object({
          status: z.enum(['never', 'running', 'done', 'failed']),
          startedAt: Timestamp.nullable(),
          finishedAt: Timestamp.nullable(),
          runBy: Person.nullable(),
          progress: z.object({ folders: z.number().int(), files: z.number().int() }).nullable(),
          failure: z.string().nullable(),
          lastSuccessAt: Timestamp.nullable(),
          outdated: z.boolean(),
          totals: z.object({
            byKind: z.object({
              transcript: z.number().int(),
              media: z.number().int(),
              other: z.number().int(),
            }),
            byGroup: z.array(z.object({ group: z.string(), count: z.number().int() })),
          }),
        }),
      })
      .nullable(),
  })
  .meta({ id: 'StudySourceView' })
export type StudySourceView = z.infer<typeof StudySourceView>

export const InventoryFile = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: FileKind,
    group: z.string(),
    mimeType: z.string(),
    size: z.number().nullable(),
    modifiedAt: Timestamp.nullable(),
    webViewLink: z.string(),
  })
  .meta({ id: 'InventoryFile' })
export type InventoryFile = z.infer<typeof InventoryFile>

export const AttachFolder = z
  .object({ link: z.string().min(1).max(2000) })
  .meta({ id: 'AttachFolder' })
export const InventoryFilesQuery = z.object({
  kind: FileKind.optional(),
  group: z.string().max(500).optional(),
})

export const MySource = z
  .object({
    connector: z.literal('google-drive'),
    configured: z.boolean(),
    status: z.enum(['connected', 'lost', 'none']),
    externalAccount: z.string().nullable(),
    connectedAt: Timestamp.nullable(),
    /** Whether the person let goodresearch edit their Drive files (spec 007). */
    canWrite: z.boolean(),
  })
  .meta({ id: 'MySource' })
export const ConnectQuery = z.object({
  returnTo: z.string().max(500).default('/'),
  /** `write`: also edit the files the person can edit, for publishing (spec 007). */
  access: z.enum(['read', 'write']).default('read'),
})
export const CallbackQuery = z.object({
  state: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
})
