import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { StagedFile, Staging } from '../application/ports.ts'

const API = 'https://storage.googleapis.com/storage/v1'
const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1'

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
 * copy a crash left behind goes within 24 hours. The dev and test provider reads nothing: no copy.
 */
export const createGcsStaging = (deps: {
  googleAccessFor(accountId: string): Promise<GoogleAccess | null>
  providerOf(accountId: string): Promise<string | null>
  bucket: string | null
}): Staging => {
  const ready = new Set<string>()

  const ensure = async (access: GoogleAccess, bucket: string) => {
    if (ready.has(bucket)) return
    const auth = { authorization: `Bearer ${access.accessToken}` }
    const found = await fetch(`${API}/b/${encodeURIComponent(bucket)}`, { headers: auth })
    if (found.status === 404) {
      const created = await fetch(`${API}/b?project=${encodeURIComponent(access.project)}`, {
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
    const access = await deps.googleAccessFor(accountId)
    if (access) return access
    if ((await deps.providerOf(accountId)) === 'fake') return null
    throw new Error('no Google access for the staging bucket')
  }

  return {
    upload: async (accountId, localPath, name, mimeType): Promise<StagedFile> => {
      const access = await accessOf(accountId)
      if (!access) return { uri: `fake://${name}`, mimeType }
      const bucket = stagingBucketOf(access.project, deps.bucket)
      await ensure(access, bucket)
      const object = `usability/${name}`
      const size = (await stat(localPath)).size
      const response = await fetch(
        `${UPLOAD}/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(object)}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${access.accessToken}`,
            'content-type': mimeType,
            'content-length': String(size),
          },
          body: Readable.toWeb(createReadStream(localPath)) as ReadableStream,
          duplex: 'half',
        } as RequestInit,
      )
      if (!response.ok) throw new Error(`upload failed: ${response.status}`)
      return { uri: `gs://${bucket}/${object}`, mimeType }
    },

    remove: async (accountId, files) => {
      const real = files.filter((f) => f.uri.startsWith('gs://'))
      if (!real.length) return
      const access = await accessOf(accountId)
      if (!access) return
      for (const f of real) {
        const [, , bucket, ...rest] = f.uri.split('/')
        const response = await fetch(
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
