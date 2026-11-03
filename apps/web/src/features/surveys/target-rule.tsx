import {
  getGetResponsesSummaryQueryKey,
  getListResponsesQueryKey,
  type ResponsesSummary,
  useSaveTargetRule,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { HelpTip } from '@goodresearch/ui/components/help-tip'
import { PencilIcon, PlusIcon } from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'

/** A saved rule may be empty (the target was removed): only accepted answers, or stale ones, count. */
export const targetIsSet = (summary: ResponsesSummary) =>
  summary.rule?.stale === true ||
  summary.filterable.some((item) =>
    (summary.rule?.accepted[item.id] ?? []).some((o) => item.options.includes(o)),
  )

/**
 * Which answers of the profiling items belong to the target (spec 028 US3). Optional: a button
 * opens it in a dialog, and removing it saves an empty rule, which counts every response.
 */
export function TargetRule({ studyId, summary }: { studyId: string; summary: ResponsesSummary }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const save = useSaveTargetRule()
  const id = useId()
  const items = summary.filterable
  // What the rule names and the questionnaire no longer has cannot be unticked: it is dropped.
  const saved = Object.fromEntries(
    items.flatMap((item) => {
      const kept = (summary.rule?.accepted[item.id] ?? []).filter((o) => item.options.includes(o))
      return kept.length ? [[item.id, kept]] : []
    }),
  )
  const hasRule = targetIsSet(summary)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null)
  const accepted = draft ?? saved

  const toggle = (item: string, option: string, on: boolean) => {
    const current = accepted[item] ?? []
    setDraft({
      ...accepted,
      [item]: on ? [...current, option] : current.filter((o) => o !== option),
    })
  }

  const submit = async (rule: Record<string, string[]>) => {
    const kept = Object.fromEntries(Object.entries(rule).filter(([, v]) => v.length > 0))
    await save.mutateAsync({
      studyId,
      data: { accepted: kept, version: summary.rule?.version ?? null },
    })
    setDraft(null)
    setOpen(false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetResponsesSummaryQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getListResponsesQueryKey(studyId) }),
    ])
  }

  const show = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setDraft(null)
      save.reset()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <HelpTip label={t`What is the target audience?`}>
        {items.length
          ? t`Keeps only the responses of the people you are looking for, from their answers to the profiling items. The others are set aside, never deleted, and the analysis counts only the kept ones. Without a target, every response counts.`
          : t`Only profiling items with choices can filter responses, and this questionnaire has none.`}
      </HelpTip>
      <Button size="sm" variant="outline" disabled={items.length === 0} onClick={() => show(true)}>
        {hasRule ? <PencilIcon aria-hidden /> : <PlusIcon aria-hidden />}
        {hasRule ? t`Change the target audience` : t`Add a target audience`}
      </Button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent closeLabel={t`Close`} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t`Target audience`}</DialogTitle>
            <DialogDescription>
              {t`Tick the answers that belong to the target. A response must pass every item with something ticked. Nothing is deleted: changing this brings responses back.`}
            </DialogDescription>
          </DialogHeader>
          {items.map((item) => (
            <fieldset key={item.id} className="grid gap-3">
              <legend className="mb-2 font-medium text-sm">{item.text}</legend>
              {item.options.map((option) => {
                const field = `${id}-${item.id}-${option}`
                return (
                  <div key={option} className="flex items-center gap-2">
                    <Checkbox
                      id={field}
                      checked={(accepted[item.id] ?? []).includes(option)}
                      onCheckedChange={(on) => toggle(item.id, option, on === true)}
                    />
                    <Label htmlFor={field} className="font-normal">
                      {option}
                    </Label>
                  </div>
                )
              })}
            </fieldset>
          ))}
          {summary.rule?.stale ? (
            <p className="text-sm">{t`This rule names an item or an option no longer in the questionnaire: that part is ignored.`}</p>
          ) : null}
          {save.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, save.error)}
            </p>
          ) : null}
          <DialogFooter>
            {hasRule ? (
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => void submit({}).catch(() => undefined)}
              >
                {t`Remove the target`}
              </Button>
            ) : null}
            <Button
              disabled={(!draft && !summary.rule?.stale) || save.isPending}
              onClick={() => void submit(accepted).catch(() => undefined)}
            >
              {t`Save the target`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
