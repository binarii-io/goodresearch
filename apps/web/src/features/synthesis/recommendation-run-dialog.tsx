import {
  getGetRecommendationsQueryKey,
  useEstimateRecommendationRun,
  useStartRecommendationRun,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@goodresearch/ui/components/alert-dialog'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { SparklesIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'

/** FR-002, FR-013: the insights read, the estimate and, the first time, what is sent; then the run. */
export function RecommendationRunDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const id = useId()
  const [withProposed, setWithProposed] = useState(false)
  const estimate = useEstimateRecommendationRun()
  const start = useStartRecommendationRun()
  useEffect(() => {
    if (open) estimate.mutate({ projectId, data: { withProposed } })
  }, [open, withProposed, projectId, estimate.mutate])
  useEffect(() => {
    if (open) setWithProposed(false)
  }, [open])
  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Find recommendations?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`The AI reads the project's insights and proposes what the team should do, why, and how to know it worked. You decide each one.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox
            id={id}
            checked={withProposed}
            onCheckedChange={(checked) => setWithProposed(checked === true)}
          />
          <Label htmlFor={id} className="grid gap-0.5 font-normal">
            <span>{t`Also read the insights still to decide`}</span>
            <span className="text-muted-foreground text-xs">{t`They are shown “to validate” in the recommendations, and count once validated.`}</span>
          </Label>
        </div>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {!e ? (
            <p>{t`Counting the insights to read…`}</p>
          ) : e.insights === 0 ? (
            <p>{t`No insight to read: validate insights in the Insights tab first.`}</p>
          ) : !e.aiConnected ? (
            <p>{t`Set up your AI provider first.`}</p>
          ) : (
            <p>{t`${e.insights} insights, one call to the AI: about ${cost} with your AI provider.`}</p>
          )}
        </div>
        {e?.consentNeeded && e.aiConnected ? (
          <AlertDialogDescription className="grid gap-2">
            <span>{t`The statements of the insights are sent to your AI provider, with your own connection, with their theme, confidence and number of participants.`}</span>
            <span>{t`No fact, no verbatim, no name and no study is sent.`}</span>
            <span>{t`Every recommendation the AI proposes waits for a person's decision.`}</span>
          </AlertDialogDescription>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || e.insights === 0 || !e.aiConnected || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({ projectId, data: { withProposed, consent: !!e?.consentNeeded } })
                .then(() =>
                  queryClient.invalidateQueries({
                    queryKey: getGetRecommendationsQueryKey(projectId),
                  }),
                )
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            <SparklesIcon aria-hidden />
            {e?.consentNeeded ? t`Agree and find recommendations` : t`Find recommendations`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
