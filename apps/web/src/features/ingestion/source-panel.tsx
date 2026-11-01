import {
  getGetStudySourceQueryKey,
  getListInventoryFilesQueryKey,
  type StudySourceView,
  useAttachFolder,
  useDetachFolder,
  useGetStudySource,
  useListInventoryFiles,
  useListMySources,
  useRefreshInventory,
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
  AlertDialogTrigger,
} from '@goodresearch/ui/components/alert-dialog'
import { Button } from '@goodresearch/ui/components/button'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'

type Inventory = NonNullable<StudySourceView['source']>['inventory']

export const connectUrl = (
  studyId: string,
  phase?: 'preparation',
  access: 'read' | 'write' = 'read',
) =>
  `/api/sources/google-drive/connect?${access === 'write' ? 'access=write&' : ''}returnTo=${encodeURIComponent(
    `/studies/${studyId}${phase ? `?phase=${phase}` : ''}`,
  )}`

/**
 * The Drive folder of an interview study and its inventory (spec 002 US2, US3), in the Fieldwork
 * phase. `interviews`: how many interviews a new or detached folder discards (spec 008 FR-012).
 */
export function SourcePanel({
  studyId,
  isAdmin,
  interviews = 0,
  showFiles = true,
}: {
  studyId: string
  isAdmin: boolean
  interviews?: number
  /** False in the folder dialog: the interviews show what the folder holds. */
  showFiles?: boolean
}) {
  const { t } = useLingui()
  const view = useGetStudySource(studyId, {
    query: {
      // Live progress while an inventory runs (FR-015).
      refetchInterval: (query) =>
        query.state.data?.source?.inventory.status === 'running' ? 2000 : false,
    },
  })

  if (view.isPending) return <Skeleton className="h-24 w-full" />
  if (!view.data) return null
  const data = view.data

  if (!data.driveConfigured && !data.source) {
    return (
      <p className="text-muted-foreground">{t`Google Drive is not configured on this instance, so no folder can be attached yet.`}</p>
    )
  }
  // Only when a folder is attached: the person's own Drive access must be checked (FR-010c).
  if (data.access === 'drive-not-connected') return <ConnectDrive studyId={studyId} attached />
  if (data.access === 'drive-unavailable') {
    return (
      <p role="status" className="text-muted-foreground">
        {t`Google Drive did not answer, so access to this study's folder could not be checked. Try again in a moment.`}
      </p>
    )
  }
  if (data.access === 'no-folder-access')
    return <NoFolderAccess studyId={studyId} owner={data.folderOwner} isAdmin={isAdmin} />
  if (!data.source) return <NewSource studyId={studyId} />
  return (
    <AttachedFolder
      studyId={studyId}
      source={data.source}
      interviews={interviews}
      showFiles={showFiles}
    />
  )
}

function ConnectDrive({ studyId, attached }: { studyId: string; attached: boolean }) {
  const { t } = useLingui()
  return (
    <div className="grid max-w-2xl gap-3 rounded-md border p-4">
      <h3 className="font-medium">{t`Connect your Google Drive`}</h3>
      <DriveExplanation />
      {attached ? (
        <p className="text-sm">{t`A folder is attached to this study: connect your Drive to see it.`}</p>
      ) : null}
      <Button render={<a href={connectUrl(studyId)} />} className="justify-self-start">
        {t`Continue to Google`}
      </Button>
    </div>
  )
}

/** FR-007: what the permission allows, before sending people to Google. */
export function DriveExplanation() {
  const { t } = useLingui()
  return (
    <ul className="text-muted-foreground list-disc pl-5 text-sm">
      <li>{t`goodresearch asks Google for read-only access to your Drive, separate from signing in.`}</li>
      <li>{t`For now it only reads the names, types, dates and sizes of the files in the folders you attach; file content will be read when transcripts are imported.`}</li>
      <li>{t`Nothing is created or changed in your Drive unless you publish a study's preparation, which asks separately for editing. Nothing is ever deleted. You can disconnect at any time from Connected sources.`}</li>
    </ul>
  )
}

function NoFolderAccess({
  studyId,
  owner,
  isAdmin,
}: {
  studyId: string
  owner: string | null
  isAdmin: boolean
}) {
  const { t } = useLingui()
  const ownerName = owner ?? t`its owner`
  return (
    <div className="grid max-w-2xl gap-3 rounded-md border p-4" role="status">
      <h3 className="font-medium">{t`You do not have access to this study's folder`}</h3>
      <p>{t`Ask ${ownerName} to share the folder with your Google account in Drive. Access is checked again when you come back to this page.`}</p>
      {isAdmin ? <DetachFolder studyId={studyId} /> : null}
    </div>
  )
}

