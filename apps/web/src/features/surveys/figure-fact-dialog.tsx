import {
  type Figure,
  type FigureColumn,
  type FigureRef,
  getGetSurveyAnalysisQueryKey,
  getListSurveyFactsQueryKey,
  useCreateSurveyFact,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { PlusIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { POLARITIES } from '../analysis/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { useShare } from './figure-card.tsx'

type Measure = Pick<FigureRef, 'measure' | 'option'>

/** The figures of one column a fact can cite: an option's share, agreement, disagreement, mean. */
const measuresOf = (figure: Figure, column: FigureColumn) => [
  ...(column.options ?? []).map((o) => ({
    key: `option:${o.value}`,
    ref: { measure: 'option' as const, option: o.value },
    label: o.value,
    count: o.count,
    percent: o.percent,
  })),
  ...(figure.kind === 'likert' && column.base > 0
    ? [
        { key: 'agree', ref: { measure: 'agree' as const }, percent: column.agree ?? null },
        {
          key: 'disagree',
          ref: { measure: 'disagree' as const },
          percent: column.disagree ?? null,
        },
        { key: 'mean', ref: { measure: 'mean' as const }, mean: column.mean ?? null },
      ]
    : []),
]

/** Spec 029 US4: a person makes a fact of a figure; the app writes its statement. */
export function FigureFactButton({
  studyId,
  figure,
  crossBy,
}: {
  studyId: string
  figure: Figure
  crossBy: string | null
}) {
  const { t, i18n } = useLingui()
  const share = useShare()
  const queryClient = useQueryClient()
  const create = useCreateSurveyFact()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [column, setColumn] = useState<string>('')
  const [measure, setMeasure] = useState<string>('')
  const [polarity, setPolarity] = useState<'positive' | 'negative' | 'neutral'>('neutral')
  const columns = [
    { key: '', label: t`All respondents`, column: figure.total },
    ...(figure.columns ?? []).map((c) => ({ key: c.option, label: c.option, column: c })),
  ]
  const chosenColumn = columns.find((c) => c.key === column) ?? columns[0]
  const measures = chosenColumn ? measuresOf(figure, chosenColumn.column) : []
  const chosen = measures.find((m) => m.key === measure)
  const label = (m: (typeof measures)[number]) =>
    'mean' in m
      ? t`Mean: ${m.mean === null ? '—' : i18n.number(m.mean, { maximumFractionDigits: 1 })}`
      : m.key === 'agree'
        ? t`Agreement: ${share(m.percent)}`
        : m.key === 'disagree'
          ? t`Disagreement: ${share(m.percent)}`
          : `${'label' in m ? m.label : ''}: ${share(m.percent, 'count' in m ? m.count : undefined)}`

  const submit = async () => {
    if (!chosen) return
    const ref: Measure = chosen.ref
    try {
      await create.mutateAsync({
        studyId,
        data: {
          from: {
            figure: {
              itemId: figure.itemId,
              ...ref,
              ...(column && crossBy ? { cross: { itemId: crossBy, option: column } } : {}),
            },
          },
          polarity,
        },
      })
      toast.success(t`Fact proposed: decide it in the Facts tab.`)
      setOpen(false)
      setMeasure('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListSurveyFactsQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getGetSurveyAnalysisQueryKey(studyId) }),
      ])
    } catch {
      // Shown in the dialog.
    }
  }

  return (
    <>
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden />
          {t`Make a fact`}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t`Close`} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t`Make a fact of this figure`}</DialogTitle>
            <DialogDescription>{figure.text}</DialogDescription>
          </DialogHeader>
          {columns.length > 1 ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">{t`Respondents`}</legend>
              <RadioGroup
                value={column}
                onValueChange={(v) => {
                  setColumn(String(v))
                  setMeasure('')
                }}
              >
                {columns.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <RadioGroupItem id={`${id}-c-${c.key}`} value={c.key} />
                    <Label htmlFor={`${id}-c-${c.key}`} className="font-normal">
                      {c.label} ({c.column.base})
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-medium text-sm">{t`Figure`}</legend>
            <RadioGroup value={measure} onValueChange={(v) => setMeasure(String(v))}>
              {measures.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-m-${m.key}`} value={m.key} />
                  <Label htmlFor={`${id}-m-${m.key}`} className="font-normal">
                    {label(m)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-medium text-sm">{t`Polarity`}</legend>
            <RadioGroup
              value={polarity}
              onValueChange={(v) => setPolarity(v as typeof polarity)}
              className="flex flex-wrap gap-4"
            >
              {(['positive', 'negative', 'neutral'] as const).map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-p-${p}`} value={p} />
                  <Label htmlFor={`${id}-p-${p}`} className="font-normal">
                    {i18n._(POLARITIES[p])}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {chosenColumn?.column.smallBase ? (
            <p className="text-sm">{t`Small base: the fact will say so.`}</p>
          ) : null}
          {create.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, create.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={!chosen || create.isPending} onClick={() => void submit()}>
              {t`Propose the fact`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
