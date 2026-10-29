import { type RecommendationCard, useEditRecommendation } from '@goodresearch/api-client'
import { useLingui } from '@lingui/react/macro'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { useBilingual } from './insight-card.tsx'
import { RATINGS, REC_KINDS } from './labels.ts'
import { useRefreshRecommendations } from './recommendation-panel.tsx'

type Rating = 'high' | 'medium' | 'low'
/** Rows from the highest impact; columns from the lowest effort (quick wins top left). */
const IMPACTS: readonly Rating[] = ['high', 'medium', 'low']
const EFFORTS: readonly Rating[] = ['low', 'medium', 'high']
const MIME = 'application/x-goodresearch-recommendation'

/**
 * Spec 014 FR-016: the prioritisation matrix, impact × effort. A recommendation dragged to another
 * cell, or moved with the arrow keys, takes that impact and effort (saved with the version seen);
 * selecting one opens it in the right pane.
 */
export function RecommendationMatrix({
  projectId,
  recommendations,
  selected,
  onSelect,
  onPreview,
}: {
  projectId: string
  recommendations: readonly RecommendationCard[]
  selected: string | null
  onSelect: (id: string) => void
  onPreview: (id: string) => void
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const hintId = useId()
  const refresh = useRefreshRecommendations(projectId)
  const edit = useEditRecommendation()
  const [over, setOver] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  // A recommendation moved from the keyboard keeps the focus in its new cell.
  const [focus, setFocus] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focus) return
    const button = grid.current?.querySelector<HTMLButtonElement>(
      `[data-recommendation="${focus}"]`,
    )
    button?.focus()
  }, [focus, recommendations])
  const shown = recommendations.filter((r) => r.status !== 'rejected')

  const move = (r: RecommendationCard, impact: Rating, effort: Rating) => {
    if (r.impact === impact && r.effort === effort) return
    const where = t`Impact ${i18n._(RATINGS[impact])}, effort ${i18n._(RATINGS[effort])}`
    void edit
      .mutateAsync({
        projectId,
        recommendationId: r.id,
        data: { version: r.version, impact, effort },
      })
      .then(() => refresh(r.id))
      .then(() => setSaid(t`Moved: ${where}`))
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  }

  /** Up and down change the impact, left and right the effort. */
  const onKey = (r: RecommendationCard, e: KeyboardEvent) => {
    const row = IMPACTS.indexOf(r.impact)
    const col = EFFORTS.indexOf(r.effort)
    const to = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
    }[e.key]
    if (!to) return
    e.preventDefault()
    const impact = IMPACTS[to[0] ?? -1]
    const effort = EFFORTS[to[1] ?? -1]
    if (impact && effort) {
      move(r, impact, effort)
      setFocus(r.id)
    }
  }

  return (
    <section aria-label={t`Prioritisation matrix`} className="grid gap-2">
      <p id={hintId} className="text-muted-foreground text-xs">
        {t`Drag a recommendation to another cell, or select it and use the arrow keys: up and down change its impact, left and right its effort.`}
      </p>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      <div ref={grid} className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1.5">
        <span />
        {EFFORTS.map((effort) => (
          <span key={effort} className="text-center font-medium text-muted-foreground text-xs">
            {t`Effort ${i18n._(RATINGS[effort])}`}
          </span>
        ))}
        {IMPACTS.map((impact) => (
          <div key={impact} className="contents">
            <span className="self-center text-right font-medium text-muted-foreground text-xs [writing-mode:vertical-rl] rotate-180">
              {t`Impact ${i18n._(RATINGS[impact])}`}
            </span>
            {EFFORTS.map((effort) => {
              const cell = `${impact}|${effort}`
              const quickWin = impact === 'high' && effort === 'low'
              const here = shown.filter((r) => r.impact === impact && r.effort === effort)
              return (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: a drop target for the mouse; the keyboard moves a recommendation with the arrow keys instead.
                <ul
                  key={cell}
                  aria-label={t`Impact ${i18n._(RATINGS[impact])}, effort ${i18n._(RATINGS[effort])}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(cell)
                  }}
                  onDragLeave={() => setOver((o) => (o === cell ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault()
                    setOver(null)
                    const r = shown.find((x) => x.id === e.dataTransfer.getData(MIME))
                    if (r) move(r, impact, effort)
                  }}
                  className={`grid min-h-28 content-start gap-1.5 rounded-md border p-2 ${quickWin ? 'bg-highlight-soft' : 'bg-muted/40'} ${over === cell ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  {quickWin ? (
                    <li className="font-medium text-muted-foreground text-xs">{t`Quick wins`}</li>
                  ) : null}
                  {here.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        draggable
                        data-recommendation={r.id}
                        aria-pressed={r.id === selected}
                        aria-describedby={hintId}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(MIME, r.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => onSelect(r.id)}
                        onPointerEnter={() => onPreview(r.id)}
                        onFocus={() => onPreview(r.id)}
                        onKeyDown={(e) => onKey(r, e)}
                        className={`grid w-full cursor-grab gap-0.5 rounded-md border bg-card p-2 text-left text-sm active:cursor-grabbing ${r.id === selected ? 'border-primary ring-1 ring-primary' : ''}`}
                      >
                        <span className="line-clamp-2 font-medium">
                          {bilingual(r.action, r.translation).text}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {t`${i18n._(REC_KINDS[r.kindShown])} · priority ${r.priority}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
