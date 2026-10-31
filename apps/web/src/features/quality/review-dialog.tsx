import { useEstimateQualityRun, useStartQualityRun } from '@goodresearch/api-client'
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
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useRefreshQuality } from './use-refresh.ts'

/** FR-013, FR-014: the estimate and, the first time, what goes to the AI provider. */
export function ReviewDialog({
  studyId,
  sessionId,
  open,
  onOpenChange,
}: {
  studyId: string
  /** That interview alone, whatever its state. */
  sessionId?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const refresh = useRefreshQuality(studyId)
  const [again, setAgain] = useState(false)
  const againId = useId()
  const estimate = useEstimateQualityRun(
    studyId,
    sessionId ? { sessionId } : again ? { all: 'true' } : {},
    {
      query: { enabled: open, staleTime: 0, gcTime: 0 },
    },
  )
  const start = useStartQualityRun()
  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Review the interviews?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`The AI reads each interview in full and points out the interviewers' sentences that orient the answer. Nothing changes in the transcripts.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {!e ? (
            <p>{t`Counting the interviews to read…`}</p>
          ) : e.interviews === 0 ? (
            <p>{t`Every interview is already reviewed. Tick the box below to read them again.`}</p>
          ) : !e.aiConnected ? (
            <p>{t`Set up your AI provider first.`}</p>
          ) : (
            <p>{t`${e.interviews} interviews, about ${e.chunks} parts for the AI: about ${cost} with your AI provider.`}</p>
          )}
        </div>
        {e?.consentNeeded && e.aiConnected ? (
          <AlertDialogDescription className="grid gap-2">
            <span>{t`To review them, the text of each transcript is sent to your AI provider, with your own connection, in parts of about 60 turns.`}</span>
            <span>{t`The names the app knows (the people of the interviews, the schedule and your team) are replaced before sending.`}</span>
          </AlertDialogDescription>
        ) : null}
        {sessionId ? null : (
          <div className="flex items-start gap-2">
            <Checkbox
              id={againId}
              checked={again}
              onCheckedChange={(checked) => setAgain(checked === true)}
            />
            <Label htmlFor={againId} className="font-normal">
              {t`Also read again the interviews already reviewed`}
            </Label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || e.interviews === 0 || !e.aiConnected || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({
                  studyId,
                  data: {
                    all: again,
                    consent: !!e?.consentNeeded,
                    ...(sessionId ? { sessionIds: [sessionId] } : {}),
                  },
                })
                .then(refresh)
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            {e?.consentNeeded ? t`Agree and review` : t`Review`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
