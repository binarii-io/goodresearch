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

/** S3-compatible object storage: readiness, and small files modules keep (spec 038 screenshots). */
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

export const createStorage = (config: AppConfig['s3']): ObjectStorage => {
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
