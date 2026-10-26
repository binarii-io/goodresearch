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

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const GOOGLE_DOC = 'application/vnd.google-apps.document'
/**
 * Beginnings of the demo transcripts (spec 009): a meeting tool's header with participants, speaker
 * labels that need the AI, and a Word file read as text. Spec 010: unusual words to find (a product
 * name and its misspelling, an acronym, a filler).
 */
const DEMO_TEXTS: Record<string, string> = {
  'dev-transcript': [
    'Transcript',
    'Interview Sam Example',
    '20 October 2026, 10:00',
    'Participants: Sam Example, Lee Example',
    '',
    'Lee Example: Thank you for joining. Could you introduce yourself in a few words?',
    'Sam Example: Sure. I plan the week for the whole household, usually on Sunday evening.',
    'Lee Example: What happened the last time you planned your week?',
    'Sam Example: We use Goodresearch for that, and our NPS went up. Hmm.',
  ].join('\n'),
  'dev-transcript-2': [
    'Robin Sample: Hello, and thanks for taking the time to talk with us today.',
    'Casey Test: Thanks for having me, it is a pleasure.',
    'Robin Sample: So what do you think about the way you plan your week?',
    'Casey Test: Well, I keep a paper list on the fridge and I update it every evening.',
    'Casey Test: My team tried Gooresearch too, and the NPS is good. Hmm.',
  ].join('\n'),
  'dev-transcript-3': [
    'Entretien avec Camille',
    '27/10/2026',
    'Intervieweuse : Alors, est-ce que vous pouvez vous présenter ?',
    'Camille : Oui, je suis responsable de la logistique et je prépare les plannings de la semaine.',
    'Camille : Nous utilisons Goodresearch au quotidien.',
  ].join('\n'),
  'dev-notes-1': [
    'Lee Other: Thanks for your time, shall we start with your role?',
    'Jordan Sample: I coordinate the volunteers of the association.',
  ].join('\n'),
}

/** Meeting notes of the demo documents: who was invited, with full names. */
const DEMO_NOTES: Record<string, string> = {
  'dev-notes-1':
    'Notes\nInvited: Lee Other, Jordan Sample\n\nSummary\nThe association plans its volunteers.',
}

const DEMO_TABS: Record<string, string[]> = {
  'dev-notes-1': ['Notes', 'Transcript'],
  'dev-notes-2': ['Notes'],
}

/**
 * Transcripts and recordings in two groups: a pair at the same time, a pair sharing a rare word,
 * one transcript named after an interviewee, one recording without a transcript.
 */
const demoFiles = (): [string, DriveItem][] => {
  const folder = (id: string, name: string): [string, DriveItem] => [
    id,
    { id, name, mimeType: FOLDER_MIME, parents: [DEV_FOLDER_ID], ownerName: 'Drive user' },
  ]
  const file = (
    id: string,
    name: string,
    parent: string,
    mimeType: string,
    modifiedTime: string,
  ): [string, DriveItem] => [
    id,
    { id, name, mimeType, parents: [parent], size: 1200, modifiedTime },
  ]
  return [
    folder('dev-week-1', 'Week 1'),
    folder('dev-week-2', 'Week 2'),
    file(
      'dev-transcript',
      'Interview Sam Example.txt',
      'dev-week-1',
      'text/plain',
      '2026-10-20T10:00:00Z',
    ),
    file(
      'dev-recording',
      'Interview Sam Example.mp4',
      'dev-week-1',
      'video/mp4',
      '2026-10-20T10:00:20Z',
    ),
    file(
      'dev-transcript-2',
      'Interview 2 - transcript.txt',
      'dev-week-1',
      'text/plain',
      '2026-10-21T14:00:00Z',
    ),
    file('dev-transcript-3', 'Camille.docx', 'dev-week-2', DOCX, '2026-10-27T09:00:00Z'),
    file('dev-recording-3', 'Camille audio.m4a', 'dev-week-2', 'audio/mp4', '2026-10-27T16:00:00Z'),
    file(
      'dev-recording-4',
      'Extra recording.mp4',
      'dev-week-2',
      'video/mp4',
      '2026-10-28T11:00:00Z',
    ),
    // Meeting notes: an interview only when a tab holds the transcript.
    file('dev-notes-1', 'Interview Lee - Notes', 'dev-week-2', GOOGLE_DOC, '2026-10-29T09:00:00Z'),
    file('dev-notes-2', 'Team sync - Notes', 'dev-week-2', GOOGLE_DOC, '2026-10-29T15:00:00Z'),
    // Belongs to Sam's interview by its name (spec 009 US5).
    file(
      'dev-consent',
      'Sam Example consent.pdf',
      'dev-week-1',
      'application/pdf',
      '2026-10-20T09:00:00Z',
    ),
  ]
}

/**
 * A Google Drive simulated in memory for the dev stack and end-to-end tests (`DRIVE_FAKE`, spec
 * 007): the consent comes straight back, one demo folder (two groups of interviews, spec 008) is
 * open to everyone, and
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
    ...demoFiles(),
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
    documentTabs: async (token, id) => {
      known(token)
      return DEMO_TABS[id] ?? null
    },
    readNotesStart: async (token, id, maxChars) => {
      known(token)
      return DEMO_NOTES[id]?.slice(0, maxChars) ?? null
    },
    readTextStart: async (token, file, maxChars) => {
      known(token)
      if (!items.has(file.id)) return null
      return (DEMO_TEXTS[file.id] ?? '').slice(0, maxChars)
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

  // The demo files can be renamed by the app (spec 009): the folder then shows the new name.
  const documents = new InMemoryDriveDocuments(known, (id, name) => {
    const item = items.get(id)
    if (item) items.set(id, { ...item, name })
  })
  for (const item of items.values())
    if (item.mimeType !== FOLDER_MIME) documents.adopt(item.id, item.name, item.parents ?? [])

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
