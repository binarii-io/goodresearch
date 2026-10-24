import { z } from 'zod'

/** Stable error codes returned in `application/problem+json` bodies (contracts/http-api.md). */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'PROJECT_NOT_FOUND',
  'TEAM_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'VERSION_CONFLICT',
  'TEAM_NAME_TAKEN',
  'TEAM_HAS_PROJECTS',
  'LAST_ADMIN',
  'ACCOUNT_DELETED',
  'CONFIRMATION_MISMATCH',
  'NOT_FOUND',
  'INTERNAL',
  'STUDY_NOT_FOUND',
  'FOLDER_ACCESS_REQUIRED',
  'NOT_A_DRIVE_FOLDER_LINK',
  'FOLDER_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_NOT_CONFIGURED',
  'INVENTORY_RUNNING',
  'DRIVE_UNAVAILABLE',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION: 422,
  PROJECT_NOT_FOUND: 404,
  TEAM_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  TEAM_NAME_TAKEN: 409,
  TEAM_HAS_PROJECTS: 409,
  LAST_ADMIN: 409,
  ACCOUNT_DELETED: 409,
  CONFIRMATION_MISMATCH: 409,
  INTERNAL: 500,
  STUDY_NOT_FOUND: 404,
  FOLDER_ACCESS_REQUIRED: 403,
  NOT_A_DRIVE_FOLDER_LINK: 422,
  FOLDER_NOT_FOUND: 422,
  DRIVE_NOT_CONNECTED: 409,
  DRIVE_NOT_CONFIGURED: 409,
  INVENTORY_RUNNING: 409,
  DRIVE_UNAVAILABLE: 503,
}

/** RFC 9457 problem details with a stable `code`. */
export const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.enum(ERROR_CODES),
    detail: z.record(z.string(), z.unknown()).optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string().optional(),
  })
  .meta({ id: 'Problem' })

export type Problem = z.infer<typeof Problem>
