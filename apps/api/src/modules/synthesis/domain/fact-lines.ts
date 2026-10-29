import { nameKey } from '@goodresearch/shared'
import { type Bilingual, type FactPolarity, OTHER, type ProjectTheme } from './insights.ts'

/** A fact to send (research R2): never a name, a verbatim, an interview title or a study name. */
export type LineFact = {
  readonly id: string
  readonly studyId: string
  readonly sessionId: string
  readonly statement: Bilingual
  readonly polarity: FactPolarity
  readonly theme: { readonly id: string; readonly title: string } | null
  readonly participants: readonly string[]
}

export type FactLine = { readonly ref: string; readonly theme: string; readonly text: string }

/** A guide theme section as a project theme: themes of several guides merge by title. */
export const themeOf = (theme: LineFact['theme']): ProjectTheme =>
  theme ? { key: nameKey(theme.title), title: theme.title } : OTHER

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Research R2: one line per fact, `fN | polarity | tN | code | statement`, in study, interview and
 * theme order. The code is the participant's pseudonym, prefixed by the study (`S2-P01`) when the
 * project has several; `themes` maps `tN` (and `other`) to the project themes.
 */
export const factLines = (
  facts: readonly LineFact[],
  studyOrder: readonly string[],
  language: 'en' | 'fr',
) => {
  const several = studyOrder.length > 1
  const studyIndex = new Map(studyOrder.map((id, i) => [id, i]))
  const key = (f: LineFact) => themeOf(f.theme).key
  const sorted = [...facts].sort(
    (a, b) =>
      (studyIndex.get(a.studyId) ?? 0) - (studyIndex.get(b.studyId) ?? 0) ||
      order(a.sessionId, b.sessionId) ||
      Number(key(a) === OTHER.key) - Number(key(b) === OTHER.key) ||
      order(key(a), key(b)) ||
      order(a.id, b.id),
  )
  const themes = new Map<string, ProjectTheme>()
  const themeRefs = new Map<string, string>()
  const refOfTheme = (t: ProjectTheme) => {
    if (t.key === OTHER.key) return OTHER.key
    let ref = themeRefs.get(t.key)
    if (!ref) {
      ref = `t${themeRefs.size + 1}`
      themeRefs.set(t.key, ref)
      themes.set(ref, t)
    }
    return ref
  }
  const refs = new Map<string, string>()
  const lines: FactLine[] = sorted.map((f, i) => {
    const ref = `f${i + 1}`
    refs.set(ref, f.id)
    const study = (studyIndex.get(f.studyId) ?? 0) + 1
    const codes = f.participants.length > 0 ? f.participants : ['?']
    const who = codes.map((c) => (several ? `S${study}-${c}` : c)).join(',')
    const theme = refOfTheme(themeOf(f.theme))
    return {
      ref,
      theme,
      text: `${ref} | ${f.polarity} | ${theme} | ${who} | ${f.statement[language]}`,
    }
  })
  themes.set(OTHER.key, OTHER)
  return { lines, refs, themes }
}

/** Research R3: all lines in one call while they fit; else whole themes packed, a large one cut. */
export const batches = (lines: readonly FactLine[], max: number): FactLine[][] => {
  const size = (list: readonly FactLine[]) => list.reduce((n, l) => n + l.text.length + 1, 0)
  if (size(lines) <= max) return [[...lines]]
  const groups = new Map<string, FactLine[]>()
  for (const l of lines) groups.set(l.theme, [...(groups.get(l.theme) ?? []), l])
  const out: FactLine[][] = []
  let current: FactLine[] = []
  const flush = () => {
    if (current.length > 0) out.push(current)
    current = []
  }
  for (const group of groups.values()) {
    if (size(group) > max) {
      flush()
      for (const l of group) {
        if (current.length > 0 && size([...current, l]) > max) flush()
        current.push(l)
      }
      flush()
    } else {
      if (size([...current, ...group]) > max) flush()
      current.push(...group)
    }
  }
  flush()
  return out
}
