import {
  getGetFactsOverviewQueryKey,
  useEstimateFactsRun,
  useStartFactsRun,
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
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { SparklesIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'

/** FR-014: what goes to the AI provider, said before the first reading of a study. */
function ConsentText() {
  const { t } = useLingui()
  return (
    <AlertDialogDescription className="grid gap-2">
      <span>{t`To find the facts, the text of each transcript is sent to your AI provider, with your own connection, in parts of about 60 turns.`}</span>
      <span>{t`The names the app knows (the people of the interviews, the schedule and your team) are replaced before sending.`}</span>
      <span>{t`Every fact the AI proposes waits for a person's decision.`}</span>
    </AlertDialogDescription>
  )
}

/**
 * The reading dialog: the estimate and the consent, then the run. With `interview`, that interview
 * alone is read again in full; decided facts stay.
 */
export function FindFactsDialog({
  studyId,
  open,
  onOpenChange,
  interview,
}: {
  studyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  interview?: { sessionId: string; title: string } | undefined
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [again, setAgain] = useState(false)
  const againId = useId()
  const estimate = useEstimateFactsRun(
    studyId,
    interview ? { sessionId: interview.sessionId } : again ? { all: 'true' } : {},
    { query: { enabled: open, staleTime: 0, gcTime: 0 } },
  )
  const start = useStartFactsRun()
  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {interview ? t`Find the facts of “${interview.title}”?` : t`Find the facts?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {interview
              ? t`This interview is read again in full. Facts already decided stay as they are.`
              : t`The AI reads each interview in full and picks verbatims: what the interviewees say, word for word. It then groups them into facts you decide.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {!e ? (
            <p>{t`Counting the interviews to read…`}</p>
          ) : e.interviews === 0 ? (
            <p>
              {interview
                ? t`This interview has no text to read.`
                : t`Every interview is already analysed. Tick the box below to read them again.`}
            </p>
          ) : !e.aiConnected ? (
            <p>{t`Set up your AI provider first.`}</p>
          ) : (
            <p>{t`${e.interviews} interviews, about ${e.chunks} parts for the AI: about ${cost} with your AI provider.`}</p>
          )}
        </div>
        {e?.consentNeeded && e.aiConnected ? <ConsentText /> : null}
        {interview ? null : (
          <div className="flex items-start gap-2">
            <Checkbox
              id={againId}
              checked={again}
              onCheckedChange={(checked) => setAgain(checked === true)}
            />
            <Label htmlFor={againId} className="grid gap-0.5 font-normal">
              <span>{t`Also read again the interviews already analysed`}</span>
              <span className="text-muted-foreground text-xs">{t`Facts already decided stay as they are.`}</span>
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
                    ...(interview ? { sessionIds: [interview.sessionId] } : {}),
                  },
                })
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: getGetFactsOverviewQueryKey(studyId) }),
                )
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            {e?.consentNeeded ? t`Agree and find the facts` : t`Find the facts`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Find facts" / "Find facts again" for one interview (its row, its view). */
export function FindFactsOneButton({
  studyId,
  interview,
  analysed,
  disabled,
  primary = false,
  onOpen,
}: {
  studyId: string
  interview: { sessionId: string; title: string }
  analysed: boolean
  disabled?: boolean
  /** A full button, dark as the app's other AI actions (the facts panel), rather than a small action in a row. */
  primary?: boolean
  /** In a table: the table's one dialog opens instead of a dialog of this button. */
  onOpen?: () => void
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={primary ? 'default' : 'ghost'}
        size={primary ? 'sm' : 'xs'}
        disabled={disabled}
        aria-label={
          analysed ? t`Find facts again: ${interview.title}` : t`Find facts: ${interview.title}`
        }
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
      >
        <SparklesIcon aria-hidden />
        {analysed ? t`Find facts again` : t`Find facts`}
      </Button>
      {onOpen ? null : (
        <FindFactsDialog
          studyId={studyId}
          open={open}
          onOpenChange={setOpen}
          interview={interview}
        />
      )}
    </>
  )
}
