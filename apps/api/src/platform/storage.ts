import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import type { AppConfig } from '@goodresearch/config'

export type Storage = {
  isReady(): Promise<boolean>
  ensureBucket(): Promise<void>
}

/** S3-compatible object storage; unused by features yet, wired for readiness and later modules. */
export const createStorage = (config: AppConfig['s3']): Storage => {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const head = () => client.send(new HeadBucketCommand({ Bucket: config.bucket }))
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
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }))
    },
  }
}
