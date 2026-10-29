import {
  getGetFactsOverviewQueryKey,
  getGetFieldworkQueryKey,
  getGetStudyQueryKey,
  type StudyDetail,
  useUpdateStudySettings,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { SettingsIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Switch } from '@goodresearch/ui/components/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@goodresearch/ui/components/tooltip'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'

/**
 * The study's settings in the page bar (spec 009 FR-013): anonymisation, off by default. When on,
 * the names and titles proposed for the interviews use pseudonyms instead of names.
 */
export function StudySettingsButton({ study }: { study: StudyDetail }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const update = useUpdateStudySettings()
  const ids = {
    switch: useId(),
    help: useId(),
    text: useId(),
    corrections: useId(),
    clean: useId(),
  }

  const save = async (
    change: { anonymised: boolean; textAnalysed?: StudyDetail['textAnalysed'] },
    done: string,
  ) => {
    try {
      await update.mutateAsync({
        studyId: study.id,
        data: { ...change, version: study.version },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetStudyQueryKey(study.id) }),
        queryClient.invalidateQueries({ queryKey: getGetFieldworkQueryKey(study.id) }),
        queryClient.invalidateQueries({ queryKey: getGetFactsOverviewQueryKey(study.id) }),
      ])
      toast.success(done)
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
    }
  }
  const toggle = (anonymised: boolean) =>
    save({ anonymised }, anonymised ? t`Anonymisation on` : t`Anonymisation off`)

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Study settings`}
              onClick={() => setOpen(true)}
            />
          }
        >
          <SettingsIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{t`Study settings`}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t`Close`} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t`Study settings`}</DialogTitle>
            <DialogDescription>{study.name}</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <Switch
              id={ids.switch}
              checked={study.anonymised}
              disabled={update.isPending}
              aria-describedby={ids.help}
              onCheckedChange={(on) => void toggle(on)}
            />
            <div className="grid gap-1">
              <Label htmlFor={ids.switch}>{t`Anonymisation`}</Label>
              <p id={ids.help} className="text-muted-foreground text-sm">
                {t`The names and titles proposed for the interviews use a pseudonym (P01, P02…) instead of the interviewee's name. Before the beginning of a transcript goes to the AI, the names the app knows (schedule, people of the interview, team) are replaced; names it does not know stay in the text. Replacing every name inside the transcripts comes with the cleaning phase.`}
              </p>
            </div>
          </div>
          {/* Spec 012 FR-002: the text Analysis reads. */}
          <fieldset className="grid gap-2" aria-describedby={ids.text}>
            <legend className="font-medium text-sm">{t`Text analysed`}</legend>
            <p id={ids.text} className="text-muted-foreground text-sm">
              {t`What the Analysis phase reads to find verbatims and facts.`}
            </p>
            <RadioGroup
              value={study.textAnalysed}
              disabled={update.isPending}
              onValueChange={(v) =>
                void save(
                  {
                    anonymised: study.anonymised,
                    textAnalysed: v as StudyDetail['textAnalysed'],
                  },
                  t`Text analysed changed`,
                )
              }
              className="grid gap-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem id={ids.corrections} value="with-corrections" />
                <Label htmlFor={ids.corrections} className="grid gap-0.5 font-normal">
                  <span>{t`With the corrections`}</span>
                  <span className="text-muted-foreground text-xs">{t`The transcript with the corrections of the cleaning, those still to decide included. Facts can be found before every interview is clean.`}</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem id={ids.clean} value="clean-only" />
                <Label htmlFor={ids.clean} className="grid gap-0.5 font-normal">
                  <span>{t`Validated clean version only`}</span>
                  <span className="text-muted-foreground text-xs">{t`Only what a person checked. An interview without a validated clean version is not analysed.`}</span>
                </Label>
              </div>
            </RadioGroup>
          </fieldset>
        </DialogContent>
      </Dialog>
    </>
  )
}
