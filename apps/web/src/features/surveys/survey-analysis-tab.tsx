import { useGetSurveyAnalysis, useListSurveyFacts } from '@goodresearch/api-client'
import {
  CheckIcon,
  HourglassIcon,
  SparklesIcon,
  UsersIcon,
} from '@goodresearch/ui/components/icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { Tabs, TabsBar, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useCanChange } from '../workspace/read-only.tsx'
import { FigureCard } from './figure-card.tsx'
import { FigureFactButton } from './figure-fact-dialog.tsx'
import { FindSurveyFacts } from './find-survey-facts.tsx'
import { OpenItem } from './open-item.tsx'
import { SurveyFacts } from './survey-facts.tsx'

const NONE = 'none'

/** The Analysis tab of a survey study (spec 029): figures of the counted responses. */
export function SurveyAnalysisTab({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const canChange = useCanChange()
  const [crossBy, setCrossBy] = useState<string>(NONE)
  const [tab, setTab] = useState('figures')
  const toDecideFacts = useListSurveyFacts(studyId, { status: 'to-decide', page: 1 })
  const acceptedFacts = useListSurveyFacts(studyId, { status: 'accepted', page: 1 })
  // While themes are found, the tab follows the run (as the interview Analysis does).
  const analysis = useGetSurveyAnalysis(studyId, crossBy === NONE ? {} : { crossBy }, {
    query: { refetchInterval: (q) => (q.state.data?.run?.state === 'running' ? 2000 : false) },
  })

  if (analysis.isPending) return <Skeleton className="h-40 w-full" />
  if (analysis.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        {errorMessage(i18n, analysis.error)}
      </p>
    )
  const a = analysis.data
  if (a.counts.counted === 0)
    return (
      <p className="text-muted-foreground text-base">
        {t`No counted response yet: the figures come with the first ones.`}{' '}
        <Link
          className="underline"
          to="/studies/$studyId"
          params={{ studyId }}
          search={{ phase: 'fieldwork' }}
        >
          {t`Go to Fieldwork`}
        </Link>
      </p>
    )
  const answers = a.openItems.reduce((n, o) => n + o.answers, 0)
  const themed = a.openItems.reduce((n, o) => n + o.themed, 0)
  const crossName = a.crossable.find((c) => c.id === crossBy)?.text
  const toDecide = toDecideFacts.data?.total ?? 0
  const accepted = acceptedFacts.data?.total ?? 0

  const cross = a.crossable.length ? (
    <Select value={crossBy} onValueChange={(v) => v && setCrossBy(v)}>
      <SelectTrigger aria-label={t`Cross by`} className="w-72 max-w-full">
        <SelectValue>
          {(v: string) =>
            v === NONE
              ? t`No cross`
              : t`Cross by: ${a.crossable.find((c) => c.id === v)?.text ?? ''}`
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t`No cross`}</SelectItem>
        {a.crossable.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null

  return (
    <div className="grid gap-6">
      {/* As the interview Analysis: the numbers, then tabs with their counts and the action. */}
      <StatTiles aria-label={t`Analysis in numbers`}>
        <StatTile
          icon={<UsersIcon aria-hidden />}
          label={t`Counted responses`}
          value={a.counts.counted}
          detail={t`${a.counts.setAside} set aside`}
        />
        <StatTile
          icon={<HourglassIcon aria-hidden />}
          label={t`Facts to decide`}
          value={toDecide}
          detail={t`Made from figures and themes`}
        />
        <StatTile
          icon={<CheckIcon aria-hidden />}
          label={t`Accepted facts`}
          value={accepted}
          detail={t`${themed} of ${answers} open answers in a theme`}
        />
        <StatTile
          icon={<SparklesIcon aria-hidden />}
          label={t`Cost of the analysis`}
          value={a.cost === null ? t`unknown` : money(a.cost)}
          detail={t`Themes and translations`}
        />
      </StatTiles>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
        {/* As the interview Analysis: "Find facts" is the action of every tab. */}
        <TabsBar
          action={
            canChange ? <FindSurveyFacts studyId={studyId} onFound={() => setTab('facts')} /> : null
          }
        >
          <TabsList aria-label={t`Analysis`}>
            <TabsTrigger value="figures">{t`Figures`}</TabsTrigger>
            {a.openItems.length ? (
              <TabsTrigger value="open">{t`Open questions (${a.openItems.length})`}</TabsTrigger>
            ) : null}
            <TabsTrigger value="facts">{t`Facts (${toDecide} to decide)`}</TabsTrigger>
          </TabsList>
        </TabsBar>

        <TabsContent value="figures" className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-muted-foreground text-sm">
              {crossName
                ? t`Each question broken down by the answers to “${crossName}”. A respondent who chose several answers counts in each.`
                : t`Computed by the app over the counted responses only. Each share is over the respondents who answered the question.`}
            </p>
            {cross}
          </div>
          {a.sections.map((s) => (
            <section key={s.id} aria-labelledby={`section-${s.id}`} className="grid gap-3">
              <h3 id={`section-${s.id}`} className="font-semibold">
                {s.title}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {s.figures.map((f) => (
                  <FigureCard
                    key={f.itemId}
                    figure={f}
                    footer={
                      canChange ? (
                        <FigureFactButton studyId={studyId} figure={f} crossBy={a.crossBy} />
                      ) : null
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="open">
          <ul className="grid gap-2">
            {a.openItems.map((o) => (
              <OpenItem key={o.id} studyId={studyId} item={o} run={a.run} canChange={canChange} />
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="facts">
          <SurveyFacts studyId={studyId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
