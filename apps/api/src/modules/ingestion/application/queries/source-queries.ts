import { err, ok, type Result } from '@goodresearch/shared'
import type { FileKind } from '../../domain/classify.ts'
import { isActiveRun } from '../../domain/inventory-run.ts'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { resolveStudyAccess } from '../access.ts'
import type { Actor, IngestionDeps } from '../ports.ts'

export type StudySourceView = {
  readonly access: 'full' | 'no-folder-access' | 'drive-not-connected' | 'drive-unavailable'
  readonly driveConfigured: boolean
  /** Shown without access so people know whom to ask (never file names). */
  readonly folderOwner: string | null
  readonly source: {
    readonly folderId: string
    readonly folderName: string
    readonly ownerName: string | null
    readonly webViewLink: string
    readonly attachedBy: { id: string; name: string | null }
    readonly attachedAt: string
    readonly inventory: {
      readonly status: 'never' | 'running' | 'done' | 'failed'
      readonly startedAt: string | null
      readonly finishedAt: string | null
      readonly runBy: { id: string; name: string | null } | null
      readonly progress: { folders: number; files: number } | null
      readonly failure: string | null
      readonly lastSuccessAt: string | null
      readonly outdated: boolean
      readonly totals: {
        byKind: Record<FileKind, number>
        byGroup: { group: string; count: number }[]
      }
    }
  } | null
}

const iso = (d: Date | null) => d?.toISOString() ?? null

export const makeSourceQueries = (deps: IngestionDeps) => ({
  studySource: async (actor: Actor, studyId: string): Promise<StudySourceView | null> => {
    const access = await resolveStudyAccess(deps, actor.id, studyId)
    if (access.kind === 'not-found') return null
    const driveConfigured = deps.drive !== null
    if (access.kind !== 'full') {
      return {
        access: access.kind,
        driveConfigured,
        folderOwner: access.source.ownerName,
        source: null,
      }
    }
    const source = access.source
    if (!source) return { access: 'full', driveConfigured, folderOwner: null, source: null }
    const inv = source.inventory
    const interrupted = inv.status === 'running' && !isActiveRun(inv, deps.clock.now())
    return {
      access: 'full',
      driveConfigured,
      folderOwner: source.ownerName,
      source: {
        folderId: source.folderId,
        folderName: source.folderName,
        ownerName: source.ownerName,
        webViewLink: source.webViewLink,
        attachedBy: {
          id: source.attachedBy,
          name: await deps.store.accountName(source.attachedBy),
        },
        attachedAt: source.attachedAt.toISOString(),
        inventory: {
          // A run that stopped answering (worker crash) is shown as interrupted, so it can be refreshed.
          status: interrupted ? 'failed' : inv.status,
          startedAt: iso(inv.startedAt),
          finishedAt: iso(inv.finishedAt),
          runBy: inv.runBy
            ? { id: inv.runBy, name: await deps.store.accountName(inv.runBy) }
            : null,
          progress: interrupted ? null : inv.progress,
          failure: interrupted ? 'INTERRUPTED' : inv.failure,
          lastSuccessAt: iso(inv.lastSuccessAt),
          outdated: (interrupted || inv.status === 'failed') && inv.lastSuccessAt !== null,
          totals: await deps.store.totals(studyId),
        },
      },
    }
  },

  listFiles: async (
    actor: Actor,
    studyId: string,
    filter: { kind?: FileKind | undefined; group?: string | undefined },
  ): Promise<Result<InventoryFile[], 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED'>> => {
    const access = await resolveStudyAccess(deps, actor.id, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (access.kind !== 'full') return err('FOLDER_ACCESS_REQUIRED')
    return ok(await deps.store.listFiles(studyId, filter))
  },

  mySources: async (actor: { id: string }) => {
    const connection = await deps.store.getConnection(actor.id)
    return [
      {
        connector: 'google-drive' as const,
        configured: deps.drive !== null,
        status: connection ? connection.status : ('none' as const),
        externalAccount: connection?.externalAccount ?? null,
        connectedAt: connection?.connectedAt.toISOString() ?? null,
      },
    ]
  },
})

export type SourceQueries = ReturnType<typeof makeSourceQueries>

/** For the research module: may this person act on the study (FR-010a)? */
export const makeStudyActionGate = (deps: IngestionDeps) => ({
  canAct: async (accountId: string, studyId: string): Promise<boolean> =>
    (await resolveStudyAccess(deps, accountId, studyId)).kind === 'full',
})
