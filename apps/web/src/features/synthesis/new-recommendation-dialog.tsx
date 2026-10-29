import { useCreateRecommendation } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { Label } from '@goodresearch/ui/components/label'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { InsightsPicker } from './insights-picker.tsx'
import { RATINGS, REC_KINDS } from './labels.ts'
import { useRefreshRecommendations } from './recommendation-panel.tsx'

type Kind = 'build' | 'test' | 'investigate'
type Rating = 'high' | 'medium' | 'low'

/** FR-007: a recommendation written by hand, validated at once, resting on insights. */
export function NewRecommendationDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const lang = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const actionId = useId()
  const refresh = useRefreshRecommendations(projectId)
  const create = useCreateRecommendation()
  const [action, setAction] = useState('')
  const [kind, setKind] = useState<Kind>('test')
  const [impact, setImpact] = useState<Rating>('medium')
  const [effort, setEffort] = useState<Rating>('medium')
  const [insights, setInsights] = useState<string[]>([])
  const reset = () => {
    setAction('')
    setKind('test')
    setImpact('medium')
    setEffort('medium')
    setInsights([])
  }
  const close = () => {
    reset()
    onOpenChange(false)
  }
  const ratings = Object.entries(RATINGS).map(([value, label]) => ({ value, label: i18n._(label) }))
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent closeLabel={t`Close`} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t`New recommendation`}</DialogTitle>
          <DialogDescription>
            {t`Write what the team should do and choose the insights it rests on. It is validated at once and translated into the other language.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <Label htmlFor={actionId}>{t`Action`}</Label>
          <Textarea
            id={actionId}
            value={action}
            maxLength={200}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Choice
            label={t`Kind`}
            value={kind}
            className="w-40"
            onChange={(v) => setKind(v as Kind)}
            options={Object.entries(REC_KINDS).map(([value, label]) => ({
              value,
              label: i18n._(label),
            }))}
          />
          <Choice
            label={t`Impact`}
            value={impact}
            className="w-32"
            onChange={(v) => setImpact(v as Rating)}
            options={ratings}
          />
          <Choice
            label={t`Effort`}
            value={effort}
            className="w-32"
            onChange={(v) => setEffort(v as Rating)}
            options={ratings}
          />
        </div>
        <p className="text-sm" aria-live="polite">
          {t`${insights.length} insights chosen`}
        </p>
        <InsightsPicker
          projectId={projectId}
          actions={(i) => {
            const chosen = insights.includes(i.id)
            return (
              <Button
                size="xs"
                variant={chosen ? 'secondary' : 'outline'}
                aria-pressed={chosen}
                onClick={() =>
                  setInsights(chosen ? insights.filter((x) => x !== i.id) : [...insights, i.id])
                }
              >
                {chosen ? t`Chosen` : t`Choose`}
              </Button>
            )
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t`Cancel`}
          </Button>
          <Button
            disabled={!action.trim() || insights.length === 0 || create.isPending}
            onClick={() =>
              void create
                .mutateAsync({
                  projectId,
                  data: { action: { [lang]: action.trim() }, kind, impact, effort, insights },
                })
                .then(async () => {
                  await refresh()
                  close()
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            {t`Create the recommendation`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
