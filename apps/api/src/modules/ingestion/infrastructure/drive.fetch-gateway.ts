import {
  DriveAccessDenied,
  DriveConnectionLost,
  type DriveGateway,
  DriveIncompleteListing,
  type DriveItem,
  TranscriptUnreadable,
} from '../domain/drive-gateway.ts'
import { cutText, subtitlesToText } from '../domain/transcript-text.ts'
import { docxText } from './docx-text.ts'
import { createGoogleRequests, type GoogleRequests } from './google-requests.ts'

const API = 'https://www.googleapis.com/drive/v3'
const DOCS_API = 'https://docs.googleapis.com/v1'
const ITEM_FIELDS =
  'id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed,driveId,owners(displayName),shortcutDetails(targetId,targetMimeType)'

type RawItem = {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  size?: string
  modifiedTime?: string
  webViewLink?: string
  trashed?: boolean
  driveId?: string
  owners?: { displayName?: string }[]
  shortcutDetails?: { targetId?: string; targetMimeType?: string }
}

const GOOGLE_DOC = 'application/vnd.google-apps.document'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** A Word file is read whole (a zip): larger ones are not transcripts worth reading. */
const DOCX_MAX_BYTES = 20 * 1024 * 1024

type DocTab = {
  tabProperties?: { title?: string }
  documentTab?: {
    body?: {
      content?: {
        paragraph?: {
          elements?: {
            textRun?: { content?: string }
            /** A person chip (meeting notes list the invited people this way). */
            person?: { personProperties?: { name?: string; email?: string } }
          }[]
        }
      }[]
    }
  }
  childTabs?: DocTab[]
}

const flatTabs = (tabs: DocTab[] = []): DocTab[] =>
  tabs.flatMap((t) => [t, ...flatTabs(t.childTabs)])

/**
 * The text of a tab. A person chip reads as "Name," in a transcript (a list of chips reads as a
 * list of names), and as "[[person:Name]]" in meeting notes, where the chips are the invited
 * people whatever the heading or language (spec 009).
 */
const tabText = (tab: DocTab, chips: 'names' | 'markers' = 'names'): string =>
  (tab.documentTab?.body?.content ?? [])
    .map((c) =>
      (c.paragraph?.elements ?? [])
        .map((e) => {
          const person = e.person?.personProperties
          if (!person) return e.textRun?.content ?? ''
          const who = person.name || person.email || ''
          return chips === 'markers' ? `[[person:${who}]]` : `${who},`
        })
        .join(''),
    )
    .join('')

const toItem = (raw: RawItem): DriveItem => ({
  id: raw.id,
  name: raw.name,
  mimeType: raw.mimeType,
  ...(raw.parents ? { parents: raw.parents } : {}),
  ...(raw.size !== undefined ? { size: Number(raw.size) } : {}),
  ...(raw.modifiedTime ? { modifiedTime: raw.modifiedTime } : {}),
  ...(raw.webViewLink ? { webViewLink: raw.webViewLink } : {}),
  ...(raw.trashed !== undefined ? { trashed: raw.trashed } : {}),
  ...(raw.driveId ? { driveId: raw.driveId } : {}),
  ...(raw.owners?.[0]?.displayName ? { ownerName: raw.owners[0].displayName } : {}),
  ...(raw.shortcutDetails?.targetId ? { shortcutTargetId: raw.shortcutDetails.targetId } : {}),
  ...(raw.shortcutDetails?.targetMimeType
    ? { shortcutTargetMimeType: raw.shortcutDetails.targetMimeType }
    : {}),
})

/**
 * Google Drive v3 over plain fetch, read-only: only GET requests reach the Drive API (SC-005).
 * Access tokens are minted from each person's refresh token and kept in memory until they expire.
 */
