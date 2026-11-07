import { Badge } from '@goodresearch/ui/components/badge'
import { ArrowRightIcon, FolderOpenIcon } from '@goodresearch/ui/components/icons'
import { sky } from '@goodresearch/ui/lib/sky'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useFormatDate } from '../workspace/format.ts'
import { CostBreakdown } from './cost-breakdown.tsx'

type UseCost = number | null

/** A study as a card, in a project (spec 017 US2) and on its team's page (spec 019 US5). */
export function StudyCard({
  study,
  search,
  closed,
  counts,
  cost,
  note,
  actions,
}: {
  study: {
    id: string
    name: string
    type: 'interviews' | 'survey' | 'usability-test'
    hasFolder: boolean
    folderName: string | null
    updatedAt: string
  }
  search?: { from: string }
  /** A closed study shows its name and type; its page asks for access. */
  closed: boolean
  counts?: Parameters<typeof StudyChips>[0]['counts'] | null | undefined
  cost?:
    | {
        total: UseCost
        analysis: UseCost
        lexicon: UseCost
        cleaning: UseCost
        quality: UseCost
        facts: UseCost
      }
    | undefined
  note?: ReactNode
  /** Above the card's link, so it stays reachable. */
  actions?: ReactNode
}) {
  const { t } = useLingui()
  const formatDate = useFormatDate()
  const updated = formatDate(study.updatedAt)
  const folder = study.folderName
  return (
    <li className="relative grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 rounded-lg border bg-card px-[18px] py-4 transition-shadow hover:border-input hover:shadow-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-solid">
      <div
        aria-hidden
        className="size-[52px] rounded-[12px]"
        style={{ background: sky(study.id) }}
      />
      <div className="grid min-w-0 gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Badge variant="secondary">
            {study.type === 'survey'
              ? t`Survey`
              : study.type === 'usability-test'
                ? t`Usability test`
                : t`Interviews`}
          </Badge>
          <Link
            to="/studies/$studyId"
            params={{ studyId: study.id }}
            {...(search ? { search } : {})}
            className="truncate text-[1.05rem] font-semibold outline-none focus-visible:shadow-none after:absolute after:inset-0 after:rounded-lg"
          >
            {study.name}
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <ArrowRightIcon aria-hidden className="size-4 text-muted-foreground" />
          </div>
        </div>
        {note}
        {/* A survey whose responses could not be read shows no count rather than a wrong one; a usability
            test has nothing to count before its Fieldwork (spec 036). */}
        {counts &&
        (study.type === 'interviews' || (study.type === 'survey' && counts.responses)) ? (
          <StudyChips counts={counts} />
        ) : null}
        {closed ? (
          study.hasFolder ? (
            <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <FolderOpenIcon aria-hidden className="size-3.5" />
              {t`Folder access not confirmed`}
            </p>
          ) : null
        ) : (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
            <span className="inline-flex items-center gap-1.5">
              <FolderOpenIcon aria-hidden className="size-3.5" />
              {folder ? folder : study.hasFolder ? t`Folder attached` : t`No folder yet`}
            </span>
            <span>{t`Updated ${updated}`}</span>
            {cost ? (
              <CostBreakdown
                label={(amount) => t`AI cost: ${amount}`}
                total={cost.total}
                uses={[
                  { label: t`Analysis`, cost: cost.analysis },
                  { label: t`Lexicon`, cost: cost.lexicon },
                  { label: t`Cleaning`, cost: cost.cleaning },
                  { label: t`Quality`, cost: cost.quality },
                  { label: t`Facts`, cost: cost.facts },
                ]}
              />
            ) : null}
          </p>
        )}
      </div>
    </li>
  )
}

/** Spec 017 US2: what a study holds and what waits for a person; nothing to report is left out. */
function StudyChips({
  counts: c,
}: {
  counts: {
    validated: number
    toValidate: number
    excluded: number
    facts: number
    factsToDecide: number
    /** Spec 028: a survey study's responses; null for the other studies. */
    responses: { received: number; counted: number } | null
  }
}) {
  const { t, i18n } = useLingui()
  const toValidate = i18n.number(c.toValidate)
  if (c.responses) {
    const { received, counted } = c.responses
    if (received === 0) return <p className="text-muted-foreground text-sm">{t`No response yet`}</p>
    const setAside = i18n.number(received - counted)
    return (
      <p className="flex flex-wrap gap-1.5">
        <Badge className="bg-polarity-positive text-foreground">
          {plural(counted, { one: '# response counted', other: '# responses counted' })}
        </Badge>
        {received > counted ? <Badge variant="secondary">{t`${setAside} set aside`}</Badge> : null}
      </p>
    )
  }
  if (c.validated + c.toValidate + c.excluded === 0)
    return <p className="text-muted-foreground text-sm">{t`No interview yet`}</p>
  return (
    <p className="flex flex-wrap gap-1.5">
      {c.validated > 0 ? (
        <Badge className="bg-polarity-positive text-foreground">
          {plural(c.validated, { one: '# interview validated', other: '# interviews validated' })}
        </Badge>
      ) : null}
      {c.toValidate > 0 ? <Badge variant="highlight">{t`${toValidate} to validate`}</Badge> : null}
      {c.excluded > 0 ? (
        <Badge variant="secondary">
          {plural(c.excluded, { one: '# excluded', other: '# excluded' })}
        </Badge>
      ) : null}
      {c.facts > 0 ? (
        <Badge variant="secondary">{plural(c.facts, { one: '# fact', other: '# facts' })}</Badge>
      ) : null}
      {c.factsToDecide > 0 ? (
        <Badge variant="highlight">
          {plural(c.factsToDecide, { one: '# fact to decide', other: '# facts to decide' })}
        </Badge>
      ) : null}
    </p>
  )
}
