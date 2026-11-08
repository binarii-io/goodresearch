import { open } from 'node:fs/promises'
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
import { mp4DurationMs } from './mp4-duration.ts'

const API = 'https://www.googleapis.com/drive/v3'
const DOCS_API = 'https://docs.googleapis.com/v1'
const ITEM_FIELDS =
  'id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed,driveId,owners(displayName),shortcutDetails(targetId,targetMimeType),videoMediaMetadata(durationMillis)'

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
  /** Drive gives it as a string, once the video is processed (spec 037). */
  videoMediaMetadata?: { durationMillis?: string }
}

const GOOGLE_DOC = 'application/vnd.google-apps.document'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Spec 038: a video is downloaded by ranges of this size. */
const DOWNLOAD_CHUNK = 32 * 1024 * 1024
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

const durationOf = (raw: RawItem): { durationMs?: number } => {
  const ms = Number(raw.videoMediaMetadata?.durationMillis)
  return Number.isFinite(ms) && ms > 0 ? { durationMs: Math.round(ms) } : {}
}

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
  ...durationOf(raw),
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
  /** Spec 038: bytes per ranged read of a download (tests use small ones). */
  downloadChunkBytes?: number
}): DriveGateway => {
  const chunk = options.downloadChunkBytes ?? DOWNLOAD_CHUNK
  const google = options.requests ?? createGoogleRequests(options)
  const get = (refreshToken: string, url: URL) => google.request(refreshToken, url)

  const mediaUrl = (fileId: string) => {
    const url = new URL(`${API}/files/${encodeURIComponent(fileId)}`)
    url.searchParams.set('alt', 'media')
    url.searchParams.set('supportsAllDrives', 'true')
    return url
  }
  /** One ranged read, tried once more after a network error (spec 038). */
  const ranged = async (refreshToken: string, fileId: string, range: string | null) => {
    const init = range ? { headers: { range } } : {}
    try {
      return await google.request(refreshToken, mediaUrl(fileId), init)
    } catch (error) {
      if (error instanceof DriveConnectionLost) throw error
      return google.request(refreshToken, mediaUrl(fileId), init)
    }
  }

  /**
   * Spec 037 FR-004: Drive gives no length for some videos (never processed, or not for this
   * person); the MP4 header gives it, read by a few small ranges. Kept per file version.
   */
  const probed = new Map<string, number | null>()
  const lengthOf = async (refreshToken: string, item: DriveItem): Promise<DriveItem> => {
    const video = item.mimeType === 'video/mp4' || item.mimeType === 'video/quicktime'
    if (item.durationMs !== undefined || !video || !item.size) return item
    const key = `${item.id}:${item.modifiedTime ?? ''}:${item.size}`
    if (!probed.has(key)) {
      try {
        probed.set(
          key,
          await mp4DurationMs(async (start, end) => {
            const response = await ranged(refreshToken, item.id, `bytes=${start}-${end}`)
            if (response.status !== 206 && response.status !== 200) {
              await response.body?.cancel()
              return new Uint8Array()
            }
            // A 200 would be the whole file: keep only the asked bytes, stop reading.
            const reader = response.body?.getReader()
            const want = end - start + 1
            const parts: Uint8Array[] = []
            let got = 0
            while (reader && got < want) {
              const { done, value } = await reader.read()
              if (done) break
              parts.push(value)
              got += value.byteLength
            }
            await reader?.cancel()
            const all = new Uint8Array(got)
            let at = 0
            for (const part of parts) {
              all.set(part, at)
              at += part.byteLength
            }
            return all.subarray(0, Math.min(got, want))
          }, item.size),
        )
      } catch (error) {
        if (error instanceof DriveConnectionLost) throw error
        // Unreadable now: unknown, as when Drive says nothing; tried again on the next listing.
        return item
      }
    }
    const ms = probed.get(key)
    return ms ? { ...item, durationMs: ms } : item
  }

  return {
    checkGrant: (refreshToken) => google.checkGrant(refreshToken),

    downloadFile: async (refreshToken, fileId, toPath) => {
      const file = await open(toPath, 'w')
      let written = 0
      try {
        for (;;) {
          const response = await ranged(
            refreshToken,
            fileId,
            `bytes=${written}-${written + chunk - 1}`,
          )
          if (response.status === 401) throw new DriveConnectionLost()
          if (response.status === 404 || response.status === 403) return null
          // Past the end of a file whose size is a multiple of the chunk.
          if (response.status === 416) break
          if (!response.ok) throw new Error(`drive files.get media failed: ${response.status}`)
          const bytes = new Uint8Array(await response.arrayBuffer())
          await file.write(bytes, 0, bytes.byteLength, written)
          written += bytes.byteLength
          // 200: the whole file came at once.
          if (response.status === 200) break
          const total = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1])
          if (bytes.byteLength === 0 || (Number.isFinite(total) && written >= total)) break
        }
        return { bytes: written }
      } finally {
        await file.close()
      }
    },

    videoRange: async (refreshToken, fileId, range) => {
      const response = await ranged(refreshToken, fileId, range)
      if (response.status === 401) throw new DriveConnectionLost()
      if (response.status === 404 || response.status === 403) return null
      if (response.status !== 200 && response.status !== 206)
        throw new Error(`drive files.get media failed: ${response.status}`)
      const length = response.headers.get('content-length')
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'video/mp4',
        contentLength: length === null ? null : Number(length),
        contentRange: response.headers.get('content-range'),
        body: (response.body ??
          new ReadableStream<Uint8Array>()) as unknown as AsyncIterable<Uint8Array>,
      }
    },
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
        const items = (body.files ?? []).map(toItem)
        const withLength: DriveItem[] = []
        for (const item of items) withLength.push(await lengthOf(refreshToken, item))
        yield withLength
        pageToken = body.nextPageToken
      } while (pageToken)
    },
  }
}
