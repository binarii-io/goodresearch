import {
  getGetSurveyAnalysisQueryKey,
  getListSurveyFactsQueryKey,
  useEstimateSurveyFactsFind,
  useFindSurveyFacts,
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
import { Button } from '@goodresearch/ui/components/button'
import { LoaderCircleIcon, SparklesIcon } from '@goodresearch/ui/components/icons'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'

/**
 * Spec 029 FR-010a: "Find facts" of a survey study, the Analysis tab's action on every tab as for
 * interviews. The AI points at figures and accepted themes; the app writes each fact.
 */
export function FindSurveyFacts({ studyId, onFound }: { studyId: string; onFound: () => void }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const estimate = useEstimateSurveyFactsFind(studyId, {
    query: { enabled: open, staleTime: 0, gcTime: 0 },
  })
  const find = useFindSurveyFacts()
  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)

  if (find.isPending)
    return (
      <div className="ml-auto flex items-center gap-2" role="status">
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        <span className="text-sm">{t`Finding facts…`}</span>
      </div>
    )
  return (
    <>
      <Button className="ml-auto" onClick={() => setOpen(true)}>
        <SparklesIcon aria-hidden />
        {t`Find facts`}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Find the facts?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The AI reads the figures the app computed and the themes you accepted, and points at those worth a fact. The app writes each fact, which waits for a person's decision.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 text-sm" aria-live="polite">
            {estimate.isError ? (
              <p role="alert" className="text-destructive">
                {errorMessage(i18n, estimate.error)}
              </p>
            ) : !e ? (
              <p>{t`Counting the figures to read…`}</p>
            ) : !e.aiConnected ? (
              <p>{t`Set up your AI provider first.`}</p>
            ) : (
              <p>{t`${e.figures} figures and ${e.themes} accepted themes: about ${cost} with your AI provider.`}</p>
            )}
            <p className="text-muted-foreground">{t`No answer of a respondent is sent; figures or themes that already have a fact are left out.`}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!e?.aiConnected || find.isPending}
              onClick={() => {
                setOpen(false)
                void find
                  .mutateAsync({ studyId })
                  .then(async (found) => {
                    toast.success(
                      found.created === 0
                        ? t`No new fact: what stands out already has one.`
                        : plural(found.created, {
                            one: '# fact to decide.',
                            other: '# facts to decide.',
                          }),
                    )
                    await Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: getListSurveyFactsQueryKey(studyId),
                      }),
                      queryClient.invalidateQueries({
                        queryKey: getGetSurveyAnalysisQueryKey(studyId),
                      }),
                    ])
                    if (found.created > 0) onFound()
                  })
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }}
            >
              <SparklesIcon aria-hidden />
              {t`Find the facts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
