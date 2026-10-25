import { useLingui } from '@lingui/react/macro'
import { SECTION_KINDS, type SectionKind } from './labels.ts'

/** A saved guide (with ids) or one the assistant proposes (without). */
export type GuideLike = {
  framing: { objectives: string; hypotheses: string[]; audience: string; format: string }
  sections: {
    id?: string
    kind: SectionKind
    title: string
    minutes: number
    questions: { id?: string; text: string; followUps: string[] }[]
  }[]
}

export const totalMinutes = (guide: GuideLike) =>
  guide.sections.reduce((sum, s) => sum + s.minutes, 0)

export const questionCount = (guide: GuideLike) =>
  guide.sections.reduce((sum, s) => sum + s.questions.length, 0)

/**
 * The interview guide, read only (US2): framing, then the sections in order with their durations,
 * main questions numbered across the guide, and their follow-ups.
 */
export function GuideView({ guide, compact = false }: { guide: GuideLike; compact?: boolean }) {
  const { t, i18n } = useLingui()
  const f = guide.framing
  const framing: [string, string][] = [
    [t`Objectives`, f.objectives],
    [t`Audience`, f.audience],
    [t`Format`, f.format],
  ]
  let n = 0
  const total = totalMinutes(guide)
  return (
    <div className={compact ? 'grid gap-3 text-sm' : 'grid gap-5'}>
      <dl className="grid gap-3">
        {framing.map(([label, value]) =>
          value ? (
            <div key={label} className="grid gap-0.5">
              <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {label}
              </dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ) : null,
        )}
        {f.hypotheses.length ? (
          <div className="grid gap-0.5">
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t`Hypotheses`}
            </dt>
            <dd>
              <ul className="ml-5 list-disc">
                {f.hypotheses.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="text-muted-foreground text-sm">{t`Total duration: ${total} min`}</p>
      <ol className="grid gap-4">
        {guide.sections.map((s, i) => (
          <li key={s.id ?? i} className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold">
                {i + 1}. {s.title}
              </h4>
              <span className="text-muted-foreground text-xs">
                {i18n._(SECTION_KINDS[s.kind])} · {t`${s.minutes} min`}
              </span>
            </div>
            {s.questions.length ? (
              <ol className="grid gap-2">
                {s.questions.map((q, j) => {
                  n += 1
                  return (
                    <li key={q.id ?? j} className="grid grid-cols-[2rem_1fr] gap-x-1">
                      <span className="text-muted-foreground tabular-nums">{t`Q${n}`}</span>
                      <div className="grid gap-1">
                        <p>{q.text}</p>
                        {q.followUps.length ? (
                          <ul
                            aria-label={t`Follow-ups`}
                            className="ml-4 list-[circle] text-muted-foreground text-sm"
                          >
                            {q.followUps.map((u, k) => (
                              <li key={k}>{u}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
