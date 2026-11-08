import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { AppConfig } from '@goodresearch/config'
import { GoogleAuth } from 'google-auth-library'

/** Object storage: readiness, and small files modules keep (spec 038 screenshots). */
export type ObjectStorage = {
  isReady(): Promise<boolean>
  ensureBucket(): Promise<void>
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Null when no object has this key. */
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>
  /** Deletes every object whose key starts with `prefix`; returns how many. */
  deleteByPrefix(prefix: string): Promise<number>
}

const notFound = (error: unknown) =>
  error instanceof NoSuchKey ||
  (error as { name?: string })?.name === 'NoSuchKey' ||
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404

/** The storage the configuration names: S3-compatible with a key, or Google Cloud Storage. */
export const createStorage = (config: AppConfig['storage']): ObjectStorage =>
  config.provider === 'gcs' ? createGcsStorage({ bucket: config.bucket }) : createS3Storage(config)

const GCS_API = 'https://storage.googleapis.com/storage/v1'
const GCS_UPLOAD = 'https://storage.googleapis.com/upload/storage/v1'
const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'

/**
 * Google Cloud Storage over its JSON API, with the service's own Google identity (Application
 * Default Credentials: the runtime's service account on Google Cloud), so no key is kept. The
 * bucket is the deployer's: it is never created here.
 */
export const createGcsStorage = (options: {
  bucket: string
  fetch?: typeof fetch
  accessToken?: () => Promise<string>
}): ObjectStorage => {
  const http = options.fetch ?? fetch
  const auth = options.accessToken ? null : new GoogleAuth({ scopes: [GCS_SCOPE] })
  const token = async () => {
    if (options.accessToken) return options.accessToken()
    const value = await auth?.getAccessToken()
    if (!value) throw new Error('no Google access for the object storage')
    return value
  }
  const bucket = encodeURIComponent(options.bucket)
  const object = (key: string) => `${GCS_API}/b/${bucket}/o/${encodeURIComponent(key)}`
  const call = async (url: string, init: RequestInit = {}) =>
    http(url, {
      ...init,
      headers: { authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
    })
  return {
    // Listing one object needs only the object rights the identity has on the bucket.
    isReady: async () => {
      try {
        return (await call(`${GCS_API}/b/${bucket}/o?maxResults=1&fields=items(name)`)).ok
      } catch {
        return false
      }
    },
    ensureBucket: async () => undefined,
    put: async (key, bytes, contentType) => {
      const response = await call(
        `${GCS_UPLOAD}/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'content-type': contentType }, body: bytes },
      )
      if (!response.ok) throw new Error(`object not stored: ${response.status}`)
    },
    get: async (key) => {
      const response = await call(`${object(key)}?alt=media`)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`object not read: ${response.status}`)
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },
    deleteByPrefix: async (prefix) => {
      let deleted = 0
      let page: string | undefined
      do {
        const url = new URL(`${GCS_API}/b/${bucket}/o`)
        url.searchParams.set('prefix', prefix)
        url.searchParams.set('fields', 'items(name),nextPageToken')
        if (page) url.searchParams.set('pageToken', page)
        const response = await call(url.toString())
        if (!response.ok) throw new Error(`objects not listed: ${response.status}`)
        const body = (await response.json()) as {
          items?: { name: string }[]
          nextPageToken?: string
        }
        for (const item of body.items ?? []) {
          const gone = await call(object(item.name), { method: 'DELETE' })
          if (gone.ok || gone.status === 404) deleted++
          else throw new Error(`object not deleted: ${gone.status}`)
        }
        page = body.nextPageToken
      } while (page)
      return deleted
    },
  }
}

const createS3Storage = (
  config: Extract<AppConfig['storage'], { provider: 's3' }>,
): ObjectStorage => {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket
  const head = () => client.send(new HeadBucketCommand({ Bucket }))
  return {
    isReady: () =>
      head().then(
        () => true,
        () => false,
      ),
    ensureBucket: async () => {
      if (
        await head().then(
          () => true,
          () => false,
        )
      )
        return
      await client.send(new CreateBucketCommand({ Bucket }))
    },
    put: async (key, bytes, contentType) => {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }),
      )
    },
    get: async (key) => {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        if (!out.Body) return null
        return {
          bytes: await out.Body.transformToByteArray(),
          contentType: out.ContentType ?? 'application/octet-stream',
        }
      } catch (error) {
        if (notFound(error)) return null
        throw error
      }
    },
    deleteByPrefix: async (prefix) => {
      let deleted = 0
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        )
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (keys.length) {
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }))
          deleted += keys.length
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return deleted
    },
  }
}

/** In memory, for tests and a dev stack without object storage. */
export const createMemoryStorage = (): ObjectStorage & {
  readonly objects: Map<string, { bytes: Uint8Array; contentType: string }>
} => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  return {
    objects,
    isReady: async () => true,
    ensureBucket: async () => undefined,
    put: async (key, bytes, contentType) => {
      objects.set(key, { bytes: new Uint8Array(bytes), contentType })
    },
    get: async (key) => objects.get(key) ?? null,
    deleteByPrefix: async (prefix) => {
      let n = 0
      for (const key of [...objects.keys()])
        if (key.startsWith(prefix)) {
          objects.delete(key)
          n++
        }
      return n
    },
  }
}
