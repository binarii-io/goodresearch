import type { InventoryFile } from './inventory-walk.ts'
import { type FileToName, renameTargets } from './normalised-name.ts'
import type { Session } from './session.ts'

/** The name a person accepted (or typed) for the interview: its files are named after it. */
export const acceptedName = (s: Session): string | null => {
  const p = s.analysis?.proposals.find((x) => x.field === 'name')
  return p && (p.status === 'accepted' || p.status === 'edited') && p.field === 'name'
    ? p.value
    : null
}

/**
 * The name each file of the interview should have in Drive (research R8): transcript, recordings
 * and attachments, with their current name; null until a name is accepted.
 */
export const expectedNames = (
  s: Session,
  files: readonly InventoryFile[],
): (FileToName & { next: string })[] | null => {
  const base = acceptedName(s)
  if (!base) return null
  const byId = new Map(files.map((f) => [f.id, f]))
  const own: FileToName[] = [
    ...(s.transcriptFileId ? [{ id: s.transcriptFileId, kind: 'transcript' as const }] : []),
    ...s.media.map((m) => ({ id: m.fileId, kind: 'media' as const })),
    ...s.attachments.map((a) => ({
      id: a.fileId,
      kind: 'attachment' as const,
      label: a.label ?? null,
    })),
  ].flatMap((x) => {
    const f = byId.get(x.id)
    const label = 'label' in x ? x.label : null
    return f ? [{ fileId: x.id, name: f.name, kind: x.kind, mimeType: f.mimeType, label }] : []
  })
  // Names taken out of attachment names: the people of the interview, accepted or proposed.
  const people = [
    ...s.roster.map((r) => r.name),
    ...(s.analysis?.proposals ?? []).flatMap((p) =>
      p.field === 'interviewees' || p.field === 'interviewers' ? p.value.map((v) => v.name) : [],
    ),
  ]
  const targets = renameTargets(base, own, s.language, people)
  return own.map((f, i) => ({ ...f, next: targets[i]?.next ?? f.name }))
}

/**
 * Spec 009 FR-028: whether the files in Drive (as the last inventory saw them) carry the accepted
 * name — a file renamed in Drive afterwards breaks it; null until a name is accepted.
 */
export const fileNamesState = (
  s: Session,
  files: readonly InventoryFile[],
): { inSync: boolean; differing: number } | null => {
  const expected = expectedNames(s, files)
  if (!expected) return null
  const differing = expected.filter((f) => f.name !== f.next).length
  return { inSync: differing === 0, differing }
}
