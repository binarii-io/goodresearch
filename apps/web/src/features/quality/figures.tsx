import type { QualityFigures } from '@goodresearch/api-client'
import { CircleHelpIcon } from '@goodresearch/ui/components/icons'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { Tooltip, TooltipContent, TooltipTrigger } from '@goodresearch/ui/components/tooltip'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'

type Breakdown = QualityFigures['leading']['questions']

/** A remark without an opinion counts until someone disagrees; a disagreed one no longer does. */
const counted = (b: Breakdown) => b.agreed + b.noOpinion

/** FR-006: where an indicator comes from, and its reference value; it never changes a figure. */
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="grid size-5 cursor-help place-items-center rounded-full hover:bg-muted"
          />
        }
      >
        <CircleHelpIcon aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

const add = (a: Breakdown, b: Breakdown): Breakdown => ({
  agreed: a.agreed + b.agreed,
  noOpinion: a.noOpinion + b.noOpinion,
  disagreed: a.disagreed + b.disagreed,
})

/** FR-008: every total comes with what people said about it. */
function useBreakdown() {
  const { t } = useLingui()
  return (b: Breakdown) => {
    const counts = t`${b.agreed} agreed, ${b.noOpinion} no opinion`
    return b.disagreed > 0 ? t`${counts}; ${b.disagreed} disagreed, not counted` : counts
  }
}

/** FR-002, FR-006: what happened, in counts out of their total: no score, no verdict, no colour. */
export function Figures({
  figures,
  after,
}: {
  /** No figures yet: only the tile after them. */
  figures: QualityFigures | null
  /** A tile on the same line, after the figures. */
  after?: ReactNode
}) {
  const { t, i18n } = useLingui()
  const breakdown = useBreakdown()
  if (!figures)
    return <StatTiles aria-label={t`How the interviews were conducted`}>{after}</StatTiles>
  const { words, minutes, leading } = figures
  const total = words.interviewers + words.interviewees + words.unknown + words.otherInterviewers
  const percent = new Intl.NumberFormat(i18n.locale, { style: 'percent' })
  const share = (n: number) => (total > 0 ? percent.format(n / total) : '–')
  const round = (n: number) => Math.round(n)
  const fine = new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 1 })
  const rate = (n: number, of: number) => (of > 0 ? fine.format(n / of) : '–')
  const ratio = (n: number, of: number, b: Breakdown) => (
    <>
      <span className="block">{t`${n} of ${of}`}</span>
      <span className="block">{breakdown(b)}</span>
    </>
  )
  const allLeading = add(add(leading.questions, leading.reformulations), leading.opinions)
  const talkHint = t`How the interviewer's talk share is counted`
  const leadingHint = t`How leading sentences are counted`
  const sentenceHint = t`How sentences are counted`
  return (
    <div className="grid gap-3">
      <StatTiles aria-label={t`How the interviews were conducted`}>
        <StatTile
          label={t`Interviewer talk share`}
          hint={
            <Hint
              label={talkHint}
            >{t`The share of all the words of the interviews spoken by interviewers, computed by the app. Reference value: 30% at most.`}</Hint>
          }
          value={share(words.interviewers)}
          detail={
            minutes
              ? t`Interviewees ${share(words.interviewees)}. About ${round(minutes.interviewers)} min and ${round(minutes.interviewees)} min.`
              : t`Interviewees ${share(words.interviewees)}`
          }
        />
        <StatTile
          label={t`Leading questions`}
          value={rate(counted(leading.questions), figures.questions)}
          detail={ratio(counted(leading.questions), figures.questions, leading.questions)}
        />
        <StatTile
          label={t`Leading sentences`}
          hint={
            <Hint
              label={leadingHint}
            >{t`Leading questions, reformulations with opinion and opinions, out of all the interviewers' sentences. Reference value: 5% at most.`}</Hint>
          }
          value={rate(counted(allLeading), figures.sentences)}
          detail={ratio(counted(allLeading), figures.sentences, allLeading)}
        />
        <StatTile
          label={t`Reformulations with opinion`}
          value={rate(counted(leading.reformulations), figures.sentences)}
          detail={ratio(counted(leading.reformulations), figures.sentences, leading.reformulations)}
        />
        <StatTile
          label={t`Simple reformulations`}
          hint={
            <Hint
              label={sentenceHint}
            >{t`A simple reformulation rests only on what the interviewee said, to check understanding: good practice, never counted as leading. The app cuts sentences at their ends; a turn without punctuation is one sentence, and "OK." or "I see." is not counted.`}</Hint>
          }
          value={rate(figures.simpleReformulations, figures.sentences)}
          detail={
            <>
              <span className="block">{t`${figures.simpleReformulations} of ${figures.sentences}`}</span>
              <span className="block">{t`Not counted as leading`}</span>
            </>
          }
        />
        {after}
      </StatTiles>
      {words.unknown > 0 ? (
        <p className="text-muted-foreground text-sm">
          {words.unknown / total < 0.01
            ? t`Speaker not identified: less than 1% of the words.`
            : t`Speaker not identified: ${share(words.unknown)} of the words.`}{' '}
          {figures.turnsSkipped > 0
            ? t`${figures.turnsSkipped} turns were not reviewed; attribute their speakers in Analysis.`
            : null}
        </p>
      ) : null}
    </div>
  )
}