/** No folder yet: connect Drive first if needed, then paste the folder link. */
function NewSource({ studyId }: { studyId: string }) {
  const sources = useListMySources()
  if (sources.isPending) return <Skeleton className="h-16 w-full" />
  const drive = sources.data?.find((s) => s.connector === 'google-drive')
  return drive?.status === 'connected' ? (
    <AttachFolder studyId={studyId} />
  ) : (
    <ConnectDrive studyId={studyId} attached={false} />
  )
}

function AttachFolder({
  studyId,
  replacing = false,
  interviews = 0,
  onDone,
}: {
  studyId: string
  replacing?: boolean
  interviews?: number
  onDone?: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const attach = useAttachFolder()
  const [link, setLink] = useState('')
  const ids = { link: useId(), error: useId(), hint: useId() }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await attach.mutateAsync({ studyId, data: { link } })
    await queryClient.invalidateQueries({ queryKey: getGetStudySourceQueryKey(studyId) })
    onDone?.()
  }

  return (
    <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="grid max-w-2xl gap-2">
      {replacing ? null : <DriveExplanation />}
      {replacing && interviews > 0 ? (
        <p className="text-sm">{t`Another folder replaces the inventory and discards the ${interviews} interviews found, with their links and decisions. Nothing changes in Drive.`}</p>
      ) : null}
      <Label htmlFor={ids.link}>{t`Link of the Drive folder`}</Label>
      <p id={ids.hint} className="text-muted-foreground text-sm">
        {t`Open the folder in Google Drive and copy the address from your browser.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          id={ids.link}
          className="min-w-72 flex-1"
          value={link}
          placeholder="https://drive.google.com/drive/folders/…"
          onChange={(e) => setLink(e.target.value)}
          aria-describedby={attach.isError ? `${ids.hint} ${ids.error}` : ids.hint}
          aria-invalid={attach.isError || undefined}
        />
        <Button type="submit" disabled={attach.isPending || link.trim().length === 0}>
          {replacing ? t`Replace folder` : t`Attach folder`}
        </Button>
      </div>
      {attach.isError ? (
        <p id={ids.error} role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, attach.error)}
        </p>
      ) : null}
    </form>
  )
}

function DetachFolder({ studyId, interviews = 0 }: { studyId: string; interviews?: number }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const detach = useDetachFolder()
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" className="justify-self-start" />}
      >{t`Detach folder`}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Detach this folder?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {interviews > 0
              ? t`The inventory and the ${interviews} interviews found, with their links and decisions, are removed from goodresearch. Nothing changes in Drive.`
              : t`The inventory is removed from goodresearch. Nothing changes in Drive.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void detach
                .mutateAsync({ studyId })
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: getGetStudySourceQueryKey(studyId) }),
                )
            }
          >
            {t`Detach`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AttachedFolder({
  studyId,
  source,
  interviews,
  showFiles,
}: {
  studyId: string
  source: NonNullable<StudySourceView['source']>
  interviews: number
  showFiles: boolean
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const refresh = useRefreshInventory()
  const [replacing, setReplacing] = useState(false)
  const formatDate = useFormatDate()
  const folderName = source.folderName
  const owner = source.ownerName ?? '—'

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={source.webViewLink}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline"
        >
          {folderName}
        </a>
        <span className="text-muted-foreground text-sm">{t`Owner: ${owner}`}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={source.inventory.status === 'running' || refresh.isPending}
          onClick={() =>
            void refresh
              .mutateAsync({ studyId })
              .then(() =>
                queryClient.invalidateQueries({ queryKey: getGetStudySourceQueryKey(studyId) }),
              )
              .catch(() => undefined)
          }
        >
          {t`Refresh`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setReplacing((v) => !v)}>
          {t`Replace folder`}
        </Button>
        <DetachFolder studyId={studyId} interviews={interviews} />
      </div>
      {refresh.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, refresh.error)}
        </p>
      ) : null}
      {replacing ? (
        <AttachFolder
          studyId={studyId}
          replacing
          interviews={interviews}
          onDone={() => setReplacing(false)}
        />
      ) : null}
      <InventoryStatus inventory={source.inventory} formatDate={formatDate} />
      {showFiles && source.inventory.lastSuccessAt ? (
        <InventoryFiles studyId={studyId} inventory={source.inventory} />
      ) : null}
    </div>
  )
}

