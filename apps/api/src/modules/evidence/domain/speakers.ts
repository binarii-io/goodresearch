import { fold, words } from '@goodresearch/shared'
import type { Role } from './verbatims.ts'

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
