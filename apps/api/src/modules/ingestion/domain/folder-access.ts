/** A previous check of a person's own access to a study's folder is reused for 5 minutes (FR-010a). */
const REUSE_MS = 5 * 60 * 1000

export type FolderAccessResult = 'granted' | 'denied'

export const folderAccessDecision = (input: {
  cached: { result: FolderAccessResult; checkedAt: Date } | null
  now: Date
}): { use: FolderAccessResult | 'check' } =>
  input.cached && input.now.getTime() - input.cached.checkedAt.getTime() < REUSE_MS
    ? { use: input.cached.result }
    : { use: 'check' }
