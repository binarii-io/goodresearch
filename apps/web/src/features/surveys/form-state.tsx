import {
  getListPublicationsQueryKey,
  type Publication,
  useCloseForm,
  useGetQuestionnaire,
  useOpenForm,
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
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'

/** Opening and closing the form (spec 028 US1): each is a person's confirmed decision. */
export function FormState({ studyId, publication }: { studyId: string; publication: Publication }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const formatRelative = useFormatRelative()
  const questionnaire = useGetQuestionnaire(studyId)
  const openForm = useOpenForm()
  const closeForm = useCloseForm()
  const [asking, setAsking] = useState(false)
  const linkId = useId()
  const form = publication.form
  const open = form?.acceptingResponses === true
  const busy = openForm.isPending || closeForm.isPending
  const marks = questionnaire.data?.readiness ?? []
  const left = [
    marks.some((m) => m.kind === 'review' && !m.changedSince)
      ? null
      : t`It has not been reviewed by another person.`,
    marks.some((m) => m.kind === 'pre-test' && !m.changedSince)
      ? null
      : t`It has not been pre-tested with naive participants.`,
  ].filter((x) => x !== null)

  const run = async () => {
    setAsking(false)
    const data = { publicationId: publication.id }
    try {
      await (open ? closeForm.mutateAsync(data) : openForm.mutateAsync(data))
      toast.success(open ? t`Form closed` : t`Form open to responses`)
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
    } finally {
      await queryClient.invalidateQueries({ queryKey: getListPublicationsQueryKey(studyId) })
    }
  }

  const who = open ? form?.openedBy : form?.closedBy
  const at = open ? form?.openedAt : form?.closedAt
  const when = at ? formatRelative(at) : ''

  return (
    <section aria-label={t`State of the form`} className="grid gap-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={open ? 'default' : 'ghost'}>
            {open ? t`Open to responses` : t`Closed to responses`}
          </Badge>
          {at ? (
            <span className="text-muted-foreground text-xs">
              {who ? (open ? t`Opened by ${who} ${when}` : t`Closed by ${who} ${when}`) : when}
            </span>
          ) : null}
        </div>
        <Button
          size="sm"
          variant={open ? 'outline' : 'default'}
          disabled={busy}
          onClick={() => setAsking(true)}
        >
          {open ? t`Close the form` : t`Open the form`}
        </Button>
      </div>
      {open && form?.responderLink ? (
        <div className="grid gap-1.5">
          <Label htmlFor={linkId}>{t`Link to share with participants`}</Label>
          <div className="flex gap-2">
            <Input id={linkId} readOnly value={form.responderLink} />
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(form.responderLink ?? '')
                  .then(() => toast.success(t`Link copied`))
              }
            >
              {t`Copy`}
            </Button>
          </div>
        </div>
      ) : null}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{open ? t`Close the form?` : t`Open the form?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {open
                ? t`People will see that it is closed. The responses already received stay.`
                : t`Anyone with the link can then answer. Once responses arrive, items can no longer be removed or change kind.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!open && left.length ? (
            <ul className="ml-5 list-disc text-sm">
              {left.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run()}>
              {open ? t`Close the form` : t`Open the form`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
