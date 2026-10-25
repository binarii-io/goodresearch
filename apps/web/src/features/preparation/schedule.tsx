import {
  getListPlannedInterviewsQueryKey,
  type PlannedInterview,
  useAddPlannedInterview,
  useDeletePlannedInterview,
  useListPlannedInterviews,
  useUpdatePlannedInterview,
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
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { DownloadIcon, PencilIcon, PlusIcon, Trash2Icon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Pill } from '@goodresearch/ui/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { downloadText, slug } from './download.ts'
import { DriveButton, DriveStatus } from './drive-publishing.tsx'
import { PLANNED_STATUSES, type PlannedStatus } from './labels.ts'

type Form = {
  interviewee: string
  role: string
  interviewers: string
  /** `datetime-local` value, in the browser's time zone. */
  when: string
  status: PlannedStatus
  notes: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EMPTY: Form = {
  interviewee: '',
  role: '',
  interviewers: '',
  when: '',
  status: 'to-contact',
  notes: '',
}

/**
 * One CSV cell. A text starting like a formula (=, +, -, @, tab, return) is prefixed with an
 * apostrophe, so a spreadsheet shows it instead of running it (PR #6 review).
 */
const csvCell = (raw: string) => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function PlannedInterviewDialog({
  studyId,
  row,
  open,
  onOpenChange,
}: {
  studyId: string
  row: PlannedInterview | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const add = useAddPlannedInterview()
  const update = useUpdatePlannedInterview()
  const [form, setForm] = useState<Form>(() =>
    row
      ? {
          interviewee: row.interviewee,
          role: row.role,
          interviewers: row.interviewers,
          when: toLocalInput(row.scheduledAt),
          status: row.status,
          notes: row.notes,
        }
      : EMPTY,
  )
  const [touched, setTouched] = useState(false)
  const ids = {
    interviewee: useId(),
    role: useId(),
    interviewers: useId(),
    when: useId(),
    status: useId(),
    notes: useId(),
    missing: useId(),
  }
  const missing = touched && !form.interviewee.trim()
  const failure = add.error ?? update.error

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!form.interviewee.trim()) return
    const data = {
      interviewee: form.interviewee,
      role: form.role,
      interviewers: form.interviewers,
      scheduledAt: form.when ? new Date(form.when).toISOString() : null,
      status: form.status,
      notes: form.notes,
    }
    if (row)
      await update.mutateAsync({
        plannedInterviewId: row.id,
        data: { ...data, version: row.version },
      })
    else await add.mutateAsync({ studyId, data })
    await queryClient.invalidateQueries({ queryKey: getListPlannedInterviewsQueryKey(studyId) })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t`Close`}>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => void submit(e).catch(() => undefined)}
        >
          <DialogHeader>
            <DialogTitle>{row ? t`Edit the interview` : t`Plan an interview`}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.interviewee}>{t`Person to interview`}</Label>
            <Input
              id={ids.interviewee}
              value={form.interviewee}
              maxLength={120}
              onChange={(e) => setForm({ ...form, interviewee: e.target.value })}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? ids.missing : undefined}
            />
            {missing ? (
              <p id={ids.missing} className="text-destructive text-sm">
                {t`Enter who you will interview.`}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.role}>{t`Role`}</Label>
              <Input
                id={ids.role}
                value={form.role}
                maxLength={120}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.interviewers}>{t`Interviewer(s)`}</Label>
              <Input
                id={ids.interviewers}
                value={form.interviewers}
                maxLength={200}
                onChange={(e) => setForm({ ...form, interviewers: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.when}>{t`Date and time`}</Label>
              <Input
                id={ids.when}
                type="datetime-local"
                value={form.when}
                onChange={(e) => setForm({ ...form, when: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label id={ids.status}>{t`Status`}</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  value && setForm({ ...form, status: value as PlannedStatus })
                }
              >
                <SelectTrigger aria-labelledby={ids.status}>
                  <SelectValue>
                    {(value: PlannedStatus) => i18n._(PLANNED_STATUSES[value])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLANNED_STATUSES) as PlannedStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {i18n._(PLANNED_STATUSES[status])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.notes}>{t`Notes`}</Label>
            <Textarea
              id={ids.notes}
              value={form.notes}
              maxLength={2000}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {failure ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, failure)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={add.isPending || update.isPending}>
              {row ? t`Save` : t`Add to the schedule`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The interview schedule of the study (US5): who to interview, when, by whom, and where it
 * stands. Shared with whoever can act on the study; never sent to the assistant.
 */
export function InterviewSchedule({ studyId, studyName }: { studyId: string; studyName: string }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const list = useListPlannedInterviews(studyId)
  const remove = useDeletePlannedInterview()
  const [editing, setEditing] = useState<{ row: PlannedInterview | null; n: number } | null>(null)
  const rows = list.data ?? []
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' })
  const counts = (Object.keys(PLANNED_STATUSES) as PlannedStatus[])
    .map((status) => [status, rows.filter((r) => r.status === status).length] as const)
    .filter(([, n]) => n > 0)

  const exportCsv = () => {
    const header = [
      t`Person to interview`,
      t`Role`,
      t`Interviewer(s)`,
      t`Date and time`,
      t`Status`,
      t`Notes`,
    ]
    const lines = rows.map((r) => [
      r.interviewee,
      r.role,
      r.interviewers,
      r.scheduledAt ? date.format(new Date(r.scheduledAt)) : '',
      i18n._(PLANNED_STATUSES[r.status]),
      r.notes,
    ])
    downloadText(
      `${slug(studyName)}-${t`schedule`}.csv`,
      `﻿${[header, ...lines].map((l) => l.map(csvCell).join(',')).join('\n')}\n`,
      'text/csv',
    )
  }

  return (
    <section aria-labelledby="schedule-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle id="schedule-heading" count={rows.length}>
          {t`Interview schedule`}
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}>
            <DownloadIcon aria-hidden />
            {t`Download (CSV)`}
          </Button>
          <Button size="sm" onClick={() => setEditing({ row: null, n: Date.now() })}>
            <PlusIcon aria-hidden />
            {t`Plan an interview`}
          </Button>
          <DriveButton studyId={studyId} kind="schedule" />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">{t`Who to interview, when and by whom. Shared with the people who can open this study; never sent to the assistant.`}</p>
      <DriveStatus studyId={studyId} kind="schedule" />
      {counts.length ? (
        <ul aria-label={t`Interviews per status`} className="flex flex-wrap gap-2">
          {counts.map(([status, n]) => (
            <li key={status}>
              <Pill>
                {i18n._(PLANNED_STATUSES[status])} · {n}
              </Pill>
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t`Person to interview`}</TableHead>
                <TableHead>{t`Role`}</TableHead>
                <TableHead>{t`Interviewer(s)`}</TableHead>
                <TableHead>{t`Date and time`}</TableHead>
                <TableHead>{t`Status`}</TableHead>
                <TableHead>{t`Notes`}</TableHead>
                <TableHead>
                  <span className="sr-only">{t`Actions`}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.interviewee}</TableCell>
                  <TableCell>{r.role}</TableCell>
                  <TableCell>{r.interviewers}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.scheduledAt ? date.format(new Date(r.scheduledAt)) : '—'}
                  </TableCell>
                  <TableCell>{i18n._(PLANNED_STATUSES[r.status])}</TableCell>
                  <TableCell className="max-w-56 truncate" title={r.notes}>
                    {r.notes}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Edit ${r.interviewee}`}
                      onClick={() => setEditing({ row: r, n: Date.now() })}
                    >
                      <PencilIcon aria-hidden />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t`Delete ${r.interviewee}`}
                          />
                        }
                      >
                        <Trash2Icon aria-hidden />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t`Remove this interview from the schedule?`}</AlertDialogTitle>
                          <AlertDialogDescription>{r.interviewee}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              void remove
                                .mutateAsync({ plannedInterviewId: r.id })
                                .catch((failure: unknown) =>
                                  toast.error(errorMessage(i18n, failure)),
                                )
                                .then(() =>
                                  queryClient.invalidateQueries({
                                    queryKey: getListPlannedInterviewsQueryKey(studyId),
                                  }),
                                )
                            }
                          >
                            {t`Remove`}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : list.isSuccess ? (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">{t`No interview planned yet.`}</p>
      ) : null}
      {editing ? (
        <PlannedInterviewDialog
          key={editing.n}
          studyId={studyId}
          row={editing.row}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        />
      ) : null}
    </section>
  )
}
