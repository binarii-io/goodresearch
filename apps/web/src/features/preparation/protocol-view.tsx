import type { TestProtocol, TestProtocolContent } from '@goodresearch/api-client'
import { useLingui } from '@lingui/react/macro'
import { INTERFACE_KINDS, SESSION_FORMATS, TASK_FLAGS } from './labels.ts'

type StandardTexts = TestProtocol['standard']

type Task = TestProtocolContent['tasks'][number]
/** A saved protocol (with task ids) or one the assistant proposes (without). */
export type ProtocolLike = Omit<TestProtocolContent, 'tasks' | 'retiredTaskIds'> & {
  tasks: (Omit<Task, 'id'> & { id?: string })[]
}

/** The test protocol, read only (spec 036 US3): framing, script, scenario, tasks, questions, debrief. */
export function ProtocolView({
  protocol,
  standard,
  flags,
  compact = false,
}: {
  protocol: ProtocolLike
  /** The fixed SUS and SEQ texts, when on. */
  standard?: StandardTexts | null
  /** What the writing rules say of each task, by id. */
  flags?: Record<string, string[]>
  compact?: boolean
}) {
  const { t, i18n } = useLingui()
  const f = protocol.framing
  const s = protocol.script
  const label = (text: string) => (
    <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{text}</dt>
  )
  const field = (title: string, value: string) =>
    value ? (
      <div key={title} className="grid gap-0.5">
        {label(title)}
        <dd className="whitespace-pre-wrap">{value}</dd>
      </div>
    ) : null
  const list = (title: string, values: readonly string[]) =>
    values.length ? (
      <div key={title} className="grid gap-0.5">
        {label(title)}
        <dd>
          <ul className="ml-5 list-disc">
            {values.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </dd>
      </div>
    ) : null
  const seq = standard?.seq

  return (
    <div className={compact ? 'grid gap-3 text-sm' : 'grid gap-5'}>
      <dl className="grid gap-3">
        <div className="grid gap-0.5">
          {label(t`Tested interface`)}
          <dd>
            <a
              href={f.interface.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline"
            >
              {f.interface.url}
            </a>{' '}
            <span className="text-muted-foreground text-sm">
              ({i18n._(INTERFACE_KINDS[f.interface.kind])})
            </span>
            {f.interface.description ? (
              <p className="whitespace-pre-wrap">{f.interface.description}</p>
            ) : null}
          </dd>
        </div>
        {field(t`Objective`, f.objective)}
        {list(t`Hypotheses`, f.hypotheses)}
        {field(t`Participants`, f.participants)}
        {field(
          t`Format`,
          `${i18n._(SESSION_FORMATS[f.format])} · ${t`${f.sessionMinutes} min per session`}`,
        )}
        {field(t`Consent`, f.consent)}
        {field(t`Introduction`, s.introduction)}
        {field(t`Think-aloud`, s.thinkAloud)}
        {list(t`Warm-up questions`, s.warmUp)}
        {field(t`Scenario`, protocol.scenario)}
      </dl>
      <ol className="grid gap-3" aria-label={t`Tasks`}>
        {protocol.tasks.map((task, i) => {
          const flagged = task.id ? (flags?.[task.id] ?? []) : []
          return (
            <li key={task.id ?? i} className="grid gap-1.5 rounded-md border p-3">
              <h4 className="font-semibold">{t`Task ${i + 1}`}</h4>
              <p className="whitespace-pre-wrap">{task.instruction}</p>
              <p className="text-sm">
                <span className="text-muted-foreground">{t`Success criterion:`}</span>{' '}
                {task.criterion}
              </p>
              {task.startUrl || task.minutes !== null ? (
                <p className="text-muted-foreground text-xs">
                  {[
                    task.startUrl ? t`Starts at ${task.startUrl}` : null,
                    task.minutes !== null ? t`about ${task.minutes} min` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              {seq ? (
                <p className="text-muted-foreground text-sm">
                  {t`Then:`} {seq.question} (1 {seq.scale.low} … {seq.scale.points} {seq.scale.high}
                  )
                </p>
              ) : null}
              {flagged.length ? (
                <p className="text-sm text-warning-foreground">
                  {t`To review: ${flagged
                    .map((code) => {
                      const flag = TASK_FLAGS[code]
                      return flag ? i18n._(flag) : code
                    })
                    .join(', ')}`}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
      {standard?.sus ? <SusGrid sus={standard.sus} /> : null}
      <dl className="grid gap-3">
        {list(t`Debrief questions`, s.debrief)}
        {field(t`Closing`, s.closing)}
      </dl>
    </div>
  )
}

/**
 * The System Usability Scale as the participant fills it (spec 036 FR-006): one statement per row,
 * five boxes, the end labels only, its standard instructions; the facilitator's note apart.
 */
function SusGrid({ sus }: { sus: NonNullable<StandardTexts['sus']> }) {
  const { t } = useLingui()
  const points = Array.from({ length: sus.scale.points }, (_, i) => i + 1)
  return (
    <section className="grid gap-2 rounded-md border p-3" aria-label={sus.title}>
      <h4 className="font-semibold">{sus.title}</h4>
      <p className="text-sm">
        <span className="text-muted-foreground">{t`For the facilitator only:`}</span>{' '}
        {sus.facilitatorNote}
      </p>
      <p className="whitespace-pre-wrap text-sm">{sus.instructions}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{sus.title}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="w-8 py-1 text-left font-medium">
                #
              </th>
              <th scope="col" className="py-1 text-left font-medium">
                {t`Statement`}
              </th>
              {points.map((n) => (
                <th key={n} scope="col" className="w-14 px-1 py-1 text-center font-medium">
                  <span className="block">{n}</span>
                  {n === 1 || n === sus.scale.points ? (
                    <span className="block font-normal text-muted-foreground text-xs">
                      {n === 1 ? sus.scale.low : sus.scale.high}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sus.items.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1.5 align-top text-muted-foreground tabular-nums">{i + 1}</td>
                <th scope="row" className="py-1.5 pr-2 text-left align-top font-normal">
                  {item}
                </th>
                {points.map((n) => (
                  <td key={n} className="py-1.5 text-center align-top" aria-hidden>
                    ☐
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
