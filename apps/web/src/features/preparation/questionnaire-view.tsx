import type { Proposal } from '@goodresearch/api-client'
import { useLingui } from '@lingui/react/macro'
import {
  ITEM_ANALYSIS,
  ITEM_FLAGS,
  ITEM_KINDS,
  ITEM_MEASURES,
  QUESTIONNAIRE_SECTION_KINDS,
  RECRUITMENTS,
} from './labels.ts'

type Draft = NonNullable<Proposal['preview']['questionnaire']>
type Item = Draft['sections'][number]['items'][number] & { id?: string }
type Section = Omit<Draft['sections'][number], 'items'> & {
  id?: string
  items: Item[]
}
/** A saved questionnaire (with ids) or one the assistant proposes (without). */
export type QuestionnaireLike = Omit<Draft, 'sections'> & { sections: Section[] }

export const itemCount = (q: QuestionnaireLike) =>
  q.sections.reduce((sum, s) => sum + s.items.length, 0)

/** The questionnaire, read only (US3): framing, then the items of each section in order. */
export function QuestionnaireView({
  questionnaire,
  flags,
  compact = false,
}: {
  questionnaire: QuestionnaireLike
  /** What the writing rules say of each item, by id. */
  flags?: Record<string, string[]>
  compact?: boolean
}) {
  const { t, i18n } = useLingui()
  const f = questionnaire.framing
  const target = f.targetResponses
  const framing: [string, string][] = [
    [t`Objective`, f.objective],
    [t`Target audience`, f.audience],
    [t`Recruitment`, i18n._(RECRUITMENTS[f.recruitment])],
    [t`Administration`, f.administration],
    [t`Target number of responses`, target === null ? '' : `${target}. ${f.targetReason}`],
    [t`Consent`, f.consent],
    [t`Thanks`, f.thanks],
  ]
  let n = 0
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
      <ol className="grid gap-4">
        {questionnaire.sections.map((s, i) => (
          <li key={s.id ?? i} className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold">
                {i + 1}. {s.title}
              </h4>
              <span className="text-muted-foreground text-xs">
                {i18n._(QUESTIONNAIRE_SECTION_KINDS[s.kind])}
              </span>
            </div>
            {s.items.length ? (
              <ol className="grid gap-3">
                {s.items.map((item, j) => {
                  n += 1
                  const flagged = item.id ? (flags?.[item.id] ?? []) : []
                  return (
                    <li key={item.id ?? j} className="grid grid-cols-[2rem_1fr] gap-x-1">
                      <span className="text-muted-foreground tabular-nums">{n}</span>
                      <div className="grid gap-1">
                        <p>{item.text}</p>
                        <p className="text-muted-foreground text-xs">
                          {[
                            i18n._(ITEM_KINDS[item.kind]),
                            i18n._(ITEM_MEASURES[item.measure]),
                            item.required ? t`required` : t`optional`,
                            item.subTheme,
                            item.contact ? t`contact item, never imported` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {item.kind === 'likert' ? (
                          <p className="text-muted-foreground text-sm">
                            {t`1 ${item.lowLabel} to ${item.points} ${item.highLabel}`}
                          </p>
                        ) : null}
                        {item.kind === 'single-choice' || item.kind === 'multiple-choice' ? (
                          <ul className="ml-4 list-[circle] text-muted-foreground text-sm">
                            {item.options.map((o, k) => (
                              <li key={k}>{o}</li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="text-muted-foreground text-xs">
                          {i18n._(ITEM_ANALYSIS[item.kind])}
                        </p>
                        {flagged.length ? (
                          <p className="text-sm text-warning-foreground">
                            {t`To review: ${flagged
                              .map((code) => {
                                const label = ITEM_FLAGS[code]
                                return label ? i18n._(label) : code
                              })
                              .join(', ')}`}
                          </p>
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
