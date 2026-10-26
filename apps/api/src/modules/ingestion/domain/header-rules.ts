import { normaliseWord } from './file-words.ts'

/** The first lines of a transcript: where meeting tools write the date and the participants. */
const HEADER_LINES = 30

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
}
const MONTH = Object.keys(MONTHS).join('|')

const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null
  if (y < 1990 || y > 2100) return null
  return date.toISOString().slice(0, 10)
}

const n = (text: string | undefined) => Number(text ?? 0)
const month = (text: string | undefined) => MONTHS[text ?? ''] ?? 0

const PATTERNS: readonly { re: RegExp; read: (g: string[]) => string | null }[] = [
  { re: /\b(\d{4})[-/.](\d{2})[-/.](\d{2})\b/, read: ([, y, m, d]) => iso(n(y), n(m), n(d)) },
  // Day first (as written in French and most of Europe).
  { re: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/, read: ([, d, m, y]) => iso(n(y), n(m), n(d)) },
  {
    re: new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH})\\s+(\\d{4})\\b`),
    read: ([, d, m, y]) => iso(n(y), month(m), n(d)),
  },
  {
    re: new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`),
    read: ([, m, d, y]) => iso(n(y), month(m), n(d)),
  },
]

/** The first real date written in the text (`YYYY-MM-DD`), research R3. */
export const findDate = (text: string): string | null => {
  const plain = normaliseWord(text)
  let best: { at: number; value: string } | null = null
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'g')
    for (const m of plain.matchAll(re)) {
      const value = p.read(m as unknown as string[])
      if (value && (best === null || m.index < best.at)) best = { at: m.index, value }
      if (value) break
    }
  }
  return best?.value ?? null
}

/**
 * The person in a label written by a meeting tool: what comes before " -", "(", "|" or "[" (a
 * company, a place, a version). "Jean-Pierre" keeps its hyphen.
 */
export const personName = (label: string): string =>
  (label.split(/\s+[-–]|\s*[(|[]/)[0] ?? '').trim()

const headerOf = (text: string) => text.split(/\r?\n/).slice(0, HEADER_LINES)

/** "jean.dupont@example.org" → "Jean Dupont": an invited person known by their address only. */
const nameFromEmail = (address: string): string =>
  (address.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter((part) => /\p{L}/u.test(part))
    .map((part) => (part[0] ?? '').toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')

const splitPeople = (list: string): string[] =>
  list
    .split(/\s*(?:,|;|&|\s\band\b\s|\s\bet\b\s)\s*/i)
    .map((n) => (n.includes('@') ? nameFromEmail(n.trim()) : personName(n)))
    .filter((n) => n.length > 0 && n.length <= 120)

const LIST_WORDS = '(?:participants?|attendees|guests?|invited|invit[ée]\\(?e?\\)?s?|pr[ée]sents?)'
/** "Participants: A, B" on one line, or "Invited A, B," (person chips, no colon). */
const LIST_ON_LINE = new RegExp(`^\\s*${LIST_WORDS}\\s*(?::\\s*(.+)|\\s+(.+,.*))$`, 'i')
/** "Invited" alone, the names on the lines after, until a blank line. */
const LIST_HEADING = new RegExp(`^\\s*${LIST_WORDS}\\s*:?\\s*$`, 'i')

const CHIP = /\[\[person:([^\]]+)\]\]/g

/** The person chips of meeting notes (the documents adapter marks them): the invited people. */
export const chipNames = (text: string): string[] =>
  [...text.matchAll(CHIP)]
    .map((m) => (m[1] ?? '').trim())
    .map((n) => (n.includes('@') ? nameFromEmail(n) : personName(n)))
    .filter((n) => n.length > 0)

/** A participants or invited list written by a meeting tool (header or meeting notes). */
export const participantsOf = (text: string): string[] => {
  const lines = headerOf(text)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const on = LIST_ON_LINE.exec(line)
    const list = on?.[1] ?? on?.[2]
    if (list) return splitPeople(list)
    if (LIST_HEADING.test(line)) {
      const names: string[] = []
      for (const next of lines.slice(i + 1, i + 21)) {
        if (!next.trim()) break
        names.push(...splitPeople(next))
      }
      if (names.length) return names
    }
  }
  return []
}

const LABEL = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+)?([^\s:\d][^:\n]{0,59}?)\s*:\s+\S/
const VOICE = /^\s*<v\s+([^>]{1,60})>/
/** Teams, Otter: "Name   0:03" or "Name (00:01:15)" on its own line, the words below. */
const TIMED = /^\s*([^\s:\d(][^:\n(]{0,59}?)\s+[([]?(?:\d{1,2}:)?\d{1,2}:\d{2}[)\]]?\s*$/

/** The speaker of each turn ("Name: text", "<v Name>"), in order; lines without one are skipped. */
export const speakerTurns = (text: string): string[] => {
  const turns: string[] = []
  for (const line of text.split(/\r?\n/)) {
    // A name written as a person chip ends with a comma (see the documents adapter).
    const raw = (VOICE.exec(line) ?? TIMED.exec(line) ?? LABEL.exec(line))?.[1]
      ?.trim()
      .replace(/,+$/, '')
    const label = raw ? personName(raw) : ''
    if (!label) continue
    // A label names someone: a few words, no sentence.
    const words = label.split(/\s+/)
    if (words.length > 4 || /[.?!,;]/.test(label)) continue
    turns.push(label)
  }
  return turns
}

/** Speaker labels, most frequent first. */
export const speakersOf = (text: string): string[] => {
  const counts = new Map<string, number>()
  for (const label of speakerTurns(text)) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

export type Member = { readonly id: string; readonly name: string }
export type Person = { readonly name: string; readonly memberId: string | null }

const words = (name: string) =>
  normaliseWord(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)

/**
 * Spec 009: a first name (or part of a name) found in a transcript takes the full name of the one
 * invited person who has it; with none or several, it stays as found.
 */
export const completeNames = (names: readonly string[], invited: readonly string[]): string[] =>
  names.map((name) => {
    const mine = words(name)
    const hits = invited.filter((full) => {
      const theirs = new Set(words(full))
      return mine.length > 0 && mine.every((w) => theirs.has(w))
    })
    return hits.length === 1 && hits[0] ? hits[0] : name
  })

/**
 * Research R3: a name whose words all belong to exactly one team member's name is that member, an
 * interviewer (under the member's full name); the other names are the people interviewed.
 */
export const matchMembers = (
  names: readonly string[],
  members: readonly Member[],
): { interviewers: Person[]; others: string[] } => {
  const interviewers: Person[] = []
  const others: string[] = []
  for (const name of names) {
    const mine = words(name)
    const hits = members.filter((m) => {
      const theirs = new Set(words(m.name))
      return mine.length > 0 && mine.every((w) => theirs.has(w))
    })
    const [member] = hits
    if (hits.length === 1 && member) {
      if (!interviewers.some((p) => p.memberId === member.id))
        interviewers.push({ name: member.name, memberId: member.id })
    } else others.push(name)
  }
  return { interviewers, others }
}
