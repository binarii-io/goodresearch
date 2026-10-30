import type { DeckSlide } from '@goodresearch/api-client'
import { Wordmark } from '@goodresearch/ui/components/brand'
import {
  SlideStat as Big,
  SlideLabel as Label,
  SlideFlag,
  SlidePill,
  SlideTable as Table,
  useSlideFit,
} from '@goodresearch/ui/components/slide'
import { cn } from '@goodresearch/ui/lib/utils'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { CONFIDENCES, INSIGHT_POLARITIES, RATINGS, REC_KINDS } from './labels.ts'

type Rating = 'high' | 'medium' | 'low'
const RATING_ORDER: readonly Rating[] = ['high', 'medium', 'low']

/** A date of the deck (`YYYY-MM-DD`), as the interface language writes it. */
const useDay = () => {
  const { i18n } = useLingui()
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

/** "To validate", always in words (FR-003, FR-012). */
function ToValidate() {
  const { t } = useLingui()
  return <SlideFlag>{t`To validate`}</SlideFlag>
}

function Level({ level }: { level: Rating }) {
  const { i18n } = useLingui()
  return <SlidePill strong={level === 'high'}>{i18n._(CONFIDENCES[level])}</SlidePill>
}

const paged = (title: string, page: number, pages: number) =>
  pages > 1 ? `${title} (${page}/${pages})` : title

/**
 * Spec 015: one 16:9 slide as the prototype draws it, in the brand's ink and highlighter; a cover
 * slide on ink. Confidence, polarity, kind and "to validate" are always written (FR-012).
 */
export function DeckSlideView({
  slide,
  number,
  total,
}: {
  slide: DeckSlide
  number: number
  total: number
}) {
  const { t, i18n } = useLingui()
  const day = useDay()
  const fit = useSlideFit(slide)
  const cover = slide.kind === 'title' || slide.kind === 'thanks'
  const period = (first: string | null, last: string | null) =>
    first && last ? (first === last ? day(first) : `${day(first)} – ${day(last)}`) : null
  const head = (eyebrow: string, title: string, extra?: ReactNode) => (
    <div className="mb-[2.4cqw] flex flex-none flex-col gap-[1.6cqw]">
      <p className="font-semibold text-[1.15cqw] text-muted-foreground uppercase tracking-[0.14em]">
        {eyebrow}
      </p>
      <div className="flex items-start gap-[2cqw]">
        <h3 className="max-w-[85%] font-bold text-[2.9cqw] leading-tight tracking-tight">
          {title}
        </h3>
        {extra}
      </div>
    </div>
  )

  const content = (): { head?: ReactNode; body: ReactNode; label: string } => {
    switch (slide.kind) {
      case 'title':
        return {
          label: slide.title,
          body: (
            <div className="flex h-full flex-col justify-end gap-[1.6cqw]">
              <p className="font-semibold text-[1.15cqw] uppercase tracking-[0.14em] opacity-70">
                {t`Research debrief`}
              </p>
              <h2 className="font-bold text-[6cqw] leading-[1.02] tracking-tight">{slide.title}</h2>
              <p className="text-[1.8cqw] opacity-70">
                {[
                  slide.interviews > 0
                    ? plural(slide.interviews, { one: '# interview', other: '# interviews' })
                    : null,
                  period(slide.first, slide.last),
                  slide.participants > 0
                    ? plural(slide.participants, { one: '# participant', other: '# participants' })
                    : null,
                  slide.team ? t`Team ${slide.team}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ),
        }
      case 'thanks':
        return {
          label: t`Thank you`,
          body: (
            <div className="flex h-full flex-col justify-end gap-[1.6cqw]">
              <p className="font-semibold text-[1.15cqw] uppercase tracking-[0.14em] opacity-70">
                {slide.title}
              </p>
              <h2 className="font-bold text-[6cqw] leading-[1.02] tracking-tight">{t`Thank you!`}</h2>
              <p className="text-[1.8cqw] opacity-70">{t`Any questions?`}</p>
            </div>
          ),
        }
      case 'takeaways':
        return {
          label: t`What to remember`,
          head: head(t`Key takeaways`, t`What to remember`),
          body: (
            <>
              {slide.text ? (
                <p className="max-w-[92%] whitespace-pre-line border-highlight border-l-[0.5cqw] pl-[2cqw] font-semibold text-[2.4cqw] leading-snug">
                  {slide.text}
                </p>
              ) : (
                <p className="rounded-[1.2cqw] bg-highlight-soft p-[2cqw] text-[1.6cqw]">{t`Key takeaways to write in the Recommendations tab.`}</p>
              )}
              {slide.draft ? (
                <p className="flex flex-wrap items-center gap-[0.8cqw] text-[1.35cqw] text-muted-foreground">
                  {t`AI draft of the key takeaways, not saved yet`}
                  <ToValidate />
                </p>
              ) : null}
              {slide.toValidate > 0 ? (
                <p className="text-[1.35cqw] text-muted-foreground">
                  {plural(slide.toValidate, {
                    one: 'Rests on # item to validate',
                    other: 'Rests on # items to validate',
                  })}
                </p>
              ) : null}
              {slide.recommendations.length > 0 ? (
                <div className="mt-auto">
                  <Label>{t`What we recommend`}</Label>
                  <ol className="flex list-decimal flex-col marker:[font-variant-numeric:normal] gap-[0.7cqw] pl-[1.4em] text-[1.75cqw]">
                    {slide.recommendations.map((r, n) => (
                      <li key={n}>
                        {r.action} {r.toValidate ? <ToValidate /> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ),
        }
      case 'context':
        return {
          label: t`The research question`,
          head: head(t`Context`, t`The research question`),
          body: (
            <>
              <p className="max-w-[92%] whitespace-pre-line text-[1.9cqw] leading-relaxed">
                {slide.goal || t`No research goal written (project page).`}
              </p>
              {slide.studies.length > 0 ? (
                <p className="mt-auto text-[1.35cqw] text-muted-foreground">
                  {slide.studies.map((s) => s.name).join(' · ')}
                </p>
              ) : null}
            </>
          ),
        }
      case 'method': {
        const types: Record<string, string> = {
          interviews: t`Interviews`,
          survey: t`Survey`,
          'usability-test': t`Usability test`,
        }
        // The same words as Google Slides (SC-003).
        const how: Record<string, string> = {
          interviews: t`Individual interviews, recorded and transcribed.`,
          survey: t`Survey answers.`,
          'usability-test': t`Usability test sessions.`,
        }
        const single = slide.studies.length === 1
        return {
          label: t`How we ran the research`,
          head: head(t`Method`, t`How we ran the research`),
          body: (
            <div
              className={cn(
                'grid flex-1 gap-[2.5cqw]',
                single ? 'grid-cols-1' : 'auto-cols-fr grid-flow-col',
              )}
            >
              {slide.studies.map((s, n) => (
                <div
                  key={n}
                  className={cn(
                    'grid content-center gap-[3cqw] rounded-[1.4cqw] bg-muted p-[2.8cqw]',
                    single ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]' : 'grid-cols-1',
                  )}
                >
                  <div className="flex flex-col gap-[2cqw]">
                    <div className="flex flex-col gap-[0.6cqw]">
                      <span className="self-start rounded-full bg-foreground px-[1cqw] py-[0.3cqw] font-semibold text-[1.05cqw] text-background uppercase tracking-wider">
                        {types[s.type] ?? s.type}
                      </span>
                      <p className="font-bold text-[2.1cqw] leading-tight">{s.name}</p>
                      {how[s.type] ? (
                        <p className="text-[1.35cqw] text-muted-foreground">{how[s.type]}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-[3.5cqw]">
                      <div className="flex flex-col">
                        <strong className="self-start font-bold text-[5cqw] leading-none tracking-tight shadow-[inset_0_-0.25em_0_var(--highlight)]">
                          {s.interviews}
                        </strong>
                        <span className="mt-[0.8cqw] text-[1.4cqw] text-muted-foreground">
                          {plural(s.interviews, {
                            one: 'interview retained',
                            other: 'interviews retained',
                          })}
                        </span>
                      </div>
                      {s.questions > 0 ? (
                        <div className="flex flex-col">
                          <strong className="font-bold text-[5cqw] leading-none tracking-tight">
                            {s.questions}
                          </strong>
                          <span className="mt-[0.8cqw] text-[1.4cqw] text-muted-foreground">
                            {plural(s.questions, {
                              one: 'guide question',
                              other: 'guide questions',
                            })}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-[1cqw]">
                    <Label>{t`Interview guide themes`}</Label>
                    {s.themes.length > 0 ? (
                      <ol
                        // Two columns read down, then across: 1-2-3, then 4-5-6.
                        className={cn(
                          'grid gap-x-[2.5cqw] gap-y-[1.1cqw]',
                          single && s.themes.length > 5 && 'grid-flow-col',
                        )}
                        style={
                          single && s.themes.length > 5
                            ? {
                                gridTemplateRows: `repeat(${Math.ceil(s.themes.length / 2)}, auto)`,
                              }
                            : undefined
                        }
                      >
                        {s.themes.map((title, k) => (
                          <li
                            key={title}
                            className="flex items-start gap-[1cqw] text-[1.55cqw] leading-snug"
                          >
                            <span
                              aria-hidden
                              className="flex size-[2.4cqw] flex-none items-center justify-center rounded-full bg-highlight font-bold text-[1.2cqw] text-[var(--ink)]"
                            >
                              {k + 1}
                            </span>
                            <span className="pt-[0.3cqw]">{title}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[1.45cqw] text-muted-foreground">{t`No interview guide for this study.`}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ),
        }
      }
      case 'numbers': {
        const when = period(slide.first, slide.last)
        return {
          label: t`The interviews in numbers`,
          head: head(t`Numbers`, t`The interviews in numbers`),
          body: (
            <div className="flex flex-1 flex-col justify-center gap-[3cqw]">
              <div className="flex flex-wrap gap-[6cqw]">
                <Big value={slide.interviews} label={t`interviews retained`} mark />
                <Big value={slide.participants} label={t`participants`} />
                <Big value={slide.studies} label={t`studies`} />
                <Big value={slide.themes} label={t`guide themes`} />
              </div>
              {when ? (
                <p className="text-[1.8cqw] text-muted-foreground">{t`Period: ${when}`}</p>
              ) : null}
              {slide.toValidate > 0 ? (
                <p className="flex flex-wrap items-center gap-[0.8cqw] text-[1.8cqw]">
                  {plural(slide.toValidate, {
                    one: 'Including # participant known only from facts still to validate',
                    other: 'Including # participants known only from facts still to validate',
                  })}
                  <ToValidate />
                </p>
              ) : null}
            </div>
          ),
        }
      }
      case 'insightsTable': {
        const groups = {
          works: [t`What works`, t`Strengths and existing levers`],
          blocks: [t`What holds back`, t`Obstacles and irritants`],
          findings: [t`Findings`, t`Findings and mixed topics`],
        } as const
        const [eyebrow, title] = groups[slide.group]
        return {
          label: title,
          head: head(eyebrow, paged(title, slide.page, slide.pages)),
          body: (
            <Table
              head={['#', t`Insight`, t`Theme`, t`Confidence`, t`Participants`]}
              rows={slide.rows.map((r) => [
                <span key="n" className="text-muted-foreground">
                  {r.number}
                </span>,
                <span key="s">
                  {r.statement} {r.toValidate ? <ToValidate /> : null}
                </span>,
                <span key="t" className="text-muted-foreground">
                  {r.theme ?? t`Other`}
                </span>,
                <Level key="l" level={r.level} />,
                `${r.support}/${r.panel}`,
              ])}
            />
          ),
        }
      }
      case 'insight':
        return {
          label: slide.statement,
          head: head(
            [
              t`Insight ${slide.number}`,
              i18n._(INSIGHT_POLARITIES[slide.polarity]),
              slide.theme ?? t`Other`,
            ].join(' · '),
            slide.statement,
            <span className="mt-[0.6cqw] flex flex-none flex-col items-end gap-[0.6cqw]">
              <Level level={slide.level} />
              {slide.toValidate ? <ToValidate /> : null}
            </span>,
          ),
          body: (
            <div className="grid flex-1 grid-cols-2 gap-[3cqw]">
              <div className="text-[1.5cqw]">
                <Label>{t`Evidence`}</Label>
                <p className="mb-[1cqw]">
                  {t`${slide.support} of ${slide.panel} participants`} ·{' '}
                  {plural(slide.facts, { one: '# fact', other: '# facts' })}
                </p>
                {slide.description ? (
                  <p className="mb-[1cqw] text-[1.3cqw] text-muted-foreground">
                    {slide.description}
                  </p>
                ) : null}
                <Label>{t`But`}</Label>
                <p className="text-[1.3cqw] text-muted-foreground">
                  {[
                    slide.counterEvidence,
                    slide.minorityView ? t`Minority view: ${slide.minorityView}` : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || t`No counter-evidence found.`}
                </p>
              </div>
              {slide.quote ? (
                <blockquote className="relative self-start rounded-[1.4cqw] bg-muted p-[2.4cqw] before:absolute before:top-[2.4cqw] before:bottom-[2.4cqw] before:left-0 before:w-[0.45cqw] before:rounded-r-full before:bg-highlight">
                  <p className="mb-[1.2cqw] text-[1.9cqw] italic leading-snug">
                    {`«\u202f${slide.quote.text}\u202f»`}
                  </p>
                  <cite className="text-[1.15cqw] text-muted-foreground not-italic">
                    {slide.quote.participant}
                  </cite>
                </blockquote>
              ) : (
                <div />
              )}
            </div>
          ),
        }
      case 'nuances':
        return {
          label: t`What we also heard`,
          head: head(t`What qualifies it`, paged(t`What we also heard`, slide.page, slide.pages)),
          body: (
            <ul className="flex list-disc flex-col marker:[font-variant-numeric:normal] gap-[1.2cqw] pl-[1.4em] text-[1.75cqw]">
              {slide.items.map((i, n) => (
                <li key={n}>
                  <strong>{i.statement}</strong> {i.toValidate ? <ToValidate /> : null}
                  {[i.minorityView, i.counterEvidence].filter(Boolean).map((x) => (
                    <span key={x} className="block text-[1.35cqw] text-muted-foreground">
                      {x}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ),
        }
      case 'recommendations':
        return {
          label: t`What we recommend`,
          head: head(t`Recommendations`, paged(t`What we recommend`, slide.page, slide.pages)),
          body: (
            <Table
              head={['#', t`Action`, t`Kind`, t`Impact`, t`Effort`, t`Evidence`]}
              rows={slide.rows.map((r) => [
                <span key="n" className="text-muted-foreground">
                  {r.number}
                </span>,
                <span key="a">
                  {r.action} {r.toValidate ? <ToValidate /> : null}
                </span>,
                <span
                  key="k"
                  className={cn(
                    'whitespace-nowrap rounded-full px-[0.8cqw] py-[0.2cqw] font-semibold text-[1cqw]',
                    r.kind === 'build'
                      ? 'bg-primary text-primary-foreground'
                      : r.kind === 'test'
                        ? 'bg-highlight-soft text-highlight-soft-foreground'
                        : 'bg-muted',
                  )}
                >
                  {i18n._(REC_KINDS[r.kind])}
                </span>,
                i18n._(RATINGS[r.impact]),
                i18n._(RATINGS[r.effort]),
                r.evidence ? <Level key="e" level={r.evidence} /> : '—',
              ])}
            />
          ),
        }
      case 'matrix': {
        const quadrants: Record<string, string> = {
          'high-low': t`Quick wins`,
          'high-high': t`Major projects`,
          'low-low': t`Small extras`,
          'low-high': t`To reconsider`,
        }
        const efforts = [...RATING_ORDER].reverse()
        const short = (text: string) =>
          text.length > 46 ? `${text.slice(0, 44).trimEnd()}…` : text
        return {
          label: t`Impact × effort`,
          head: head(t`Prioritisation`, t`Impact × effort`),
          body: (
            <div className="flex flex-1 gap-[2cqw]">
              <div className="grid flex-1 grid-cols-[auto_repeat(3,1fr)] grid-rows-[repeat(3,1fr)_auto] gap-[0.6cqw]">
                {RATING_ORDER.map((impact, row) => [
                  <span
                    key={`y-${impact}`}
                    className="self-center pr-[0.8cqw] text-right text-[1.1cqw] text-muted-foreground"
                    style={{ gridRow: row + 1, gridColumn: 1 }}
                  >
                    {i18n._(RATINGS[impact])}
                  </span>,
                  ...efforts.map((effort, col) => {
                    const items = slide.items.filter(
                      (i) => i.impact === impact && i.effort === effort,
                    )
                    const quadrant = quadrants[`${impact}-${effort}`]
                    return (
                      <div
                        key={`${impact}-${effort}`}
                        className={cn(
                          'flex flex-col gap-[0.5cqw] overflow-hidden rounded-[1cqw] bg-muted p-[0.8cqw]',
                          impact === 'high' && effort === 'low' && 'bg-highlight-soft',
                        )}
                        style={{ gridRow: row + 1, gridColumn: col + 2 }}
                      >
                        {quadrant ? (
                          <span className="font-bold text-[0.95cqw] text-muted-foreground uppercase tracking-wider">
                            {quadrant}
                          </span>
                        ) : null}
                        {items.slice(0, 3).map((i) => (
                          <span
                            key={i.number}
                            title={i.action}
                            className="flex items-baseline gap-[0.5cqw] text-[1.05cqw] leading-tight"
                          >
                            <strong
                              className={cn(
                                'rounded-full px-[0.5cqw]',
                                i.kind === 'build'
                                  ? 'bg-primary text-primary-foreground'
                                  : i.kind === 'test'
                                    ? 'bg-highlight text-foreground'
                                    : 'bg-card',
                              )}
                            >
                              {i.number}
                            </strong>
                            <span>
                              {short(i.action)}
                              {i.toValidate ? ` (${t`to validate`})` : ''}
                            </span>
                          </span>
                        ))}
                        {items.length > 3 ? (
                          <span className="text-[1cqw] text-muted-foreground">
                            {t`+ ${items.length - 3} more: ${items
                              .slice(3)
                              .map((i) => i.number)
                              .join(', ')}`}
                          </span>
                        ) : null}
                      </div>
                    )
                  }),
                ])}
                {efforts.map((effort, col) => (
                  <span
                    key={`x-${effort}`}
                    className="text-center text-[1.1cqw] text-muted-foreground"
                    style={{ gridRow: 4, gridColumn: col + 2 }}
                  >
                    {i18n._(RATINGS[effort])}
                  </span>
                ))}
              </div>
              <div className="flex w-[18%] flex-col justify-center gap-[0.8cqw] text-[1.1cqw]">
                <Label>{t`Impact (rows) × effort (columns)`}</Label>
                {(['build', 'test', 'investigate'] as const).map((kind) => (
                  <span key={kind} className="flex items-center gap-[0.6cqw]">
                    <i
                      className={cn(
                        'inline-block size-[1.1cqw] rounded-full',
                        kind === 'build'
                          ? 'bg-primary'
                          : kind === 'test'
                            ? 'bg-highlight'
                            : 'border bg-card',
                      )}
                    />
                    {i18n._(REC_KINDS[kind])}
                  </span>
                ))}
                <span className="text-muted-foreground">{t`Numbers: the recommendations table.`}</span>
              </div>
            </div>
          ),
        }
      }
      case 'nextSteps':
        return {
          label: t`Who does what`,
          head: head(t`Next steps`, paged(t`Who does what`, slide.page, slide.pages)),
          body: (
            <Table
              head={[t`Action`, t`Owner`, t`Success measure`]}
              rows={slide.rows.map((r) => [
                <span key="a">
                  {r.action} {r.toValidate ? <ToValidate /> : null}
                </span>,
                r.owner ?? (
                  <span
                    key="o"
                    className="rounded-full bg-highlight-soft px-[0.7cqw] py-[0.2cqw] text-[1.05cqw]"
                  >
                    {t`to assign`}
                  </span>
                ),
                <span key="m" className="text-muted-foreground">
                  {r.measure ?? '—'}
                </span>,
              ])}
            />
          ),
        }
    }
  }

  const { head: top, body: main, label } = content()
  return (
    <article
      aria-label={label}
      className={cn(
        'relative flex aspect-video w-full flex-col overflow-hidden rounded-[1.4cqw] border px-[6%] pt-[5.5%] pb-[8.5%] [container-type:inline-size]',
        cover ? 'border-foreground bg-foreground text-background' : 'bg-card text-card-foreground',
      )}
    >
      {cover ? (
        <span
          aria-hidden
          className="absolute top-[14%] right-[8%] size-[9cqw] rounded-full bg-highlight"
        />
      ) : null}
      {top}
      <div ref={fit.frame} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={fit.inner}
          className="absolute top-0 left-0 flex origin-top-left flex-col gap-[2.2cqw] overflow-hidden"
        >
          {main}
        </div>
      </div>
      {number > 1 ? (
        <span
          className={cn(
            'absolute bottom-[4.5%] left-[6%] text-[1.05cqw] tabular-nums',
            cover ? 'opacity-70' : 'text-muted-foreground',
          )}
        >
          {number} / {total}
        </span>
      ) : null}
      <span aria-hidden className="absolute right-[4%] bottom-[4.5%]">
        <Wordmark label="" className={cn('h-[1.6cqw] w-auto', cover && 'text-background')} />
      </span>
    </article>
  )
}
