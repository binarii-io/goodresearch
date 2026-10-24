import {
  getListTeamsQueryKey,
  type TeamDetail,
  useDeleteTeam,
  useListTeams,
  useRenameTeam,
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
import { Card, CardContent, CardHeader, CardTitle } from '@goodresearch/ui/components/card'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { errorMessage } from '../../features/workspace/errors.ts'
import { CreateTeamForm } from '../../features/workspace/first-team.tsx'
import { useMe } from '../../features/workspace/me.ts'

export const Route = createFileRoute('/_authenticated/teams')({ component: Teams })

function Teams() {
  const { t } = useLingui()
  const me = useMe()
  const teams = useListTeams()
  const admin = me.role === 'admin'

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t`Teams`}</h1>
      {admin ? <CreateTeamForm submitLabel={t`Add team`} /> : null}
      {teams.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : teams.data?.length ? (
        <ul className="grid gap-3 md:grid-cols-2" aria-label={t`Teams`}>
          {teams.data.map((team) => (
            <li key={team.id}>
              <TeamCard team={team} admin={admin} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t`You are not in any team yet.`}</p>
      )}
    </div>
  )
}

function TeamCard({ team, admin }: { team: TeamDetail; admin: boolean }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const rename = useRenameTeam()
  const remove = useDeleteTeam()
  const [error, setError] = useState<unknown>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() })
  const teamName = team.name
  const projects = plural(team.projectCount, { one: '# project', other: '# projects' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            {admin ? (
              <InlineEdit
                label={t`Team name`}
                value={team.name}
                maxLength={80}
                savedMessage={t`Team renamed`}
                editHint={t`Enter to save, Escape to cancel`}
                error={error ? errorMessage(i18n, error) : undefined}
                onSave={async (name) => {
                  setError(null)
                  try {
                    await rename.mutateAsync({
                      teamId: team.id,
                      data: { name, version: team.version },
                    })
                    await refresh()
                  } catch (failure) {
                    setError(failure)
                    throw failure
                  }
                }}
              />
            ) : (
              team.name
            )}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground text-sm">{projects}</p>
        <div>
          <h3 className="text-sm font-medium">{t`Members`}</h3>
          {team.members.length ? (
            <ul className="text-sm">
              {team.members.map((member) => (
                <li key={member.id}>{member.name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t`Nobody yet.`}</p>
          )}
        </div>
        {admin ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="destructive" size="sm" className="justify-self-start" />}
            >
              {t`Delete team`}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t`Delete ${teamName}?`}</AlertDialogTitle>
                <AlertDialogDescription>
                  {team.projectCount > 0
                    ? t`This team still has ${projects}. Move them to another team first.`
                    : t`Its members lose access to this team. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                {team.projectCount === 0 ? (
                  <AlertDialogAction
                    onClick={() =>
                      void remove
                        .mutateAsync({ teamId: team.id })
                        .then(refresh)
                        .catch((failure: unknown) => setError(failure))
                    }
                  >
                    {t`Delete`}
                  </AlertDialogAction>
                ) : null}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardContent>
    </Card>
  )
}
