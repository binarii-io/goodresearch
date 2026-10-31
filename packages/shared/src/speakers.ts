import { fold, words } from './text.ts'

export type Role = 'interviewee' | 'interviewer' | 'unknown'

/** A person of the interview's roster (ingestion), with their study code (`P01`, `I01`). */
export type Person = {
  readonly name: string
  readonly role: 'interviewer' | 'interviewee'
  readonly code: string
}

/** A person's attribution of a label to the interviewers rather than to an interviewee. */
/**
 * A label that names a role, not a person ("Interviewee", "Speaker 2", "P01", "Intervieweur 1"):
 * kept in the text sent to the AI, and allowed in a statement (FR-007).
 */
const ROLE_WORDS =
  /^(interviewee|interviewer|interviewé|interviewée|intervieweur|intervieweuse|speaker|locuteur|locutrice|participant|participante|respondent|répondant|répondante|moderator|modérateur|modératrice|enquêté|enquêtée|enquêteur|enquêtrice|user|utilisateur|utilisatrice|guest|invité|invitée|host|hôte|unknown|inconnu|inconnue|person|personne)$/i

const INTERVIEWER_WORDS =
  /\b(interviewer|intervieweur|intervieweuse|moderator|modérateur|modératrice|enquêteur|enquêtrice|host|hôte)\b/i

export const isGenericLabel = (label: string): boolean => {
  const parts = label.trim().split(/\s+/)
  if (parts.length === 1 && /^[PI]\d+$/i.test(parts[0] ?? '')) return true
  return (
    parts.every((w) => /^\d+$/.test(w) || ROLE_WORDS.test(w)) &&
    parts.some((w) => ROLE_WORDS.test(w))
  )
}

export const INTERVIEWER = 'interviewer'

const keysOf = (text: string) => words(text).map((w) => fold(w.text))

/** What an interviewer's speaker label becomes under anonymisation (spec 011): "Interviewer 1". */
const interviewerLabels = (code: string) => {
  const n = Number(code.replace(/^\D+/, '')) || 1
  return [`Interviewer ${n}`, `Intervieweur ${n}`]
}

const matches = (label: string, person: Person) => {
  const wanted = keysOf(label)
  if (wanted.length === 0) return false
  const candidates = [
    person.name,
    person.code,
    ...(person.role === 'interviewer' ? interviewerLabels(person.code) : []),
  ]
  return candidates.some((c) => {
    const keys = keysOf(c)
    // The whole name or label, words of the name (a first name alone), or the full name with
    // words added around it (a meeting tool adds the office: "Ann Smith -OFFICE PARIS-").
    return (
      keys.join(' ') === wanted.join(' ') ||
      (c === person.name && wanted.every((w) => w.length >= 2 && keys.includes(w))) ||
      (c === person.name && keys.length >= 2 && keys.every((k) => wanted.includes(k)))
    )
  })
}

/**
 * Research R8: who speaks a turn. A label matching an interviewer is an interviewer's; one
 * matching an interviewee, theirs. A person's attribution wins. Otherwise, with one interviewee
 * the label is theirs; with more, it is unknown until a person attributes it.
 */
export const speakerRole = (
  label: string | null,
  people: readonly Person[],
  attributions: ReadonlyMap<string, string>,
): { role: Role; participant: string | null } => {
  const attributed = label ? attributions.get(label) : undefined
  if (attributed === INTERVIEWER) return { role: 'interviewer', participant: null }
  if (attributed) return { role: 'interviewee', participant: attributed }
  const found = label ? people.filter((p) => matches(label, p)) : []
  if (found.some((p) => p.role === 'interviewer') && !found.some((p) => p.role === 'interviewee'))
    return { role: 'interviewer', participant: null }
  const interviewees = found.filter((p) => p.role === 'interviewee')
  if (interviewees.length === 1 && interviewees[0])
    return { role: 'interviewee', participant: interviewees[0].code }
  const all = people.filter((p) => p.role === 'interviewee')
  // A label sharing a word of an interviewer's name ("Ann S.") is not given to the interviewee.
  const wanted = label ? keysOf(label) : []
  const nearInterviewer = people.some(
    (p) =>
      p.role === 'interviewer' && keysOf(p.name).some((k) => k.length >= 3 && wanted.includes(k)),
  )
  // A role written as the label: "Interviewer", "Intervieweuse 2", "Moderator" ask no attribution.
  if (label && found.length === 0 && isGenericLabel(label) && INTERVIEWER_WORDS.test(label))
    return { role: 'interviewer', participant: null }
  if (label && found.length === 0 && !nearInterviewer && all.length === 1 && all[0])
    return { role: 'interviewee', participant: all[0].code }
  return { role: 'unknown', participant: null }
}

/**
 * Spec 016 research R5: which interviewer speaks a turn already known as an interviewer's. A label
 * matching one is theirs; the only interviewer of the roster takes the others; with several, it is
 * unknown (a person's attribution only says "an interviewer").
 */
export const interviewerCode = (label: string | null, people: readonly Person[]): string | null => {
  const interviewers = people.filter((p) => p.role === 'interviewer')
  const found = label ? interviewers.filter((p) => matches(label, p)) : []
  const only = found.length === 1 ? found : interviewers.length === 1 ? interviewers : []
  return only[0]?.code ?? null
}

/**
 * Spec 016: who speaks, for the figures on how an interview was conducted. `speakerRole` looks at one
 * label at a time: with one interviewee it gives them any label it does not know, or leaves unknown
 * one close to an interviewer's name, so an interviewer spelt otherwise made a false 0%. Looking at
 * all the labels: the only one left goes to the only interviewer of the roster when no label is
 * theirs; a guess holds only when no one else speaks; the others wait for a person.
 */
export const conductRoles = (
  labels: readonly (string | null)[],
  people: readonly Person[],
  attributions: ReadonlyMap<string, string>,
): Map<string | null, ReturnType<typeof speakerRole>> => {
  const roles = new Map<string | null, ReturnType<typeof speakerRole>>()
  const guessed: { label: string; role: ReturnType<typeof speakerRole> }[] = []
  for (const label of new Set(labels)) {
    const role = speakerRole(label, people, attributions)
    const known = label === null || attributions.has(label) || people.some((p) => matches(label, p))
    if (role.role !== 'interviewer' && !known) guessed.push({ label: label ?? '', role })
    else roles.set(label, role)
  }
  const has = (wanted: Role) => [...roles.values()].some((r) => r.role === wanted)
  const interviewers = people.filter((p) => p.role === 'interviewer')
  for (const { label, role } of guessed) {
    if (guessed.length === 1 && !has('interviewee')) roles.set(label, role)
    else if (guessed.length === 1 && !has('interviewer') && interviewers.length === 1)
      roles.set(label, { role: 'interviewer', participant: null })
    else roles.set(label, { role: 'unknown', participant: null })
  }
  return roles
}
