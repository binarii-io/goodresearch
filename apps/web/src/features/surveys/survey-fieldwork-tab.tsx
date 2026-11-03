import {
  getGetResponsesSummaryQueryKey,
  getListPublicationsQueryKey,
  getListResponsesQueryKey,
  useCheckPublication,
  useGetResponsesSummary,
  useGetTargetRuleCost,
  useListPublications,
  useReadResponses,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  CheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  UsersIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import { useMoney } from '../assistant/cost.tsx'
import { askWriteConsent } from '../preparation/drive-publishing.tsx'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { FormState } from './form-state.tsx'
import { ResponsesList } from './responses-list.tsx'
import { TargetRule, targetIsSet } from './target-rule.tsx'

/** The Fieldwork tab of a survey study (spec 028). */
export function SurveyFieldworkTab({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const publications = useListPublications(studyId)
  const summary = useGetResponsesSummary(studyId)
  const ruleCost = useGetTargetRuleCost(studyId)
  const read = useReadResponses()
  const check = useCheckPublication()
  const money = useMoney()
  const formatRelative = useFormatRelative()
  const form = publications.data?.find((p) => p.kind === 'questionnaire')

  const formId = form?.id
  const refresh = useCallback(
    async (force: boolean) => {
      // The form may have been opened or closed in the form service itself: its state is read too.
      await Promise.all([
        read.mutateAsync({ studyId, data: { force } }).catch(() => undefined),
        // Listing the publications already checks them now and then; Refresh checks at once.
        force && formId
          ? check.mutateAsync({ publicationId: formId }).catch(() => undefined)
          : undefined,
      ])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetResponsesSummaryQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getListResponsesQueryKey(studyId) }),
        queryClient.invalidateQueries({ queryKey: getListPublicationsQueryKey(studyId) }),
      ])
    },
    [read.mutateAsync, check.mutateAsync, formId, studyId, queryClient],
  )

  // Read once when the tab opens, for a study with a form (FR-004).
  const asked = useRef(false)
  useEffect(() => {
    if (!form || asked.current) return
    asked.current = true
    void refresh(false)
  }, [form, refresh])

  if (publications.isPending || summary.isPending) return <Skeleton className="h-40 w-full" />
  if (!form)
    return (
      <p className="text-muted-foreground text-base">
        {t`Publish the questionnaire first.`}{' '}
        <Link
          className="underline"
          to="/studies/$studyId"
          params={{ studyId }}
          search={{ phase: 'preparation' }}
        >
          {t`Go to Preparation`}
        </Link>
      </p>
    )
  if (summary.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        {errorMessage(i18n, summary.error)}
      </p>
    )

  const s = summary.data
  const { counted, total, outOfTarget, profileNotAnswered, refusedConsent } = s.counts
  const target = s.target
  const readAt = s.reading ? formatRelative(s.reading.readAt) : null
  const left = s.reading?.unknownQuestions ?? 0
  const handTyped = s.reading?.unknownValues ?? 0
  const former = s.fromFormerForm
  const spent = ruleCost.data?.total
  const cost = spent === null ? t`unknown` : money(spent ?? 0)

  const setAside = outOfTarget + profileNotAnswered
  const refreshing = read.isPending || check.isPending

  return (
    <div className="grid gap-6">
      <FormState studyId={studyId} publication={form} />

      <section aria-labelledby="responses-heading" className="grid gap-4">
        <div className="grid gap-1">
          <SectionTitle id="responses-heading">{t`Responses`}</SectionTitle>
          <p className="text-muted-foreground text-sm">{t`Each response of the form is read here. Those outside the target audience or without consent are set aside, never deleted.`}</p>
        </div>
        <StatTiles aria-label={t`Responses in numbers`}>
          <StatTile
            icon={<UsersIcon aria-hidden />}
            label={t`Responses received`}
            value={total}
            detail={readAt ? t`Last read ${readAt}` : t`Not read yet`}
          />
          <StatTile
            icon={<CheckIcon aria-hidden />}
            label={t`Counted`}
            value={counted}
            detail={target === null ? t`No target number set` : t`of ${target} targeted`}
          />
          <StatTile
            icon={<CircleDashedIcon aria-hidden />}
            label={t({ message: 'Set aside', context: 'responses' })}
            value={setAside}
            detail={t`${outOfTarget} out of target · ${profileNotAnswered} profile not answered`}
          />
          <StatTile
            icon={<XIcon aria-hidden />}
            label={t`Refused consent`}
            value={refusedConsent}
            detail={t`Ended at the consent question`}
          />
        </StatTiles>
        {s.reading?.status === 'failed' ? (
          <p role="status" className="text-sm">{t`The last reading failed.`}</p>
        ) : null}
        {s.reading?.status === 'stopped' ? (
          <p
            role="status"
            className="text-sm"
          >{t`The reading stopped at its limit: some responses are missing.`}</p>
        ) : null}
        {read.isError ? (
          <div role="alert" className="grid justify-items-start gap-1 text-destructive text-sm">
            <p>{errorMessage(i18n, read.error)}</p>
            {errorCode(read.error) === 'DRIVE_WRITE_REQUIRED' ? (
              <Button size="sm" variant="outline" onClick={() => askWriteConsent(studyId)}>
                {t`Give access`}
              </Button>
            ) : null}
          </div>
        ) : null}
        {left ? (
          <p className="text-sm">{t`${left} questions of the form are not in the questionnaire: their answers were left out.`}</p>
        ) : null}
        {handTyped ? (
          <p className="text-sm">{t`${handTyped} answers are not among the options of their item, and never pass a target.`}</p>
        ) : null}
        {former ? (
          <p className="text-sm">{t`${former} responses came from a former form of this study: they are not counted.`}</p>
        ) : null}

        <ResponsesList
          studyId={studyId}
          counts={{
            all: total,
            counted,
            'out-of-target': outOfTarget,
            'profile-not-answered': profileNotAnswered,
            'refused-consent': refusedConsent,
          }}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <TargetRule studyId={studyId} summary={s} />
              <Button
                size="sm"
                variant="outline"
                disabled={refreshing}
                onClick={() => void refresh(true)}
              >
                {refreshing ? (
                  <LoaderCircleIcon aria-hidden className="animate-spin" />
                ) : (
                  <RefreshCwIcon aria-hidden />
                )}
                {t`Refresh the responses`}
              </Button>
            </div>
          }
          filters={
            <p className="text-muted-foreground text-sm">
              {targetIsSet(s)
                ? t`Target audience set: responses outside it are set aside.`
                : t`No target audience: every response with consent counts.`}
              {spent !== undefined && spent !== 0
                ? ` · ${t`Cost of the assistant's target rule: ${cost}`}`
                : ''}
            </p>
          }
        />
      </section>
    </div>
  )
}
