import {
  type AccessHistoryEntry,
  getGetAccessHistoryQueryKey,
  getListMembersQueryKey,
  useChangeRole,
  useDeactivateMember,
  useDeleteMember,
  useGetAccessHistory,
  useGrantTeamAccess,
  useListMembers,
  useListTeams,
  useReactivateMember,
  useRemoveTeamAccess,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@goodresearch/ui/components/alert-dialog'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { PageBar, Pill } from '@goodresearch/ui/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import type { I18n } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../../../features/workspace/errors.ts'
import { useFormatDate } from '../../../features/workspace/format.ts'
import { DELETED_ACCOUNT, ROLE_LABELS } from '../../../features/workspace/member-labels.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/members/$memberId')({
  component: MemberDetail,
})

function MemberDetail() {
  const { t, i18n } = useLingui()
  const { me } = Route.useRouteContext()
  const { memberId } = Route.useParams()
  const isAdmin = me.role === 'admin'
  const queryClient = useQueryClient()
  const members = useListMembers({ query: { enabled: isAdmin } })
  const teams = useListTeams()
  const history = useGetAccessHistory(memberId, { query: { enabled: isAdmin } })
  const grant = useGrantTeamAccess()
  const revoke = useRemoveTeamAccess()
  const changeRole = useChangeRole()
  const deactivate = useDeactivateMember()
  const reactivate = useReactivateMember()
  const ids = { teams: useId(), role: useId() }

  if (!isAdmin) return <NotFound />
  if (members.isPending || teams.isPending) return <Skeleton className="h-40 w-full" />
  const member = members.data?.find((m) => m.id === memberId)
  if (!member) return <NotFound />
  const deleted = member.status === 'deleted'

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(errorMessage(i18n, error))
    } finally {
      await queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() })
      await queryClient.invalidateQueries({ queryKey: getGetAccessHistoryQueryKey(memberId) })
    }
  }

  return (
    <div className="grid gap-8 [&>*:not([data-slot=page-bar])]:max-w-3xl">
      <PageBar
        back={<Link to="/members" />}
        backLabel={t`Back to members`}
        crumbs={[<Link key="members" to="/members">{t`Members`}</Link>]}
        title={member.name ?? i18n._(DELETED_ACCOUNT)}
        right={member.email ? <Pill>{member.email}</Pill> : undefined}
      />

      {deleted ? null : (
        <>
          <fieldset className="grid gap-3">
            <legend id={ids.teams} className="text-lg font-medium">
              {t`Team access`}
            </legend>
            {teams.data?.map((team) => {
              const checked = member.teams.some((x) => x.id === team.id)
              const teamName = team.name
              const id = `team-${team.id}`
              return (
                <div key={team.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(next) =>
                      void run(
                        () =>
                          next
                            ? grant.mutateAsync({ memberId, teamId: team.id })
                            : revoke.mutateAsync({ memberId, teamId: team.id }),
                        next ? t`Access to ${teamName} granted` : t`Access to ${teamName} removed`,
                      )
                    }
                  />
                  <Label htmlFor={id}>{team.name}</Label>
                </div>
              )
            })}
          </fieldset>

          <section className="grid max-w-xs gap-2">
            <Label id={ids.role}>{t`Role`}</Label>
            <Select
              value={member.role}
              onValueChange={(role) => {
                if (role === 'admin' || role === 'member') {
                  void run(
                    () => changeRole.mutateAsync({ memberId, data: { role } }),
                    t`Role changed`,
                  )
                }
              }}
            >
              <SelectTrigger aria-labelledby={ids.role}>
                <SelectValue>
                  {(value: 'admin' | 'member') => i18n._(ROLE_LABELS[value])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{i18n._(ROLE_LABELS.member)}</SelectItem>
                <SelectItem value="admin">{i18n._(ROLE_LABELS.admin)}</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section className="flex flex-wrap gap-3">
            {member.status === 'active' ? (
              <Button
                variant="outline"
                onClick={() =>
                  void run(() => deactivate.mutateAsync({ memberId }), t`Account deactivated`)
                }
              >
                {t`Deactivate`}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  void run(() => reactivate.mutateAsync({ memberId }), t`Account reactivated`)
                }
              >
                {t`Reactivate`}
              </Button>
            )}
            <DeleteAccount memberId={memberId} email={member.email ?? ''} onDone={run} />
          </section>
        </>
      )}

      <section className="grid gap-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-medium">
          {t`Access history`}
        </h2>
        <ol className="grid gap-2">
          {history.data?.map((entry, index) => (
            <li
              key={`${entry.occurredAt}-${entry.type}-${index}`}
              className="rounded-md border p-3 text-sm"
            >
              <HistoryLine entry={entry} i18n={i18n} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function HistoryLine({ entry, i18n }: { entry: AccessHistoryEntry; i18n: I18n }) {
  const { t } = useLingui()
  const formatDate = useFormatDate()
  const actor = entry.actor ? (entry.actor.name ?? i18n._(DELETED_ACCOUNT)) : t`goodresearch`
  const teamName = String(entry.details.teamName ?? '')
  const to = entry.details.to === 'admin' ? i18n._(ROLE_LABELS.admin) : i18n._(ROLE_LABELS.member)
  const what = {
    account_created: t`Account created at first sign-in`,
    role_changed: t`Role changed to ${to}`,
    membership_granted: t`Access to ${teamName} granted`,
    membership_removed: t`Access to ${teamName} removed`,
    deactivated: t`Account deactivated`,
    reactivated: t`Account reactivated`,
    deleted: t`Account deleted`,
  }[entry.type]
  return (
    <>
      <span className="font-medium">{what}</span>
      <span className="text-muted-foreground">
        {' '}
        · {t`by ${actor}`} · {formatDate(entry.occurredAt)}
      </span>
    </>
  )
}

function DeleteAccount({
  memberId,
  email,
  onDone,
}: {
  memberId: string
  email: string
  onDone: (action: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const { t } = useLingui()
  const remove = useDeleteMember()
  const [confirmation, setConfirmation] = useState('')
  const [open, setOpen] = useState(false)
  const inputId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onDone(() => remove.mutateAsync({ memberId, data: { confirmation } }), t`Account deleted`)
    setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="destructive" />}
      >{t`Delete account`}</AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete this account?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The name and email are erased for good and the person can no longer sign in. Projects and history stay, shown as "Deleted account". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{t`Type ${email} to confirm`}</Label>
            <Input
              id={inputId}
              value={confirmation}
              autoComplete="off"
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirmation.trim().toLowerCase() !== email.toLowerCase()}
            >
              {t`Delete account`}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
