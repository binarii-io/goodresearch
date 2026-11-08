import {
  getGetInsightsQueryKey,
  useEstimateInsightRun,
  useStartInsightRun,
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
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'

/**
 * FR-002, FR-017: the studies and the scope, the estimate and, the first time, what is sent; then
 * the run. Only studies the person can open are offered.
 */
export function InsightRunDialog({
  projectId,
  open,
  onOpenChange,
  hasInsights,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  hasInsights: boolean
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const scopeId = useId()
  const [scope, setScope] = useState<'all' | 'unlinked'>(hasInsights ? 'unlinked' : 'all')
  // FR-003, update: facts still to decide may be read too; they are shown "to validate".
  // Spec 039: null = decided by the studies chosen (on when none has decided facts).
  const [askedProposed, setWithProposed] = useState<boolean | null>(null)
  const [chosen, setChosen] = useState<string[] | null>(null)
  // The studies come with the first estimate: all those with facts are ticked.
  const probe = useEstimateInsightRun()
  const estimate = useEstimateInsightRun()
  const studies = probe.data?.studies ?? []
  // Spec 039 FR-012, FR-015: a study with facts to decide only can be chosen; one with no fact cannot.
  const usable = (s: (typeof studies)[number]) => s.facts > 0 || s.toDecide > 0
  const selected = chosen ?? studies.filter(usable).map((s) => s.id)
  const picked = studies.filter((s) => selected.includes(s.id))
  const nothingDecided = picked.length > 0 && picked.every((s) => s.facts === 0)
  // FR-013: nothing decided in the studies chosen, the facts still to decide are read by default.
  const withProposed = askedProposed ?? nothingDecided
  useEffect(() => {
    if (!open) return
    setChosen(null)
    setScope(hasInsights ? 'unlinked' : 'all')
    setWithProposed(null)
    probe.mutate({ projectId, data: { studyIds: [], scope: 'all' } })
  }, [open, hasInsights, projectId, probe.mutate])
  const key = `${selected.join(',')}|${scope}|${withProposed}`
  useEffect(() => {
    if (!open || selected.length === 0) return
    estimate.mutate({ projectId, data: { studyIds: selected, scope, withProposed } })
  }, [open, key, projectId, estimate.mutate])
  const start = useStartInsightRun()
  const e = selected.length > 0 ? estimate.data : undefined
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Find insights?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`The AI reads the accepted facts of the studies you choose and proposes insights: findings that hold across participants. You decide each one.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium text-sm">{t`Studies`}</legend>
          {studies.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t`No study you can open has facts yet.`}</p>
          ) : (
            studies.map((s) => {
              const id = `${scopeId}-${s.id}`
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={selected.includes(s.id)}
                    disabled={!usable(s)}
                    onCheckedChange={(checked) => {
                      setChosen(
                        checked === true ? [...selected, s.id] : selected.filter((x) => x !== s.id),
                      )
                      // FR-012: a study with facts to decide only is read through them.
                      if (checked === true && s.facts === 0) setWithProposed(true)
                    }}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {usable(s)
                      ? t`${s.name} (${s.facts} accepted facts, ${s.toDecide} to decide)`
                      : t`${s.name} (no fact yet)`}
                  </Label>
                </div>
              )
            })
          )}
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium text-sm">{t`Facts`}</legend>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as 'all' | 'unlinked')}>
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${scopeId}-unlinked`} value="unlinked" />
              <Label htmlFor={`${scopeId}-unlinked`} className="font-normal">
                {t`Facts not yet in an insight`}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${scopeId}-all`} value="all" />
              <Label htmlFor={`${scopeId}-all`} className="font-normal">
                {t`All accepted facts`}
              </Label>
            </div>
          </RadioGroup>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${scopeId}-proposed`}
              checked={withProposed}
              onCheckedChange={(checked) => {
                setWithProposed(checked === true)
                setChosen(null)
              }}
            />
            <Label htmlFor={`${scopeId}-proposed`} className="grid gap-0.5 font-normal">
              <span>{t`Also read the facts still to decide`}</span>
              <span className="text-muted-foreground text-xs">{t`They are shown “to validate” in the insights, and count once accepted.`}</span>
            </Label>
          </div>
          {withProposed && askedProposed === null && nothingDecided ? (
            <p className="text-sm">{t`None of these studies has accepted facts yet: their facts still to decide are read, and the insights found are marked “to validate”.`}</p>
          ) : null}
          {!withProposed && nothingDecided ? (
            <p
              className="text-sm"
              role="status"
            >{t`No accepted fact is left to read in these studies: read the facts still to decide, or decide some first.`}</p>
          ) : null}
        </fieldset>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {selected.length === 0 ? null : !e ? (
            <p>{t`Counting the facts to read…`}</p>
          ) : e.facts === 0 ? (
            <p>{t`No fact to read with this choice.`}</p>
          ) : !e.aiConnected ? (
            <p>{t`Set up your AI provider first.`}</p>
          ) : (
            <p>{t`${e.facts} facts, ${e.calls} calls to the AI: about ${cost} with your AI provider.`}</p>
          )}
        </div>
        {e?.consentNeeded && e.aiConnected ? (
          <AlertDialogDescription className="grid gap-2">
            <span>{t`To find insights, the statements of the accepted facts are sent to your AI provider, with their polarity, theme and participant code.`}</span>
            <span>{t`No name, no verbatim and no interview title is sent.`}</span>
            <span>{t`Every insight the AI proposes waits for a person's decision.`}</span>
          </AlertDialogDescription>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || e.facts === 0 || !e.aiConnected || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({
                  projectId,
                  data: { studyIds: selected, scope, withProposed, consent: !!e?.consentNeeded },
                })
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: getGetInsightsQueryKey(projectId) }),
                )
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            <SparklesIcon aria-hidden />
            {e?.consentNeeded ? t`Agree and find insights` : t`Find insights`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