function InventoryStatus({
  inventory,
  formatDate,
}: {
  inventory: Inventory
  formatDate: (iso: string | null) => string
}) {
  const { t } = useLingui()
  const files = inventory.progress?.files ?? 0
  const folders = inventory.progress?.folders ?? 0
  const when = formatDate(inventory.lastSuccessAt)
  const who = inventory.runBy?.name ?? '—'
  const reasons: Record<string, string> = {
    FOLDER_NOT_FOUND: t`the folder no longer exists or is no longer shared with the person who refreshed`,
    ACCESS_LOST: t`the Google Drive permission was revoked; reconnect from Connected sources`,
    INCOMPLETE: t`Google Drive returned an incomplete listing; try again later`,
    DRIVE_ERROR: t`Google Drive did not answer; try again later`,
    NOT_STARTED: t`it could not be started; try again in a moment`,
    INTERRUPTED: t`it stopped before the end; refresh to run it again`,
  }
  const reason = inventory.failure ? (reasons[inventory.failure] ?? inventory.failure) : ''
  return (
    <div aria-live="polite" className="text-sm">
      {inventory.status === 'running' ? (
        <p>{t`Inventory in progress: ${files} files in ${folders} sub-folders so far…`}</p>
      ) : inventory.status === 'failed' ? (
        <p role="alert" className="text-destructive">
          {inventory.outdated
            ? t`The last refresh failed (${reason}). The list below is from ${when}.`
            : t`The inventory failed (${reason}).`}
        </p>
      ) : inventory.status === 'done' ? (
        <p className="text-muted-foreground">{t`Last inventory ${when} by ${who}.`}</p>
      ) : null}
    </div>
  )
}

const ALL = 'all'

function InventoryFiles({ studyId, inventory }: { studyId: string; inventory: Inventory }) {
  const { t } = useLingui()
  const [kind, setKind] = useState<string>(ALL)
  const [group, setGroup] = useState<string>(ALL)
  const ids = { kind: useId(), group: useId() }
  const params = {
    ...(kind !== ALL ? { kind: kind as 'transcript' | 'media' | 'other' } : {}),
    ...(group !== ALL ? { group } : {}),
  }
  const files = useListInventoryFiles(studyId, params, {
    query: {
      queryKey: [...getListInventoryFilesQueryKey(studyId, params), inventory.lastSuccessAt],
    },
  })
  const formatDate = useFormatDate()
  const totals = inventory.totals
  const kindLabels: Record<string, string> = {
    transcript: t`Transcript`,
    media: t`Media`,
    other: t`Other`,
  }
  const { transcript, media, other } = totals.byKind

  return (
    <section className="grid gap-3" aria-labelledby="inventory-heading">
      <h3 id="inventory-heading" className="font-medium">
        {t`Inventory`}
      </h3>
      <p className="text-sm">{t`${transcript} transcripts · ${media} media · ${other} other files`}</p>
      <div className="flex flex-wrap gap-3">
        <div className="grid gap-1">
          <Label id={ids.kind}>{t`Kind`}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v ?? ALL)}>
            <SelectTrigger aria-labelledby={ids.kind} className="min-w-40">
              <SelectValue>{(v: string) => (v === ALL ? t`All kinds` : kindLabels[v])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t`All kinds`}</SelectItem>
              {Object.entries(kindLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label id={ids.group}>{t`Group`}</Label>
          <Select value={group} onValueChange={(v) => setGroup(v ?? ALL)}>
            <SelectTrigger aria-labelledby={ids.group} className="min-w-40">
              <SelectValue>{(v: string) => (v === ALL ? t`All groups` : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t`All groups`}</SelectItem>
              {totals.byGroup.map((g) => (
                <SelectItem key={g.group} value={g.group}>
                  {g.group} ({g.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t`Name`}</TableHead>
            <TableHead>{t`Kind`}</TableHead>
            <TableHead>{t`Group`}</TableHead>
            <TableHead>{t`Modified`}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.data?.map((file) => (
            <TableRow key={file.id}>
              <TableCell>
                <a href={file.webViewLink} target="_blank" rel="noreferrer" className="underline">
                  {file.name}
                </a>
              </TableCell>
              <TableCell>{kindLabels[file.kind]}</TableCell>
              <TableCell>{file.group}</TableCell>
              <TableCell>{formatDate(file.modifiedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
