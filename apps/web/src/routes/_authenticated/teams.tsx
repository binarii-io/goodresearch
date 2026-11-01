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
import { Card, CardContent } from '@goodresearch/ui/components/card'
import { SectionTitle } from '@goodresearch/ui/components/count'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { PageTitle } from '@goodresearch/ui/components/page-header'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Folder } from '@goodresearch/ui/components/team-folder'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
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
    <div className="grid gap-8">
      <PageTitle
        title={t`Teams`}
        description={t`Every project belongs to one team; its members work on the team's projects.`}
      />
      {admin ? (
        <Card className="max-w-xl">
          <CardContent>
            <CreateTeamForm submitLabel={t`Add team`} />
          </CardContent>
        </Card>
      ) : null}
      <SectionTitle count={teams.data?.length}>{t`Teams`}</SectionTitle>
      {teams.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : teams.data?.length ? (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]"
          aria-label={t`Teams`}
        >
          {teams.data.map((team, index) => (
            <li key={team.id} className="grid">
              <TeamCard team={team} admin={admin} tint={index} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t`You are not in any team yet.`}</p>
      )}
    </div>
  )
}

function TeamCard({ team, admin, tint }: { team: TeamDetail; admin: boolean; tint: number }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const rename = useRenameTeam()
  const remove = useDeleteTeam()
  const [error, setError] = useState<unknown>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() })
  const teamName = team.name
  const projects = plural(team.projectCount, { one: '# project', other: '# projects' })

  return (
    <Folder tint={tint}>
      <h3 className="text-base font-bold tracking-tight">
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
      </h3>
      <Link className="text-sm underline" to="/team-studies/$teamId" params={{ teamId: team.id }}>
        {t`Studies of the team`}
      </Link>
      <div>
        <h4 className="text-sm font-medium">{t`Members`}</h4>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/10 pt-3 text-sm">
        <span className="text-muted-foreground">{projects}</span>
        {admin ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                />
              }
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
      </div>
    </Folder>
  )
}
