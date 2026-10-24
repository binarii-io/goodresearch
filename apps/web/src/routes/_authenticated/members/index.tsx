import { useListMembers } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
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
import { createFileRoute, Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useFormatDate } from '../../../features/workspace/format.ts'
import {
  DELETED_ACCOUNT,
  ROLE_LABELS,
  STATUS_LABELS,
} from '../../../features/workspace/member-labels.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/members/')({ component: Members })

function Members() {
  const { t, i18n } = useLingui()
  const { me } = Route.useRouteContext()
  const members = useListMembers({ query: { enabled: me.role === 'admin' } })
  const formatDate = useFormatDate()
  const [search, setSearch] = useState('')
  const searchId = useId()

  if (me.role !== 'admin') return <NotFound />

  const needle = search.trim().toLowerCase()
  const visible = (members.data ?? []).filter(
    (m) =>
      !needle || m.name?.toLowerCase().includes(needle) || m.email?.toLowerCase().includes(needle),
  )

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t`Members`}</h1>
      <p className="text-muted-foreground max-w-2xl">
        {t`People join by signing in with an allowed email. Give them access to one or more teams to let them work on those teams' projects.`}
      </p>
      <div className="grid max-w-sm gap-2">
        <Label htmlFor={searchId}>{t`Search by name or email`}</Label>
        <Input
          id={searchId}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {members.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t`Name`}</TableHead>
              <TableHead>{t`Email`}</TableHead>
              <TableHead>{t`Role`}</TableHead>
              <TableHead>{t`Teams`}</TableHead>
              <TableHead>{t`Provider`}</TableHead>
              <TableHead>{t`Last sign-in`}</TableHead>
              <TableHead>{t`Status`}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((member) => {
              const noTeam =
                member.status === 'active' && member.role === 'member' && member.teams.length === 0
              return (
                <TableRow
                  key={member.id}
                  data-no-team={noTeam || undefined}
                  className="data-[no-team]:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      to="/members/$memberId"
                      params={{ memberId: member.id }}
                      className="underline"
                    >
                      {member.name ?? i18n._(DELETED_ACCOUNT)}
                    </Link>
                  </TableCell>
                  <TableCell>{member.email ?? '—'}</TableCell>
                  <TableCell>{i18n._(ROLE_LABELS[member.role])}</TableCell>
                  <TableCell>
                    {noTeam ? (
                      <Badge variant="outline">{t`No team yet`}</Badge>
                    ) : (
                      member.teams.map((team) => team.name).join(', ')
                    )}
                  </TableCell>
                  <TableCell>{member.provider ?? '—'}</TableCell>
                  <TableCell>{formatDate(member.lastSignInAt)}</TableCell>
                  <TableCell>{i18n._(STATUS_LABELS[member.status])}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
