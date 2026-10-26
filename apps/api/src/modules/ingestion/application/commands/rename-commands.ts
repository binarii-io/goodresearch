import { err, ok, type Result } from '@goodresearch/shared'
import { expectedNames } from '../../domain/file-names.ts'
import type { Actor, IngestionDeps } from '../ports.ts'
import type { StudyFiles, StudyFilesError } from '../study-files.ts'

type Failure = StudyFilesError | 'SESSION_NOT_FOUND' | 'NAME_NOT_ACCEPTED'

type Open = (
  accountId: string,
  studyId: string,
  access: 'read' | 'write',
) => Promise<Result<StudyFiles, StudyFilesError>>

export type RenameOutcome = 'renamed' | 'cannot-edit' | 'not-found' | 'failed'

/**
 * Spec 009 US3: the transcript, recordings and attachments of an interview get its accepted name,
 * with each person's own Drive access. Only names change: nothing is moved, copied or deleted.
 */
export const makeRenameCommands = (deps: IngestionDeps, open: Open) => {
  const plan = async (actor: Actor, sessionId: string, access: 'read' | 'write') => {
    const s = await deps.store.getSession(sessionId)
    if (!s) return err('SESSION_NOT_FOUND' as const)
    const files = await open(actor.id, s.studyId, access)
    if (!files.ok)
      return files.error === 'STUDY_NOT_FOUND' ? err('SESSION_NOT_FOUND' as const) : files
    const expected = expectedNames(s, await deps.store.listFiles(s.studyId, {}))
    if (!expected) return err('NAME_NOT_ACCEPTED' as const)
    return ok({
      session: s,
      files: files.value,
      kinds: new Map(expected.map((f) => [f.fileId, f.kind])),
      targets: expected.map((f) => ({ fileId: f.fileId, current: f.name, next: f.next })),
    })
  }

  return {
    renamePlan: async (actor: Actor, sessionId: string) => {
      const built = await plan(actor, sessionId, 'read')
      if (!built.ok) return built
      const { files, kinds, targets } = built.value
      const connection = await deps.store.getConnection(actor.id)
      const rows = []
      for (const t of targets) {
        const meta = await files.metadata(t.fileId)
        rows.push({
          fileId: t.fileId,
          kind: kinds.get(t.fileId) ?? 'attachment',
          current: meta.ok && meta.value ? meta.value.name : t.current,
          next: t.next,
          canEdit: meta.ok && meta.value?.canEdit === true,
        })
      }
      return ok({ files: rows, writeAccess: connection?.access === 'write' })
    },

    renameFiles: async (
      actor: Actor,
      sessionId: string,
      fileIds: readonly string[],
    ): Promise<
      Result<
        { results: { fileId: string; outcome: RenameOutcome; name: string | null }[] },
        Failure
      >
    > => {
      const built = await plan(actor, sessionId, 'write')
      if (!built.ok) return built
      const { session, files, targets } = built.value
      const results: { fileId: string; outcome: RenameOutcome; name: string | null }[] = []
      /** The new date of each renamed file at the source (a rename changes it). */
      const touched = new Map<string, string | null>()
      for (const fileId of new Set(fileIds)) {
        const target = targets.find((t) => t.fileId === fileId)
        if (!target) {
          results.push({ fileId, outcome: 'not-found', name: null })
          continue
        }
        // US3.5: read again just before, so the result says what the file was called.
        const before = await files.metadata(fileId)
        if (!before.ok || before.value === null || before.value.trashed) {
          results.push({ fileId, outcome: 'not-found', name: null })
          continue
        }
        try {
          const renamed = await files.renameFile(fileId, target.next)
          if (renamed.ok && renamed.value) {
            await deps.store.renameFile(
              session.studyId,
              fileId,
              renamed.value.name,
              renamed.value.modifiedAt ?? null,
            )
            touched.set(fileId, renamed.value.modifiedAt ?? null)
            results.push({ fileId, outcome: 'renamed', name: renamed.value.name })
          } else
            results.push({
              fileId,
              outcome: renamed.ok ? 'not-found' : 'cannot-edit',
              name: before.value.name,
            })
        } catch (error) {
          deps.log.warn({ err: error, fileId }, 'rename failed')
          results.push({ fileId, outcome: 'failed', name: before.value.name })
        }
      }
      // What the app renamed is not a change of the files: the analysis keeps reading them as
      // read (no new, paid analysis is due), with their new names.
      const renamed = new Map(
        results.flatMap((r) => (r.outcome === 'renamed' && r.name ? [[r.fileId, r.name]] : [])),
      )
      for (let attempt = 0; renamed.size && attempt < 3; attempt++) {
        const current = await deps.store.getSession(session.id)
        if (!current?.analysis) break
        const analysis = {
          ...current.analysis,
          filesRead: current.analysis.filesRead.map((f) => ({
            ...f,
            name: renamed.get(f.fileId) ?? f.name,
            modifiedAt: touched.get(f.fileId) ?? f.modifiedAt,
          })),
        }
        if ((await deps.store.writeAnalysis(current.id, current.version, analysis)) === 'saved')
          break
      }
      return ok({ results })
    },
  }
}

export type RenameCommands = ReturnType<typeof makeRenameCommands>
