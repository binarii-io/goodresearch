import { err, fixedClock, newId, ok } from '@goodresearch/shared'
import { InMemoryDriveDocuments } from '../../../ingestion/index.ts'
import { makePublicationCommands } from '../../application/commands/publication-commands.ts'
import type {
  PublishingDeps,
  PublishingStore,
  StoredChange,
  StoredPublication,
  StudyFiles,
} from '../../application/ports.ts'
import { makePublicationQueries } from '../../application/queries/publication-queries.ts'
import type { GuideContent, GuideInput } from '../../domain/guide.ts'
import type { PlannedRow } from '../../domain/schedule.ts'

const inMemoryStore = (): PublishingStore & {
  rows: Map<string, StoredPublication>
  changeRows: Map<string, StoredChange>
} => {
  const rows = new Map<string, StoredPublication>()
  const changeRows = new Map<string, StoredChange>()
  return {
    rows,
    changeRows,
    listByStudy: async (studyId) => [...rows.values()].filter((p) => p.studyId === studyId),
    get: async (id) => rows.get(id) ?? null,
    insert: async (p) => {
      if ([...rows.values()].some((x) => x.studyId === p.studyId && x.kind === p.kind)) return false
      rows.set(p.id, p)
      return true
    },
    save: async (p) => {
      rows.set(p.id, p)
    },
    saveBase: async (p, expectedRev) => {
      const stored = rows.get(p.id)
      if (!stored || stored.baseRev !== expectedRev) return false
      rows.set(p.id, p)
      return true
    },
    saveCheck: async (p, pending) => {
      const stored = rows.get(p.id)
      if (!stored || stored.baseRev !== p.baseRev) return
      rows.set(p.id, { ...p, base: stored.base, baseRevision: stored.baseRevision })
      if (pending === null) return
      for (const [key, c] of changeRows)
        if (c.publicationId === p.id && c.decision === 'pending') changeRows.delete(key)
      for (const c of pending) changeRows.set(c.id, c)
    },
    touchChecked: async (id, at) => {
      const stored = rows.get(id)
      if (stored) rows.set(id, { ...stored, lastCheckedAt: at })
    },
    delete: async (id) => {
      rows.delete(id)
    },
    changes: async (id) => [...changeRows.values()].filter((c) => c.publicationId === id),
    replacePending: async (id, changes) => {
      for (const [key, c] of changeRows)
        if (c.publicationId === id && c.decision === 'pending') changeRows.delete(key)
      for (const c of changes) changeRows.set(c.id, c)
    },
    decide: async (publicationId, ids, decision, by, at) => {
      const out: StoredChange[] = []
      for (const id of ids) {
        const c = changeRows.get(id)
        if (c?.decision !== 'pending' || c.publicationId !== publicationId) continue
        const next = { ...c, decision, decidedBy: by, decidedAt: at }
        changeRows.set(id, next)
        out.push(next)
      }
      return out
    },
    undecide: async (ids) => {
      for (const id of ids) {
        const c = changeRows.get(id)
        if (c) changeRows.set(id, { ...c, decision: 'pending', decidedBy: null, decidedAt: null })
      }
    },
    clearChanges: async (id) => {
      for (const [key, c] of changeRows) if (c.publicationId === id) changeRows.delete(key)
    },
    changesOf: async (ids) => [...changeRows.values()].filter((c) => ids.includes(c.publicationId)),
    accountNames: async (ids) => new Map(ids.map((id) => [id, id])),
  }
}

/**
 * A study with a guide and two planned interviews; Ada and Ben can act on it; files live in an
 * in-memory Drive where people's edits are simulated.
 */
