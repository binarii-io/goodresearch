import type { TestProtocol } from '@goodresearch/api-client'
import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { INTERFACE_KINDS, SESSION_FORMATS } from './labels.ts'
import type { ProtocolLike } from './protocol-view.tsx'

type StandardTexts = TestProtocol['standard']

/** The test protocol as Markdown (FR-012): headings in the interface language, its text as is. */
export const protocolToMarkdown = (
  i18n: I18n,
  name: string,
  p: ProtocolLike,
  standard: StandardTexts | null,
): string => {
  const f = p.framing
  const s = p.script
  const label = (m: MessageDescriptor) => i18n._(m)
  const lines = [`# ${name}`, '', `## ${label(msg`Framing`)}`, '']
  const field = (title: string, value: string) => {
    if (value) lines.push(`### ${title}`, '', value, '')
  }
  const list = (title: string, values: readonly string[]) => {
    if (values.length) lines.push(`### ${title}`, '', ...values.map((v) => `- ${v}`), '')
  }
  field(
    label(msg`Tested interface`),
    [
      f.interface.url,
      `(${i18n._(INTERFACE_KINDS[f.interface.kind])})`,
      f.interface.description ?? '',
    ]
      .filter(Boolean)
      .join(' '),
  )
  field(label(msg`Objective`), f.objective)
  list(label(msg`Hypotheses`), f.hypotheses)
  field(label(msg`Participants`), f.participants)
  field(label(msg`Format`), `${i18n._(SESSION_FORMATS[f.format])}, ${f.sessionMinutes} min`)
  field(label(msg`Consent`), f.consent)
  lines.push(`## ${label(msg`Script`)}`, '')
  field(label(msg`Introduction`), s.introduction)
  field(label(msg`Think-aloud`), s.thinkAloud)
  list(label(msg`Warm-up questions`), s.warmUp)
  field(label(msg`Scenario`), p.scenario)
  lines.push(`## ${label(msg`Tasks`)}`, '')
  p.tasks.forEach((task, i) => {
    lines.push(`### ${i18n._(msg`Task ${i + 1}`)}`, '', `> ${task.instruction}`, '')
    lines.push(`- ${label(msg`Success criterion`)}: ${task.criterion}`)
    if (task.startUrl) lines.push(`- ${label(msg`Start link`)}: ${task.startUrl}`)
    if (task.minutes !== null) lines.push(`- ${label(msg`Expected duration`)}: ${task.minutes} min`)
    if (standard?.seq) {
      const q = standard.seq
      lines.push(`- ${q.question} (1 ${q.scale.low} … ${q.scale.points} ${q.scale.high})`)
    }
    lines.push('')
  })
  if (standard?.sus) {
    const sus = standard.sus
    const points = Array.from({ length: sus.scale.points }, (_, i) => i + 1)
    lines.push(
      `## ${sus.title}`,
      '',
      `_${label(msg`For the facilitator only:`)} ${sus.facilitatorNote}_`,
      '',
    )
    lines.push(sus.instructions, '')
    lines.push(
      `| # | ${label(msg`Statement`)} | ${points.map((n) => (n === 1 ? `1 ${sus.scale.low}` : n === sus.scale.points ? `${n} ${sus.scale.high}` : String(n))).join(' | ')} |`,
      `|---|---|${points.map(() => ':-:').join('|')}|`,
      ...sus.items.map(
        (item, i) => `| ${i + 1} | ${item} | ${points.map(() => '☐').join(' | ')} |`,
      ),
      '',
    )
  }
  list(label(msg`Debrief questions`), s.debrief)
  field(label(msg`Closing`), s.closing)
  return `${lines.join('\n').trimEnd()}\n`
}
