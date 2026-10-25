import type { I18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type GuideLike, totalMinutes } from './guide-view.tsx'
import { SECTION_KINDS } from './labels.ts'

/** The guide as Markdown, headings in the interface language (US2). */
export const guideToMarkdown = (i18n: I18n, studyName: string, guide: GuideLike): string => {
  const f = guide.framing
  const lines: string[] = [`# ${i18n._(msg`Interview guide`)} · ${studyName}`, '']
  const block = (title: string, text: string) => {
    if (text.trim()) lines.push(`**${title}**`, '', text.trim(), '')
  }
  lines.push(`## ${i18n._(msg`Framing`)}`, '')
  block(i18n._(msg`Objectives`), f.objectives)
  if (f.hypotheses.length)
    lines.push(`**${i18n._(msg`Hypotheses`)}**`, '', ...f.hypotheses.map((h) => `- ${h}`), '')
  block(i18n._(msg`Audience`), f.audience)
  block(i18n._(msg`Format`), f.format)
  const total = totalMinutes(guide)
  lines.push(i18n._(msg`Total duration: ${total} min`), '')
  let n = 0
  guide.sections.forEach((s, i) => {
    lines.push(
      `## ${i + 1}. ${s.title} (${i18n._(msg`${s.minutes} min`)})`,
      '',
      `*${i18n._(SECTION_KINDS[s.kind])}*`,
      '',
    )
    for (const q of s.questions) {
      n += 1
      lines.push(`${n}. ${q.text}`)
      for (const f of q.followUps) lines.push(`   - ${f}`)
    }
    if (s.questions.length) lines.push('')
  })
  return `${lines.join('\n').trimEnd()}\n`
}
