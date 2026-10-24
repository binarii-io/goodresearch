import type { ReactNode } from 'react'

/** Inline Markdown: **bold**, *italic*, `code`, [text](https://…); everything else is text. */
const inline = (text: string, key: string): ReactNode[] => {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g
  let last = 0
  let i = 0
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}-${i++}`
    if (token.startsWith('**')) out.push(<strong key={k}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`'))
      out.push(
        <code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    else if (token.startsWith('['))
      out.push(
        <a
          key={k}
          className="underline"
          href={token.slice(token.indexOf('(') + 1, -1)}
          target="_blank"
          rel="noreferrer"
        >
          {token.slice(1, token.indexOf(']'))}
        </a>,
      )
    else out.push(<em key={k}>{token.slice(1, -1)}</em>)
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * Model text rendered safely (spec 005 FR-010): paragraphs, lists, code blocks and inline marks as
 * React elements; never HTML, links only to https addresses.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  // Any line break (CRLF, CR, Unicode separators) becomes a plain one first.
  const lines = text.replace(/\r\n?|\u2028|\u2029/g, '\n').split('\n')
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const key = `b${n++}`
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) code.push(lines[i++] ?? '')
      i++
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-md bg-muted p-3 text-[0.85em]">
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/
    const numbered = /^\s*\d+[.)]\s+(.*)$/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const items: string[] = []
      const rule = ordered ? numbered : bullet
      while (i < lines.length && rule.test(lines[i] ?? ''))
        items.push(rule.exec(lines[i++] ?? '')?.[1] ?? '')
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={key} className={ordered ? 'ml-5 list-decimal' : 'ml-5 list-disc'}>
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${key}-${j}`)}</li>
          ))}
        </Tag>,
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const paragraph: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !/^(```|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i] ?? '')
    )
      paragraph.push(lines[i++] ?? '')
    // Always move on, even for a line no rule takes (never loop on the same line).
    if (paragraph.length === 0) paragraph.push(lines[i++] ?? '')
    blocks.push(<p key={key}>{inline(paragraph.join(' '), key)}</p>)
  }
  return <div className="grid gap-2 break-words">{blocks}</div>
}