export const publishingWorld = () => {
  const drive = new InMemoryDriveDocuments((token) => token)
  const state = {
    guide: {
      version: 0,
      content: {
        framing: {
          objectives: 'Understand planning',
          hypotheses: ['Sunday'],
          audience: 'Eight people',
          format: '',
        },
        sections: [
          { id: 's1', kind: 'introduction', title: 'Introduction', minutes: 5, questions: [] },
          {
            id: 's2',
            kind: 'theme',
            title: 'Planning',
            minutes: 30,
            questions: [
              { id: 'q1', text: 'Tell me about last week.', followUps: ['And then?'] },
              { id: 'q2', text: 'How do you track changes?', followUps: [] },
            ],
          },
        ],
      } as GuideContent,
    } as { version: number; content: GuideContent } | null,
    rows: [
      {
        id: 'r1',
        interviewee: 'Sam',
        role: 'Planner',
        interviewers: 'Ada',
        scheduledAt: '2026-11-02T14:00:00.000Z',
        status: 'scheduled',
        notes: '',
        version: 0,
      },
      {
        id: 'r2',
        interviewee: 'Lee',
        role: '',
        interviewers: '',
        scheduledAt: null,
        status: 'to-contact',
        notes: '',
        version: 0,
      },
    ] as (PlannedRow & { version: number })[],
    canWrite: new Set(['ada', 'ben']),
    saved: [] as GuideInput[],
  }
  const store = inMemoryStore()
  const files = (account: string): StudyFiles => {
    const wrap = async <T>(work: () => Promise<T>) => {
      try {
        return ok(await work())
      } catch (error) {
        const name = (error as Error).name
        if (name === 'DriveCannotEdit') return err('DRIVE_CANNOT_EDIT' as const)
        if (name === 'DriveRevisionMismatch') return err('DRIVE_CHANGED_MEANWHILE' as const)
        throw error
      }
    }
    return {
      folderId: 'folder-1',
      createDocument: (name, doc) =>
        wrap(() => drive.createDocument(account, 'folder-1', name, doc)),
      readDocument: (id) => wrap(() => drive.readDocument(account, id)),
      rewriteDocument: (id, doc, revision) =>
        wrap(() => drive.rewriteDocument(account, id, doc, revision)),
      createTable: (name, table) => wrap(() => drive.createTable(account, 'folder-1', name, table)),
      readTable: (id) => wrap(() => drive.readTable(account, id)),
      rewriteTable: (id, table) => wrap(() => drive.rewriteTable(account, id, table)),
      metadata: (id) => wrap(() => drive.metadata(account, id)),
    }
  }
  const deps: PublishingDeps = {
    store,
    files: async (accountId, _studyId, access) => {
      if (accountId === 'eve') return err('STUDY_NOT_FOUND')
      if (access === 'write' && !state.canWrite.has(accountId)) return err('DRIVE_WRITE_REQUIRED')
      return ok(files(accountId))
    },
    reads: {
      studyName: async () => 'Study A',
      guide: async (accountId) => (accountId === 'eve' ? err('STUDY_NOT_FOUND') : ok(state.guide)),
      schedule: async (accountId) =>
        accountId === 'eve' ? err('STUDY_NOT_FOUND') : ok(state.rows),
    },
    actions: {
      saveGuide: async (c) => {
        if (!state.guide || c.version !== state.guide.version)
          return { ok: false, error: 'VERSION_CONFLICT' }
        state.saved.push(c.content)
        let n = 0
        state.guide = {
          version: state.guide.version + 1,
          content: {
            framing: c.content.framing,
            sections: c.content.sections.map((s) => ({
              ...s,
              id: s.id ?? `s-new-${++n}`,
              questions: s.questions.map((q) => ({ ...q, id: q.id ?? `q-new-${++n}` })),
            })),
          },
        }
        return { ok: true }
      },
      addPlanned: async (c) => {
        state.rows.push({ ...c.fields, id: `r-new-${state.rows.length + 1}`, version: 0 })
        return { ok: true }
      },
      updatePlanned: async (c) => {
        const at = state.rows.findIndex((r) => r.id === c.id)
        const row = state.rows[at]
        if (!row || row.version !== c.version) return { ok: false, error: 'VERSION_CONFLICT' }
        state.rows[at] = { ...row, ...c.fields, version: row.version + 1 }
        return { ok: true }
      },
      deletePlanned: async (c) => {
        state.rows = state.rows.filter((r) => r.id !== c.id)
        return { ok: true }
      },
    },
    clock: fixedClock(new Date('2026-10-25T10:00:00Z')),
    newId,
  }
  return {
    drive,
    state,
    store,
    commands: makePublicationCommands(deps),
    queries: makePublicationQueries(deps),
  }
}