export const createDriveFetchGateway = (options: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  retryDelayMs?: number
  /** Shared with the documents adapter: one access token per person (PR #7 review). */
  requests?: GoogleRequests
}): DriveGateway => {
  const google = options.requests ?? createGoogleRequests(options)
  const get = (refreshToken: string, url: URL) => google.request(refreshToken, url)

  return {
    getItem: async (refreshToken, id) => {
      const url = new URL(`${API}/files/${encodeURIComponent(id)}`)
      url.searchParams.set('fields', ITEM_FIELDS)
      url.searchParams.set('supportsAllDrives', 'true')
      const response = await get(refreshToken, url)
      // 404: unknown or not shared; 403 after the rate-limit retries: refused by Drive for this person.
      if (response.status === 404 || response.status === 403) return null
      if (response.status === 401) throw new DriveConnectionLost()
      if (!response.ok) throw new Error(`drive files.get failed: ${response.status}`)
      return toItem((await response.json()) as RawItem)
    },

    documentTabs: async (refreshToken, fileId) => {
      const url = new URL(`${DOCS_API}/documents/${encodeURIComponent(fileId)}`)
      url.searchParams.set('includeTabsContent', 'true')
      // Titles only: the text of the document is never asked for.
      url.searchParams.set(
        'fields',
        'tabs(tabProperties/title,childTabs(tabProperties/title,childTabs(tabProperties/title)))',
      )
      const response = await get(refreshToken, url)
      if (response.status === 401) throw new DriveConnectionLost()
      if (!response.ok) return null
      type Tab = { tabProperties?: { title?: string }; childTabs?: Tab[] }
      const titles = (tabs: Tab[] = []): string[] =>
        tabs.flatMap((t) => [t.tabProperties?.title ?? '', ...titles(t.childTabs)])
      return titles(((await response.json()) as { tabs?: Tab[] }).tabs)
    },

    readNotesStart: async (refreshToken, fileId, maxChars) => {
      const url = new URL(`${DOCS_API}/documents/${encodeURIComponent(fileId)}`)
      url.searchParams.set('includeTabsContent', 'true')
      const response = await get(refreshToken, url)
      if (response.status === 401) throw new DriveConnectionLost()
      if (!response.ok) return null
      const tabs = flatTabs(((await response.json()) as { tabs?: DocTab[] }).tabs)
      const notes = tabs.filter((t) => !/transcri/i.test(t.tabProperties?.title ?? ''))
      return cutText(notes.map((t) => tabText(t, 'markers')).join('\n'), maxChars)
    },

    readTextStart: async (refreshToken, file, maxChars) => {
      const name = file.name.toLowerCase()
      if (file.mimeType === GOOGLE_DOC) {
        // Spec 008 FR-002b: the tab that holds the transcript, else the first one.
        const url = new URL(`${DOCS_API}/documents/${encodeURIComponent(file.id)}`)
        url.searchParams.set('includeTabsContent', 'true')
        const response = await get(refreshToken, url)
        if (response.status === 401) throw new DriveConnectionLost()
        if (response.status === 404 || response.status === 403) return null
        if (!response.ok) throw new Error(`docs documents.get failed: ${response.status}`)
        const tabs = flatTabs(((await response.json()) as { tabs?: DocTab[] }).tabs)
        const tab = tabs.find((t) => /transcri/i.test(t.tabProperties?.title ?? '')) ?? tabs[0]
        return cutText(tab ? tabText(tab) : '', maxChars)
      }
      const docx = file.mimeType === DOCX || name.endsWith('.docx')
      const text =
        file.mimeType.startsWith('text/') ||
        file.mimeType === 'application/x-subrip' ||
        /\.(txt|vtt|srt)$/.test(name)
      if (!docx && !text) throw new TranscriptUnreadable()
      const url = new URL(`${API}/files/${encodeURIComponent(file.id)}`)
      url.searchParams.set('alt', 'media')
      url.searchParams.set('supportsAllDrives', 'true')
      // Text: only the first bytes (4 per character at most); Word: the whole zip.
      const response = await google.request(refreshToken, url, {
        headers: docx ? {} : { range: `bytes=0-${maxChars * 4 - 1}` },
      })
      if (response.status === 401) throw new DriveConnectionLost()
      if (response.status === 404 || response.status === 403) return null
      if (!response.ok && response.status !== 206)
        throw new Error(`drive files.get media failed: ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (docx) {
        if (bytes.byteLength > DOCX_MAX_BYTES) throw new TranscriptUnreadable()
        return cutText(docxText(bytes), maxChars)
      }
      // A cut in the middle of a character drops it (replacement character removed).
      const raw = new TextDecoder('utf-8').decode(bytes).replace(/\uFFFD+$/, '')
      return cutText(
        /\.(vtt|srt)$/.test(name) ||
          file.mimeType === 'text/vtt' ||
          file.mimeType === 'application/x-subrip'
          ? subtitlesToText(raw)
          : raw,
        maxChars,
      )
    },

    async *listChildren(refreshToken, parentIds, driveId) {
      let pageToken: string | undefined
      do {
        const url = new URL(`${API}/files`)
        const parents = parentIds
          // Drive query strings: escape backslashes first, then quotes.
          .map((id) => `'${id.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}' in parents`)
          .join(' or ')
        url.searchParams.set('q', `(${parents}) and trashed = false`)
        url.searchParams.set('pageSize', '1000')
        url.searchParams.set('fields', `nextPageToken,incompleteSearch,files(${ITEM_FIELDS})`)
        url.searchParams.set('supportsAllDrives', 'true')
        url.searchParams.set('includeItemsFromAllDrives', 'true')
        if (driveId) {
          url.searchParams.set('corpora', 'drive')
          url.searchParams.set('driveId', driveId)
        } else url.searchParams.set('corpora', 'user')
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const response = await get(refreshToken, url)
        if (response.status === 401) throw new DriveConnectionLost()
        if (response.status === 403 || response.status === 404) throw new DriveAccessDenied()
        if (!response.ok) throw new Error(`drive files.list failed: ${response.status}`)
        const body = (await response.json()) as {
          files?: RawItem[]
          nextPageToken?: string
          incompleteSearch?: boolean
        }
        if (body.incompleteSearch) throw new DriveIncompleteListing()
        yield (body.files ?? []).map(toItem)
        pageToken = body.nextPageToken
      } while (pageToken)
    },
  }
}
