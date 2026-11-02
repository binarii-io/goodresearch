import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { ITEM_KINDS, QUESTIONNAIRE_SECTION_KINDS, RECRUITMENTS } from './labels.ts'
import type { QuestionnaireLike } from './questionnaire-view.tsx'

/** The questionnaire as Markdown (FR-013): headings in the interface language, its text as is. */
export const questionnaireToMarkdown = (i18n: I18n, name: string, q: QuestionnaireLike): string => {
  const f = q.framing
  const label = (m: MessageDescriptor) => i18n._(m)
  const lines = [`# ${name}`, '', `## ${label(msg`Framing`)}`, '']
  const field = (title: string, value: string) => {
    if (value) lines.push(`### ${title}`, '', value, '')
  }
  field(label(msg`Objective`), f.objective)
  if (f.hypotheses.length)
    lines.push(`### ${label(msg`Hypotheses`)}`, '', ...f.hypotheses.map((h) => `- ${h}`), '')
  field(label(msg`Target audience`), f.audience)
  field(label(msg`Recruitment`), i18n._(RECRUITMENTS[f.recruitment]))
  field(label(msg`Administration`), f.administration)
  if (f.targetResponses !== null)
    field(label(msg`Target number of responses`), `${f.targetResponses}. ${f.targetReason}`)
  field(label(msg`Consent`), f.consent)
  q.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title} (${i18n._(QUESTIONNAIRE_SECTION_KINDS[s.kind])})`, '')
    for (const item of s.items) {
      lines.push(`- ${item.text} (${i18n._(ITEM_KINDS[item.kind])})`)
      if (item.kind === 'likert')
        lines.push(`  - 1 ${item.lowLabel} … ${item.points} ${item.highLabel}`)
      if (item.kind === 'single-choice' || item.kind === 'multiple-choice')
        lines.push(...item.options.map((o) => `  - ${o}`))
    }
    lines.push('')
  })
  field(label(msg`Thanks`), f.thanks)
  return `${lines.join('\n').trimEnd()}\n`
}
