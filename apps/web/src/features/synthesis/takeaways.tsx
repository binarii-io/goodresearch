import {
  type TakeawaysView,
  useDraftTakeaways,
  useEstimateTakeawaysDraft,
  useRetryTakeawaysTranslation,
  useSaveTakeaways,
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
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import {
  LoaderCircleIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from '@goodresearch/ui/components/icons'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useBilingual } from './insight-card.tsx'
import { useRefreshRecommendations } from './recommendation-panel.tsx'

/**
 * FR-010: the project's key takeaways, edited in place; an AI draft shown beside them, never
 * saved without the person ("Use this draft").
 */
export function Takeaways({
  projectId,
  takeaways: k,
  consentNeeded,
  validated,
  toDecide,
}: {
  projectId: string
  takeaways: TakeawaysView
  consentNeeded: boolean
  /** Validated insights, and insights still to decide, of the project. */
  validated: number
  toDecide: number
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const bilingual = useBilingual()
  const lang = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const refresh = useRefreshRecommendations(projectId)
  const save = useSaveTakeaways()
  const draft = useDraftTakeaways()
  const retry = useRetryTakeawaysTranslation()
  const fail = (failure: unknown) => toast.error(errorMessage(i18n, failure))
  const write = async (text: { en?: string; fr?: string }, fromDraft = false) => {
    try {
      await save.mutateAsync({
        projectId,
        data: { version: k.version, text, ...(fromDraft ? { fromDraft } : {}) },
      })
      await refresh()
    } catch (failure) {
      fail(failure)
      throw failure
    }
  }
  const drafting = k.draft.state === 'drafting'
  // FR-013: the first draft for this provider asks first, as the other AI runs do.
  const [asking, setAsking] = useState(false)
  const start = (consent: boolean) =>
    void draft
      .mutateAsync({ projectId, data: { consent, withProposed } })
      .then(() => refresh())
      .catch(fail)
  const proposedId = useId()
  // FR-010, update: what is still to decide may be read too; ticked when nothing is validated.
  const [withProposed, setWithProposed] = useState(validated === 0)
  const canDraft = validated > 0 || (withProposed && toDecide > 0)
  // FR-012: what a draft reads and costs, shown before it runs.
  const estimate = useEstimateTakeawaysDraft()
  useEffect(() => {
    if (asking) estimate.mutate({ projectId, data: { withProposed } })
  }, [asking, withProposed, projectId, estimate.mutate])
  const e = asking ? estimate.data : undefined
  return (
    <section
      aria-labelledby="takeaways-heading"
      className="grid gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="takeaways-heading" className="font-semibold text-lg">
            {t`Key takeaways`}
          </h2>
          {k.toValidate > 0 ? (
            <Badge variant="outline">
              <TriangleAlertIcon aria-hidden />
              {t`Rests on ${k.toValidate} items to validate`}
            </Badge>
          ) : null}
          {k.outOfDate ? (
            <Badge variant="outline">
              <TriangleAlertIcon aria-hidden />
              {t`May be out of date`}
            </Badge>
          ) : null}
          {k.translation === 'translating' ? (
            <span className="text-muted-foreground text-xs">{t`Translating…`}</span>
          ) : null}
        </div>
        <Button
          size="sm"
          disabled={drafting || draft.isPending || !canDraft}
          onClick={() => setAsking(true)}
        >
          {drafting ? (
            <LoaderCircleIcon aria-hidden className="animate-spin" />
          ) : (
            <SparklesIcon aria-hidden />
          )}
          {drafting ? t`Drafting…` : t`Draft with the AI`}
        </Button>
      </div>
      {toDecide > 0 ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={proposedId}
            checked={withProposed}
            onCheckedChange={(checked) => setWithProposed(checked === true)}
          />
          <Label htmlFor={proposedId} className="grid gap-0.5 font-normal">
            <span>{t`Also use what is still to decide`}</span>
            <span className="text-muted-foreground text-xs">{t`Insights and recommendations not validated yet; the takeaways then say how many of them are still to validate.`}</span>
          </Label>
        </div>
      ) : null}
      {canDraft ? null : (
        <p className="text-muted-foreground text-sm">{t`The draft is written from the validated insights and recommendations: validate at least one insight first (Insights tab, or from a recommendation).`}</p>
      )}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Draft the key takeaways with the AI?`}</AlertDialogTitle>
            <AlertDialogDescription className="grid gap-2">
              <span aria-live="polite">
                {estimate.isError
                  ? t`The cost could not be estimated: the draft can still be asked for.`
                  : !e
                    ? t`Counting what the draft reads…`
                    : !e.aiConnected
                      ? t`Set up your AI provider first.`
                      : t`${e.items} insights and recommendations, one call to the AI: about ${e.cost === null ? t`unknown` : money(e.cost)} with your AI provider.`}
              </span>
              {e?.consentNeeded ? (
                <>
                  <span>{t`The insights and recommendations are sent to your AI provider, with your own connection: their statements, theme, confidence and participant counts.`}</span>
                  <span>{t`No fact, no verbatim, no name and no study is sent.`}</span>
                </>
              ) : null}
              <span>{t`The draft is shown beside the takeaways and saved only if you use it.`}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              // Without an estimate, the draft may still be asked for: the server asks for consent
              // when it is needed (review of PR #14).
              disabled={!estimate.isError && !e?.aiConnected}
              onClick={() => {
                setAsking(false)
                start(e ? e.consentNeeded : consentNeeded)
              }}
            >
              {(e ? e.consentNeeded : consentNeeded) ? t`Agree and draft` : t`Draft`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {consentNeeded && canDraft ? (
        <p className="text-muted-foreground text-xs">{t`A draft sends the validated insights and recommendations (no fact, no name) to your AI provider.`}</p>
      ) : null}
      <div className="text-base leading-relaxed">
        <InlineEdit
          label={t`Key takeaways`}
          value={bilingual(k.text, k.translation).text}
          multiline
          maxLength={1200}
          placeholder={t`Two to four sentences a stakeholder reads first.`}
          savedMessage={t`Key takeaways saved`}
          editHint={t`Ctrl+Enter to save, Escape to cancel`}
          onSave={(v) => write({ [lang]: v })}
        />
      </div>
      {k.translation === 'not-translated' ? (
        <p className="text-sm">
          {t`Not translated into the other language.`}{' '}
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void retry
                .mutateAsync({ projectId, data: { version: k.version } })
                .then(() => refresh())
                .catch(fail)
            }
          >
            {t`Translate again`}
          </Button>
        </p>
      ) : null}
      {k.savedBy || k.cost ? (
        <p className="text-muted-foreground text-xs">
          {[
            k.savedBy ? t`Saved by ${k.savedBy.name ?? '…'}` : null,
            k.cost ? t`AI drafts so far ${money(k.cost)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {k.draft.state === 'ready' &&
      k.draft.text &&
      // A draft already used is the text: no need to show it twice.
      (k.draft.text.en !== k.text.en || k.draft.text.fr !== k.text.fr) ? (
        <section aria-label={t`AI draft`} className="grid gap-2 rounded-md bg-muted/50 p-3">
          <h3 className="eyebrow">{t`AI draft, not saved`}</h3>
          {k.draft.withProposed ? (
            <p className="text-muted-foreground text-xs">{t`Includes insights or recommendations still to validate.`}</p>
          ) : null}
          <p className="text-sm leading-relaxed">{bilingual(k.draft.text).text}</p>
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                if (k.draft.text) void write(k.draft.text, true).catch(() => undefined)
              }}
            >
              {t`Use this draft`}
            </Button>
          </div>
        </section>
      ) : k.draft.state === 'failed' ? (
        <p className="text-sm">{t`The draft could not be written: try again.`}</p>
      ) : null}
    </section>
  )
}
