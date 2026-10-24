const MAX = 60

/** A conversation title from its first message: first line, cut on a word (spec 005 US4). */
export const titleFrom = (text: string): string => {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  // Empty: the app shows its translated "New conversation".
  if (!line) return ''
  if (line.length <= MAX) return line
  const cut = line.slice(0, MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
