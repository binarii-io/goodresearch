/**
 * An inventory job expires after 30 minutes (platform/jobs.ts). A run still marked "running" after
 * 35 minutes is dead (worker crash, lost job): a new run may replace it.
 */
export const STALE_RUN_MS = 35 * 60 * 1000

export const isActiveRun = (
  inventory: { status: string; startedAt: Date | null },
  now: Date,
): boolean =>
  inventory.status === 'running' &&
  inventory.startedAt !== null &&
  now.getTime() - inventory.startedAt.getTime() < STALE_RUN_MS

/**
 * Identifies one run: writes of a run apply only while the study still points to the same folder
 * and the run is the current one, so an old run never writes over a replaced or detached folder.
 */
export type InventoryRun = {
  readonly studyId: string
  readonly folderId: string
  readonly runId: string
}
