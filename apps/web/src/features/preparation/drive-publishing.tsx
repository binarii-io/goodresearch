import {
  getListPublicationsQueryKey,
  type Publication,
  useCheckPublication,
  useForgetPublication,
  useListMySources,
  useListPublications,
  usePublishPreparation,
  useUpdatePublication,
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
import { GoogleDriveIcon } from '@goodresearch/ui/components/source-icons'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { normalise } from '../../app/i18n.ts'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { DriveReview } from './drive-review.tsx'

const KINDS: Record<Publication['kind'], MessageDescriptor> = {
  guide: msg`Interview guide`,
  'best-practices': msg`Interview best practices`,
  schedule: msg`Interview schedule`,
  questionnaire: msg`Questionnaire`,
}

const STATES: Record<Publication['state'], MessageDescriptor> = {
  'in-sync': msg`In sync`,
  'out-of-date': msg`Out of date: changed in the app`,
  'changed-in-drive': msg`Changed in Drive: to review`,
  conflict: msg`Conflict: changed in the app and in Drive`,
  unavailable: msg`Unavailable in Drive`,
}

const REASONS: Record<NonNullable<Publication['unavailableReason']>, MessageDescriptor> = {
  missing: msg`The file was deleted, or you cannot open it.`,
  trashed: msg`The file is in the trash.`,
  moved: msg`The file was moved out of the study folder.`,
}

/** Goes to Google's consent for editing, then back to this tab (spec 007 FR-002). */
export const askWriteConsent = (studyId: string) => {
  const back = `/studies/${studyId}?phase=preparation`
  window.location.assign(
    `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(back)}`,
  )
}

type DetailOfResponses = { items?: string[]; responses?: number }

/** What the last check read of a form (spec 027 FR-014, FR-017, FR-024). */
function FormFacts({ form }: { form: NonNullable<Publication['form']> }) {
  const { t } = useLingui()
  return (
    <div className="grid gap-1 text-sm">
      {form.collectsIdentity ? (
        <p role="alert" className="text-destructive">
          {t`This form collects the respondents' email addresses. Turn this off in the form's settings: the questionnaire promises anonymity, and it will not open while this stays on.`}
        </p>
      ) : null}
      <p>
        {form.acceptingResponses ? t`Open to responses.` : t`Closed to responses until Fieldwork.`}
      </p>
      {form.linkedSheetLink ? (
        <p>
          <a className="underline" href={form.linkedSheetLink} target="_blank" rel="noreferrer">
            {t`Open the results spreadsheet`}
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">{t`No results spreadsheet yet. To have one for your team, open the form, go to Responses, and choose "Link to Sheets". The app does not need it.`}</p>
      )}
      <p className="text-muted-foreground text-xs">{t`If you use the contact item, deleting the addresses in the form and its spreadsheet is up to your team.`}</p>
    </div>
  )
}

function PublicationRow({ studyId, publication }: { studyId: string; publication: Publication }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const formatRelative = useFormatRelative()
  const check = useCheckPublication()
  const update = useUpdatePublication()
  const forget = useForgetPublication()
  const [reviewing, setReviewing] = useState(false)
  const [replace, setReplace] = useState(false)
  const [reworded, setReworded] = useState<DetailOfResponses | null>(null)
  const [blocked, setBlocked] = useState<string[]>([])
  const replacing = useRef(false)
  const [owner, setOwner] = useState<string | null>(null)
  const p = publication
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListPublicationsQueryKey(studyId) })
  const toReview = p.counts.fromDrive + p.counts.conflicts + p.counts.notUnderstood
  const when = p.lastCheckedAt ? formatRelative(p.lastCheckedAt) : null

  const runUpdate = async (replaceDriveChanges: boolean, confirmRewording = false) => {
    setBlocked([])
    // Both can be asked in a row: the second question keeps the first answer.
    replacing.current = replaceDriveChanges
    try {
      await update.mutateAsync({
        publicationId: p.id,
        data: { replaceDriveChanges, confirmRewording },
      })
      toast.success(t`Updated in Drive`)
    } catch (failure) {
      const code = errorCode(failure)
      if (code === 'DRIVE_WRITE_REQUIRED') return askWriteConsent(studyId)
      if (code === 'DRIVE_CHANGES_PENDING') return setReplace(true)
      // Spec 028: what responses already answered.
      const detail = (failure as { problem?: { detail?: DetailOfResponses } }).problem?.detail
      if (code === 'REWORDING_TO_CONFIRM') return setReworded(detail ?? {})
      if (code === 'RESPONSES_BLOCK_UPDATE') setBlocked(detail?.items ?? [])
      if (code === 'DRIVE_CANNOT_EDIT') {
        const checked = await check.mutateAsync({ publicationId: p.id }).catch(() => null)
        setOwner(checked?.access?.owner ?? null)
      }
      toast.error(errorMessage(i18n, failure))
    } finally {
      await refresh()
    }
  }

  return (
    <div className="grid gap-2 rounded-md border bg-card p-3">
      {p.form ? <FormFacts form={p.form} /> : null}
      {blocked.length ? (
        <div role="alert" className="grid gap-1 text-sm">
          <p>{t`This form has responses, and this change would detach them from these items. Undo it in the questionnaire to update the form:`}</p>
          <ul className="ml-5 list-disc">
            {blocked.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <AlertDialog
        open={reworded !== null}
        onOpenChange={(next) => (next ? undefined : setReworded(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Reword items that have responses?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`${reworded?.responses ?? 0} responses answered the former wording, which stays attached to them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="ml-5 list-disc text-sm">
            {(reworded?.items ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setReworded(null)
                void runUpdate(replacing.current, true)
              }}
            >
              {t`Update in Drive`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <GoogleDriveIcon />
          <span className="truncate">{p.fileName}</span>
        </span>
        <Badge variant="ghost">{i18n._(STATES[p.state])}</Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {p.state === 'unavailable' && p.unavailableReason
          ? `${i18n._(REASONS[p.unavailableReason])} `
          : null}
        {toReview ? t`${toReview} changes from Drive to review. ` : null}
        {p.counts.rejected
          ? t`${p.counts.rejected} Drive changes will be replaced at the next update. `
          : null}
        {p.lastEditor ? t`Last edited in Drive by ${p.lastEditor}. ` : null}
        {when ? t`Checked ${when}.` : null}
      </p>
      {owner ? (
        <p
          role="alert"
          className="text-destructive text-sm"
        >{t`You can view this file in Drive but not edit it. Ask ${owner}, who owns it.`}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={check.isPending}
          onClick={() =>
            void check
              .mutateAsync({ publicationId: p.id })
              .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
              .then(refresh)
          }
        >
          {t`Check now`}
        </Button>
        {toReview ? (
          <Button size="sm" onClick={() => setReviewing(true)}>
            {t`Review the changes from Drive`}
          </Button>
        ) : null}
        {p.state !== 'in-sync' && p.state !== 'unavailable' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => void runUpdate(false)}
          >
            {t`Update in Drive`}
          </Button>
        ) : null}
        {p.state === 'unavailable' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void forget
                .mutateAsync({ publicationId: p.id })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                .then(refresh)
            }
          >
            {t`Forget this file`}
          </Button>
        ) : null}
      </div>
      {reviewing ? (
        <DriveReview studyId={studyId} publication={p} open onOpenChange={setReviewing} />
      ) : null}
      <AlertDialog open={replace} onOpenChange={setReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Replace the Drive version?`}</AlertDialogTitle>
            <AlertDialogDescription>{t`${toReview} changes made in Drive have not been reviewed. Updating replaces them with the app's version.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Review them first`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runUpdate(true)}
            >{t`Replace the Drive version`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The publication of one element, and what publishing it needs (shared by the two parts). */
export const useDrivePublication = (studyId: string, kind: Publication['kind']) => {
  const list = useListPublications(studyId)
  const sources = useListMySources()
  return {
    // Both known: never sent to Google's consent while the person's access is still loading.
    ready: list.isSuccess && sources.isSuccess,
    publication: list.data?.find((p) => p.kind === kind),
    canWrite: sources.data?.[0]?.canWrite ?? false,
  }
}

/**
 * The Drive button of one preparation element, in its row of actions (spec 007): "Publish to
 * Drive", then "Open in Drive" once published. Files are written with the person's own access.
 */
export function DriveButton({
  studyId,
  kind,
  available = true,
  size = 'sm',
}: {
  studyId: string
  kind: Publication['kind']
  /** False while there is nothing to publish (no guide yet). */
  available?: boolean
  /** The size of the other buttons of the row. */
  size?: 'sm' | 'default'
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const publish = usePublishPreparation()
  const { ready, publication, canWrite } = useDrivePublication(studyId, kind)

  const run = async () => {
    if (!canWrite) return askWriteConsent(studyId)
    try {
      await publish.mutateAsync({
        studyId,
        data: {
          kinds: [kind],
          language: normalise(i18n.locale),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      toast.success(t`Published to Drive`)
    } catch (failure) {
      if (errorCode(failure) === 'DRIVE_WRITE_REQUIRED') return askWriteConsent(studyId)
      toast.error(errorMessage(i18n, failure))
    } finally {
      await queryClient.invalidateQueries({ queryKey: getListPublicationsQueryKey(studyId) })
    }
  }

  // Without access to the folder (or no folder), the tab explains it elsewhere.
  if (!ready) return null
  if (publication)
    return (
      <Button
        size={size}
        variant="outline"
        render={
          <a
            href={publication.webLink}
            target="_blank"
            rel="noreferrer"
            aria-label={t`Open in Drive: ${i18n._(KINDS[kind])}`}
          />
        }
      >
        <GoogleDriveIcon />
        {t`Open in Drive`}
      </Button>
    )
  if (!available) return null
  return (
    <Button
      size={size}
      variant="outline"
      onClick={() => void run()}
      disabled={publish.isPending}
      title={
        canWrite
          ? undefined
          : t`Google will ask you to let goodresearch edit the Drive files you can edit.`
      }
    >
      <GoogleDriveIcon />
      {t`Publish to Drive`}
    </Button>
  )
}

/** Under the element, once published: the file's state, and check, review and update. */
export function DriveStatus({ studyId, kind }: { studyId: string; kind: Publication['kind'] }) {
  const { t, i18n } = useLingui()
  const { publication } = useDrivePublication(studyId, kind)
  if (!publication) return null
  return (
    <fieldset aria-label={t`${i18n._(KINDS[kind])} in Drive`} className="m-0 min-w-0 border-0 p-0">
      <PublicationRow studyId={studyId} publication={publication} />
    </fieldset>
  )
}
