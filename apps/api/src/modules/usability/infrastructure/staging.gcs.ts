import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ProviderMissing, type StagedFile, type Staging } from '../application/ports.ts'
import { providerError } from './provider-error.ts'

const API = 'https://storage.googleapis.com/storage/v1'
const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1'
const READ = 'https://storage.googleapis.com'
/** Bytes per part of a resumable upload: a multiple of 256 KiB, the most held in memory. */
export const PART_BYTES = 8 * 1024 * 1024
/**
 * An access is reused this long only: Google's own clients may hand one with five minutes left,
 * and ffmpeg needs it valid while it opens the copy.
 */
const ACCESS_TTL_MS = 4 * 60_000

export type GoogleAccess = { project: string; region: string; accessToken: string }

/** The bucket of the temporary copies: the deployer's, else one named after the project. */
export const stagingBucketOf = (project: string, configured: string | null) =>
  (configured ?? `${project}-goodresearch-video-staging`).toLowerCase().slice(0, 63)

/** Vertex multi-regions are written in capitals as bucket locations. */
const locationOf = (region: string) =>
  region === 'eu' || region === 'us' ? region.toUpperCase() : region

/**
 * Temporary copies the AI provider reads (spec 038 FR-003, research R4): a bucket of the Vertex
 * project and region, created on first use with a rule deleting every object after one day, so a
 * copy a crash left behind goes within 24 hours. Bytes are written as they come, by parts, and
 * ffmpeg reads the copy over https by ranges: the worker never holds the video (ADR-0013 update).
 * The dev and test provider gets a local copy instead.
 */
