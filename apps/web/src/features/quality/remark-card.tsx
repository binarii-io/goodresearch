import {
  type QualityRemark,
  type SetStanceStance,
  useSetRemarkStance,
  useWithdrawRemark,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, XIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { REMARK_KINDS } from './labels.ts'
import { usePersonLabel } from './use-person-label.ts'
import { useRefreshQuality } from './use-refresh.ts'

/**
 * One remark: the exact sentence, what was said around it, why, and a better wording. A person says
 * whether they agree: it is an opinion, nothing is applied (FR-007).
 */
export function RemarkCard({
  studyId,
  remark,
  selected,
  onSelect,
  showInterview,
}: {
  studyId: string
  remark: QualityRemark
  selected?: boolean
  /** In the interview's view: show the sentence in the transcript. */
  onSelect?: () => void
  showInterview?: boolean
}) {
  const { t, i18n } = useLingui()
  const personLabel = usePersonLabel()
  const refresh = useRefreshQuality(studyId)
  const stance = useSetRemarkStance()
  const withdraw = useWithdrawRemark()
  const failed = (failure: unknown) => toast.error(errorMessage(i18n, failure))
  const say = (value: SetStanceStance) =>
    void stance
      .mutateAsync({
        studyId,
        remarkId: remark.id,
        // The same choice again withdraws it.
        data: { stance: remark.stance === value ? null : value, version: remark.version },
      })
      .then(refresh)
      .catch(failed)
  const reason = i18n.locale.startsWith('fr') ? remark.reason.fr : remark.reason.en
  const pending = stance.isPending || withdraw.isPending
  return (
    <article
      id={`remark-${remark.id}`}
      aria-label={i18n._(REMARK_KINDS[remark.kind])}
      className={`grid gap-2 rounded-md border p-3 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{i18n._(REMARK_KINDS[remark.kind])}</Badge>
        <Badge variant="ghost">{personLabel(remark.person)}</Badge>
        {remark.origin === 'person' ? <Badge variant="ghost">{t`Added by a person`}</Badge> : null}
        {remark.lost ? <Badge variant="secondary">{t`Text changed`}</Badge> : null}
        {showInterview ? (
          <span className="truncate text-muted-foreground text-xs" title={remark.interviewTitle}>
            {remark.interviewTitle}
          </span>
        ) : null}
      </div>
      {remark.before ? (
        <p className="text-muted-foreground text-sm">
          <span className="sr-only">{t`Just before:`} </span>
          {excerpt(remark.before)}
        </p>
      ) : null}
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          className="cursor-pointer text-left font-medium text-sm"
          onClick={onSelect}
        >
          « {remark.text} »
        </button>
      ) : (
        <p className="font-medium text-sm">« {remark.text} »</p>
      )}
      {remark.after ? (
        <p className="text-muted-foreground text-sm">
          <span className="sr-only">{t`Just after:`} </span>
          {excerpt(remark.after)}
        </p>
      ) : null}
      <p className="text-sm">{reason}</p>
      {remark.addedElement ? (
        <p className="text-sm">{t`What it adds: ${remark.addedElement}`}</p>
      ) : null}
      {remark.recommendation ? (
        <p className="text-sm">{t`Rather: « ${remark.recommendation} »`}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {remark.origin === 'person' ? (
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() =>
              void withdraw
                .mutateAsync({
                  studyId,
                  remarkId: remark.id,
                  params: { version: remark.version },
                })
                .then(refresh)
                .catch(failed)
            }
          >
            {t`Withdraw`}
          </Button>
        ) : (
          <fieldset className="flex gap-1">
            <legend className="sr-only">{t`Opinion`}</legend>
            <Button
              size="xs"
              variant={remark.stance === 'agree' ? 'default' : 'outline'}
              aria-pressed={remark.stance === 'agree'}
              disabled={pending}
              onClick={() => say('agree')}
            >
              <CheckIcon aria-hidden />
              {t`Agree`}
            </Button>
            <Button
              size="xs"
              variant={remark.stance === 'disagree' ? 'default' : 'outline'}
              aria-pressed={remark.stance === 'disagree'}
              disabled={pending}
              onClick={() => say('disagree')}
            >
              <XIcon aria-hidden />
              {t`Disagree`}
            </Button>
          </fieldset>
        )}
        {onSelect ? null : (
          <Link
            to="."
            search={(previous) => ({
              ...previous,
              phase: 'quality' as const,
              interview: remark.sessionId,
              turn: remark.segmentId,
            })}
            className="ml-auto text-sm underline"
          >
            {t`See in the transcript`}
          </Link>
        )}
      </div>
    </article>
  )
}

/** Long turns: their start is enough to read the sentence in context. */
const excerpt = (text: string) => (text.length > 220 ? `${text.slice(0, 220)}…` : text)
