import { randomBytes } from 'node:crypto'
import type { DocModel, TableRead } from '../domain/drive-documents.ts'
import {
  type DriveAuthorization,
  DriveConnectionLost,
  type DriveGateway,
  type DriveItem,
  FOLDER_MIME,
} from '../domain/drive-gateway.ts'
import { DRIVE_CALLBACK_PATH } from './google-oauth.ts'
import { InMemoryDriveDocuments } from './in-memory.drive-documents.ts'

/** The folder every simulated account can open (link: https://drive.google.com/drive/folders/<id>). */
export const DEV_FOLDER_ID = 'dev-study-folder'
const ACCOUNT = 'drive-user@example.test'
const TOKEN_PREFIX = 'dev-drive-'

/**
 * A Google Drive simulated in memory for the dev stack and end-to-end tests (`DRIVE_FAKE`, spec
 * 007): the consent comes straight back, one demo folder with two files is open to everyone, and
 * published files live in memory until the server restarts. Never used with https (config).
 */
export const createDevDrive = (appUrl: URL) => {
  const items = new Map<string, DriveItem>([
    [
      DEV_FOLDER_ID,
      {
        id: DEV_FOLDER_ID,
        name: 'Demo study folder',
        mimeType: FOLDER_MIME,
        ownerName: 'Drive user',
        webViewLink: `https://drive.google.com/drive/folders/${DEV_FOLDER_ID}`,
      },
    ],
    [
      'dev-transcript',
      {
        id: 'dev-transcript',
        name: 'Interview 1 - transcript.txt',
        mimeType: 'text/plain',
        parents: [DEV_FOLDER_ID],
        size: 1200,
        modifiedTime: '2026-10-20T10:00:00Z',
      },
    ],
    [
      'dev-recording',
      {
        id: 'dev-recording',
        name: 'Interview 1 - recording.mp4',
        mimeType: 'video/mp4',
        parents: [DEV_FOLDER_ID],
        size: 50_000,
        modifiedTime: '2026-10-20T10:00:00Z',
      },
    ],
  ])
  // Any token this simulation issued works, in every process (the worker runs inventories with
  // tokens the server issued): no state to share.
  const known = (token: string) => {
    if (!token.startsWith(TOKEN_PREFIX)) throw new DriveConnectionLost()
    return 'Drive user'
  }

  const gateway: DriveGateway = {
    getItem: async (token, id) => {
      known(token)
      return items.get(id) ?? null
    },
    async *listChildren(token, parentIds) {
      known(token)
      yield [...items.values()].filter((i) => i.parents?.some((p) => parentIds.includes(p)))
    },
  }

  const authorization: DriveAuthorization = {
    authorizationUrl: ({ state, access }) => {
      const url = new URL(DRIVE_CALLBACK_PATH, appUrl)
      url.search = new URLSearchParams({ state, code: `dev-${access}` }).toString()
      return url.toString()
    },
    exchange: async ({ access }) => {
      const refreshToken = `${TOKEN_PREFIX}${randomBytes(12).toString('hex')}`
      return { refreshToken, externalAccount: ACCOUNT, access }
    },
    revoke: async () => {},
  }

  const documents = new InMemoryDriveDocuments(known)

  /** What a person does in Drive, for the dev endpoint (texts replaced, cells set). */
  const edit = (
    fileId: string,
    change: {
      replace?: { from: string; to: string }[] | undefined
      cells?: { row: string; key: string; value: string | null }[] | undefined
    },
  ): boolean => {
    if (!documents.files.has(fileId)) return false
    documents.edit(fileId, 'Someone in Drive', {
      doc: (doc: DocModel) => ({
        blocks: doc.blocks.map((b) => {
          const r = change.replace?.find((x) => x.from === b.text)
          return r ? { ...b, text: r.to } : b
        }),
      }),
      table: (table: TableRead) => ({
        ...table,
        rows: table.rows.map((row) => {
          const cells = { ...row.cells }
          for (const c of change.cells ?? []) if (c.row === row.id) cells[c.key] = c.value
          return { ...row, cells }
        }),
      }),
    })
    return true
  }

  return { gateway, authorization, documents, edit }
}

export type DevDrive = ReturnType<typeof createDevDrive>
