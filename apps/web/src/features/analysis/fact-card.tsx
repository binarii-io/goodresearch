import { type Fact, useDecideFact, useTranslateFact } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PencilIcon, SparklesIcon, XIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { useRefreshFacts } from './fact-dialog.tsx'
import { FACT_STATUSES, POLARITIES, TONE_FILLS } from './labels.ts'

/** The statement in the viewer's language, or the other one while it is being translated. */
export const useStatement = () => {
  const { t, i18n } = useLingui()
  return (fact: Fact) => {
    const mine = i18n.locale.startsWith('fr') ? fact.statement.fr : fact.statement.en
    const other = i18n.locale.startsWith('fr') ? fact.statement.en : fact.statement.fr
    if (mine) return { text: mine, note: null }
    return {
      text: other,
      note:
        fact.translation === 'translating' ? t`Translating…` : t`Not translated into your language`,
    }
  }
}

/**
 * One fact: its statement, polarity, theme, status as text (never by colour alone, FR-020), its
 * verbatims, and the decisions (FR-009).
 */
export function FactCard({
  studyId,
  fact,
  selected,
  onSelect,
  onVerbatim,
  onEdit,
  showInterview,
}: {
  studyId: string
  fact: Fact
  selected?: boolean
  onSelect?: () => void
  /** A verbatim was chosen: show it in its interview. */
  onVerbatim?: (segmentId: string) => void
  onEdit: () => void
  showInterview?: boolean
}) {
  const { t, i18n } = useLingui()
  const statementOf = useStatement()
  const refresh = useRefreshFacts(studyId, fact.sessionId)
  const decide = useDecideFact()
  const translate = useTranslateFact()
  const { text, note } = statementOf(fact)
  const accepted = fact.status === 'accepted' || fact.status === 'edited'
  const rejected = fact.status === 'rejected'
  const act = (decision: 'accept' | 'reject') =>
    void decide
      .mutateAsync({ studyId, factId: fact.id, data: { decision, version: fact.version } })
      .then(refresh)
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  return (
    <article
      aria-label={text}
      className={`grid gap-2 rounded-md border p-3 ${selected ? 'border-primary ring-1 ring-primary' : ''} ${fact.status === 'rejected' ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={fact.status === 'proposed' ? 'outline' : 'secondary'}>
          {i18n._(FACT_STATUSES[fact.status])}
        </Badge>
        {/* The colour of its verbatims in the transcript. */}
        <Badge
          variant="outline"
          className={`border-transparent text-foreground ${TONE_FILLS[fact.polarity]}`}
        >
          {i18n._(POLARITIES[fact.polarity])}
        </Badge>
        <Badge variant="ghost">{fact.theme ? fact.theme.title : t`Other`}</Badge>
        {fact.participants.map((p) => (
          <Badge key={p} variant="ghost">
            {p}
          </Badge>
        ))}
        {showInterview ? (
          <span className="truncate text-muted-foreground text-xs" title={fact.interviewTitle}>
            {fact.interviewTitle}
          </span>
        ) : null}
      </div>
      {onSelect ? (
        <button
          type="button"
          className="cursor-pointer text-left font-medium text-sm"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {text}
        </button>
      ) : (
        <p className="font-medium text-sm">{text}</p>
      )}
      {note ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          {note}
          {fact.translation === 'not-translated' ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={translate.isPending}
              onClick={() =>
                void translate
                  .mutateAsync({ studyId, factId: fact.id })
                  .then(refresh)
                  .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              }
            >
              <SparklesIcon aria-hidden />
              {t`Translate`}
            </Button>
          ) : null}
        </p>
      ) : null}
      <ul className="grid gap-1">
        {fact.verbatims.map((v) => (
          <li key={v.id} className="text-muted-foreground text-sm">
            {onVerbatim ? (
              <button
                type="button"
                className="block min-h-6 w-full cursor-pointer border-l-2 pl-2 text-left hover:text-foreground"
                onClick={() => onVerbatim(v.segmentId)}
              >
                « {v.text} »{v.lost ? ` ${t`(no longer in the text)`}` : ''}
              </button>
            ) : (
              <span className="block border-l-2 pl-2">
                « {v.text} »{v.lost ? ` ${t`(no longer in the text)`}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The decision stays in view: the choice made is highlighted, the other one stays at hand. */}
      <div className="flex flex-wrap items-center gap-1">
        <fieldset className="flex gap-1">
          <legend className="sr-only">{t`Decision`}</legend>
          <Button
            size="xs"
            variant={accepted ? 'default' : 'outline'}
            aria-pressed={accepted}
            disabled={decide.isPending}
            onClick={() => (accepted ? undefined : act('accept'))}
          >
            <CheckIcon aria-hidden />
            {accepted ? t`Accepted` : t`Accept`}
          </Button>
          <Button
            size="xs"
            variant={rejected ? 'default' : 'outline'}
            aria-pressed={rejected}
            disabled={decide.isPending}
            onClick={() => (rejected ? undefined : act('reject'))}
          >
            <XIcon aria-hidden />
            {rejected ? t`Rejected` : t`Reject`}
          </Button>
        </fieldset>
        <Button size="xs" variant="ghost" onClick={onEdit}>
          <PencilIcon aria-hidden />
          {t`Edit`}
        </Button>
      </div>
    </article>
  )
}
