import { err, ok, type Result } from '@goodresearch/shared'

const ID = /^[A-Za-z0-9_-]{10,}$/

/**
 * Extracts a Drive folder id from a pasted link (FR-008): `/drive/folders/<id>`,
 * `/drive/u/<n>/folders/<id>`, `open?id=<id>`, or the bare id. Documents and files are refused.
 */
export const parseDriveFolderLink = (input: string): Result<string, 'NOT_A_DRIVE_FOLDER_LINK'> => {
  const value = input.trim()
  if (ID.test(value)) return ok(value)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return err('NOT_A_DRIVE_FOLDER_LINK')
  }
  if (url.hostname !== 'drive.google.com') return err('NOT_A_DRIVE_FOLDER_LINK')
  const folder = url.pathname.match(/^\/drive(?:\/u\/\d+)?\/folders\/([A-Za-z0-9_-]+)\/?$/)?.[1]
  const open = url.pathname === '/open' ? url.searchParams.get('id') : null
  const id = folder ?? open
  return id && ID.test(id) ? ok(id) : err('NOT_A_DRIVE_FOLDER_LINK')
}