export const createGcsStaging = (deps: {
  googleAccessFor(accountId: string): Promise<GoogleAccess | null>
  providerOf(accountId: string): Promise<string | null>
  bucket: string | null
  fetch?: typeof fetch
  partBytes?: number
}): Staging => {
  const http = deps.fetch ?? fetch
  const part = deps.partBytes ?? PART_BYTES
  const ready = new Set<string>()
  const accesses = new Map<string, { access: GoogleAccess; until: number }>()
  let localDir: Promise<string> | null = null

  const ensure = async (access: GoogleAccess, bucket: string) => {
    if (ready.has(bucket)) return
    const auth = { authorization: `Bearer ${access.accessToken}` }
    const found = await http(`${API}/b/${encodeURIComponent(bucket)}`, { headers: auth })
    if (found.status === 404) {
      const created = await http(`${API}/b?project=${encodeURIComponent(access.project)}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: bucket,
          location: locationOf(access.region),
          iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
          lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 1 } }] },
        }),
      })
      if (!created.ok && created.status !== 409)
        throw new Error(`bucket not created: ${created.status}`)
    } else if (!found.ok) throw new Error(`bucket not readable: ${found.status}`)
    ready.add(bucket)
  }

  const accessOf = async (accountId: string) => {
    const kept = accesses.get(accountId)
    if (kept && kept.until > Date.now()) return kept.access
    const access = await deps.googleAccessFor(accountId).catch((error: unknown) => {
      throw providerError(error)
    })
    if (access) {
      accesses.set(accountId, { access, until: Date.now() + ACCESS_TTL_MS })
      return access
    }
    const provider = await deps.providerOf(accountId)
    if (provider === 'fake') return null
    // No provider serves the person any more (or not Vertex AI): theirs to set up, not a copy failure.
    throw new ProviderMissing()
  }

  /** The dev and test provider: a local copy, as the real one would be read. */
  const putLocal = async (name: string, mimeType: string, chunks: AsyncIterable<Uint8Array>) => {
    localDir ??= mkdtemp(join(tmpdir(), 'goodresearch-staging-'))
    const path = join(await localDir, name.replaceAll('/', '_'))
    await pipeline(Readable.from(chunks), createWriteStream(path))
    return { uri: `fake://${path}`, mimeType }
  }

  /**
   * Sends `bytes`, which start at `from`, as one or more requests of a resumable upload: Google
   * may keep only the start of a part (its `Range` answer), the rest is sent again. A network or
   * server error is tried once more. `total` on the last part only.
   */
  const sendPart = async (
    session: string,
    bytes: Uint8Array,
    from: number,
    total: number | null,
  ) => {
    let offset = 0
    let retried = false
    let stalled = 0
    for (;;) {
      const rest = bytes.subarray(offset)
      const start = from + offset
      const range = rest.byteLength
        ? `bytes ${start}-${start + rest.byteLength - 1}/${total ?? '*'}`
        : `bytes */${total ?? '*'}`
      const response = await http(session, {
        method: 'PUT',
        headers: { 'content-range': range, 'content-length': String(rest.byteLength) },
        body: rest,
      }).catch((error: unknown) => {
        if (retried) throw error
        return null
      })
      if (response && total !== null && response.ok) return
      if (response?.status === 308) {
        const kept = /bytes=0-(\d+)/.exec(response.headers.get('range') ?? '')
        const persisted = kept ? Number(kept[1]) + 1 : from
        if (total === null && persisted >= from + bytes.byteLength) return
        const next = Math.max(0, persisted - from)
        // Nothing kept twice in a row: the upload is not moving, stop rather than loop.
        stalled = next > offset ? 0 : stalled + 1
        if (stalled > 1) throw new Error('upload part not kept')
        offset = next
        continue
      }
      if ((response && response.status < 500) || retried)
        throw new Error(`upload part failed: ${response?.status ?? 'network'}`)
      retried = true
    }
  }

  return {
    put: async (accountId, name, mimeType, chunks, size): Promise<StagedFile> => {
      const access = await accessOf(accountId)
      if (!access) return putLocal(name, mimeType, chunks)
      const bucket = stagingBucketOf(access.project, deps.bucket)
      await ensure(access, bucket)
      const object = `usability/${name}`
      const started = await http(
        `${UPLOAD}/b/${encodeURIComponent(bucket)}/o?uploadType=resumable&name=${encodeURIComponent(object)}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${access.accessToken}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-type': mimeType,
            ...(size === null ? {} : { 'x-upload-content-length': String(size) }),
          },
          body: JSON.stringify({ name: object, contentType: mimeType }),
        },
      )
      const session = started.headers.get('location')
      if (!started.ok || !session) throw new Error(`upload not started: ${started.status}`)
      // One part in memory at a time: the bytes are sent as soon as a part is full.
      const buffer = new Uint8Array(part)
      let filled = 0
      let sent = 0
      for await (const piece of chunks) {
        let at = 0
        while (at < piece.byteLength) {
          const n = Math.min(part - filled, piece.byteLength - at)
          buffer.set(piece.subarray(at, at + n), filled)
          filled += n
          at += n
          if (filled === part) {
            await sendPart(session, buffer, sent, null)
            sent += part
            filled = 0
          }
        }
      }
      await sendPart(session, buffer.subarray(0, filled), sent, sent + filled)
      return { uri: `gs://${bucket}/${object}`, mimeType }
    },

    source: async (accountId, file) => {
      if (file.uri.startsWith('fake://'))
        return { input: file.uri.slice('fake://'.length), headers: {} }
      const access = await accessOf(accountId)
      if (!access) throw new ProviderMissing()
      const [, , bucket, ...rest] = file.uri.split('/')
      return {
        input: `${READ}/${encodeURIComponent(bucket ?? '')}/${rest.map(encodeURIComponent).join('/')}`,
        headers: { Authorization: `Bearer ${access.accessToken}` },
      }
    },

    remove: async (accountId, files) => {
      for (const f of files.filter((x) => x.uri.startsWith('fake://')))
        await rm(f.uri.slice('fake://'.length), { force: true })
      const real = files.filter((f) => f.uri.startsWith('gs://'))
      if (!real.length) return
      const access = await accessOf(accountId)
      if (!access) return
      for (const f of real) {
        const [, , bucket, ...rest] = f.uri.split('/')
        const response = await http(
          `${API}/b/${encodeURIComponent(bucket ?? '')}/o/${encodeURIComponent(rest.join('/'))}`,
          { method: 'DELETE', headers: { authorization: `Bearer ${access.accessToken}` } },
        )
        // Gone already is fine; anything else is left to the bucket's one-day rule, and logged.
        if (!response.ok && response.status !== 404)
          throw new Error(`delete failed: ${response.status}`)
      }
    },
  }
}
