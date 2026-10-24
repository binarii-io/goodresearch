import { ApiError } from '@goodresearch/api-client'
import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

const MESSAGES: Record<string, MessageDescriptor> = {
  VALIDATION: msg`Some fields are not valid.`,
  VERSION_CONFLICT: msg`Someone changed this in the meantime. Reload to see the latest version.`,
  TEAM_NAME_TAKEN: msg`A team with this name already exists.`,
  TEAM_HAS_PROJECTS: msg`This team still has projects. Move them to another team first.`,
  LAST_ADMIN: msg`The workspace needs at least one active admin.`,
  CONFIRMATION_MISMATCH: msg`The email you typed does not match.`,
  ACCOUNT_DELETED: msg`This account was deleted.`,
  PROJECT_NOT_FOUND: msg`This project does not exist or you do not have access to it.`,
  TEAM_NOT_FOUND: msg`This team does not exist or you do not have access to it.`,
  MEMBER_NOT_FOUND: msg`This person does not exist.`,
  FORBIDDEN: msg`Only admins can do this.`,
  STUDY_NOT_FOUND: msg`This study does not exist or you do not have access to it.`,
  FOLDER_ACCESS_REQUIRED: msg`You need access to this study's Drive folder to do this.`,
  NOT_A_DRIVE_FOLDER_LINK: msg`This is not the link of a Google Drive folder.`,
  FOLDER_NOT_FOUND: msg`This folder does not exist or your Google account cannot open it.`,
  DRIVE_NOT_CONNECTED: msg`Connect your Google Drive first.`,
  DRIVE_NOT_CONFIGURED: msg`Google Drive is not configured on this instance.`,
  INVENTORY_RUNNING: msg`An inventory is already running for this study.`,
  DRIVE_UNAVAILABLE: msg`Google Drive did not answer. Try again in a moment.`,
}

/** One translated sentence for any error (never technical details). */
export const errorMessage = (i18n: I18n, error: unknown): string => {
  const descriptor = error instanceof ApiError && error.code ? MESSAGES[error.code] : undefined
  return i18n._(descriptor ?? msg`Something went wrong. Please try again.`)
}

export const errorCode = (error: unknown): string | undefined =>
  error instanceof ApiError ? error.code : undefined
