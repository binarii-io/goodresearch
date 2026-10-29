import { personName } from '@goodresearch/shared'

/** One speaker turn of a transcript; its id stays the same across imports (research R3). */
export type Segment = {
  readonly id: string
  readonly speaker: string | null
  /** Seconds from the start, when the transcript writes it. */
  readonly start: number | null
  readonly text: string
}

export type ParsedSegment = Omit<Segment, 'id'>

const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})`
const LEADING_TIME = new RegExp(String.raw`^\s*\[?${TIME}\]?\s+`)
const ONLY_TIME = new RegExp(String.raw`^\s*\[?\(?${TIME}\)?\]?\s*$`)
const VOICE = /^\s*<v\s+([^>]{1,60})>\s*(.*?)(?:<\/v>)?\s*$/
/** Teams, Otter: "Name   0:03" or "Name (00:01:15)" on its own line, the words below. */
const TIMED = new RegExp(String.raw`^\s*([^\s:\d(\[][^:\n(\[]{0,59}?)\s+[(\[]?${TIME}[)\]]?\s*$`)
const LABEL = /^\s*([^\s:\d][^:\n]{0,59}?)\s*:\s+(\S.*)$/

const seconds = (m: RegExpExecArray, at: number): number =>
  Number(m[at] ?? 0) * 3600 + Number(m[at + 1]) * 60 + Number(m[at + 2])

/**
 * A label names someone: a few words, no sentence (spec 009 rules). What a meeting tool adds after
 * the name (" -OFFICE PARIS-", "(Acme)") is not counted; the label is kept whole.
 */
const isName = (label: string) => {
  const name = personName(label)
  return name.length > 0 && name.split(/\s+/).length <= 4 && !/[.?!,;]/.test(name)
}

const cleanName = (label: string) => label.trim().replace(/,+$/, '')

/**
 * The speaker turns of a plain-text transcript: `Name: text`, `<v Name>text`, `Name 0:03` with the
 * words below, an optional leading `[hh:mm:ss]`. Lines without a label continue the turn; text
 * before the first label has no speaker.
 */
export const parseSegments = (text: string): ParsedSegment[] => {
  const out: { speaker: string | null; start: number | null; lines: string[] }[] = []
  let pendingStart: number | null = null
  const open = (speaker: string | null, start: number | null, first: string) => {
    out.push({ speaker, start: start ?? pendingStart, lines: first ? [first] : [] })
    pendingStart = null
  }
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue
    const only = ONLY_TIME.exec(raw)
    if (only) {
      pendingStart = seconds(only, 1)
      continue
    }
    const voice = VOICE.exec(raw)
    if (voice?.[1] && isName(cleanName(voice[1]))) {
      open(cleanName(voice[1]), null, (voice[2] ?? '').trim())
      continue
    }
    const timed = TIMED.exec(raw)
    if (timed?.[1] && isName(cleanName(timed[1]))) {
      open(cleanName(timed[1]), seconds(timed, 2), '')
      continue
    }
    const lead = LEADING_TIME.exec(raw)
    const line = lead ? raw.slice(lead[0].length) : raw
    const label = LABEL.exec(line)
    if (label?.[1] && isName(cleanName(label[1]))) {
      open(cleanName(label[1]), lead ? seconds(lead, 1) : null, (label[2] ?? '').trim())
      continue
    }
    const last = out.at(-1)
    if (last) last.lines.push(line.trim())
    else open(null, lead ? seconds(lead, 1) : null, line.trim())
  }
  return out
    .map((s) => ({ speaker: s.speaker, start: s.start, text: s.lines.join('\n') }))
    .filter((s) => s.text.length > 0 || s.speaker !== null)
}

/**
 * Turns read by an older rule: a line after a turn's first one is itself a speaker label (a
 * meeting tool's label with its office, once refused as too long). Imported again to split them.
 */
export const hasUnsplitTurns = (segments: readonly ParsedSegment[]): boolean =>
  segments.some((s) => {
    const rest = s.text.split('\n').slice(1).join('\n')
    return rest !== '' && parseSegments(rest).some((p) => p.speaker !== null)
  })

const keyOf = (s: ParsedSegment) => `${s.speaker ?? ''}\u0000${s.text}`

/**
 * Research R3: a new import keeps the id of every turn whose speaker and text did not change
 * (longest common subsequence of the turns); the other turns get new ids.
 */
export const keepIds = (
  previous: readonly Segment[],
  next: readonly ParsedSegment[],
  newId: () => string,
): Segment[] => {
  // Unchanged beginning and end first: most re-imports change a few turns in the middle.
  let head = 0
  while (
    head < previous.length &&
    head < next.length &&
    keyOf(previous[head] as ParsedSegment) === keyOf(next[head] as ParsedSegment)
  )
    head++
  let tail = 0
  while (
    tail < previous.length - head &&
    tail < next.length - head &&
    keyOf(previous[previous.length - 1 - tail] as ParsedSegment) ===
      keyOf(next[next.length - 1 - tail] as ParsedSegment)
  )
    tail++
  const ids = new Array<string | null>(next.length).fill(null)
  for (let k = 0; k < head; k++) ids[k] = previous[k]?.id ?? null
  for (let k = 1; k <= tail; k++) ids[next.length - k] = previous[previous.length - k]?.id ?? null
  const middle = keepMiddle(
    previous.slice(head, previous.length - tail),
    next.slice(head, next.length - tail),
  )
  middle.forEach((id, k) => {
    ids[head + k] = id
  })
  return next.map((s, j) => ({ ...s, id: ids[j] ?? newId() }))
}

/** Above this many cells, the turns are matched in order by their text (linear memory). */
const TABLE_MAX = 4_000_000

/** The ids kept for the changed middle: longest common subsequence, or in order when too large. */
const keepMiddle = (
  previous: readonly Segment[],
  next: readonly ParsedSegment[],
): (string | null)[] => {
  const a = previous.map(keyOf)
  const b = next.map(keyOf)
  if ((a.length + 1) * (b.length + 1) > TABLE_MAX) {
    const free = new Map<string, string[]>()
    previous.forEach((p, i) => {
      const key = a[i] ?? ''
      const ids = free.get(key)
      if (ids) ids.push(p.id)
      else free.set(key, [p.id])
    })
    return b.map((key) => free.get(key)?.shift() ?? null)
  }
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0)
  const ids = new Array<string | null>(b.length).fill(null)
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      ids[j] = previous[i]?.id ?? null
      i++
      j++
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) i++
    else j++
  }
  return ids
}
