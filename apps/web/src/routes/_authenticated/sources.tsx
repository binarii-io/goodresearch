import {
  getListMySourcesQueryKey,
  useDisconnectDrive,
  useListMySources,
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
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useFormatDate } from '../../features/workspace/format.ts'

/** "Connected sources": each person's own permissions to read sources (spec 002 FR-009). */
export const Route = createFileRoute('/_authenticated/sources')({ component: Sources })

function Sources() {
  const { t } = useLingui()
  const sources = useListMySources()
  const disconnect = useDisconnectDrive()
  const queryClient = useQueryClient()
  const formatDate = useFormatDate()

  if (sources.isPending) return <Skeleton className="h-24 w-full" />
  const drive = sources.data?.find((s) => s.connector === 'google-drive')
  const account = drive?.externalAccount ?? ''
  const since = formatDate(drive?.connectedAt)

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">{t`Connected sources`}</h1>
      <p className="text-muted-foreground">{t`Sources goodresearch reads with your own permission. They are separate from signing in.`}</p>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Google Drive</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!drive?.configured ? (
            <p>{t`Google Drive is not configured on this instance.`}</p>
          ) : drive.status === 'connected' ? (
            <>
              <p>{t`Connected as ${account} since ${since}. Read-only.`}</p>
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="outline" className="justify-self-start" />}
                >{t`Disconnect`}</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t`Disconnect Google Drive?`}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t`The permission is revoked at Google. You will need to connect again to see or refresh study folders.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void disconnect
                          .mutateAsync()
                          .then(() =>
                            queryClient.invalidateQueries({ queryKey: getListMySourcesQueryKey() }),
                          )
                      }
                    >
                      {t`Disconnect`}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <p>
              {drive.status === 'lost'
                ? t`The permission no longer works (revoked or expired). Open a study to connect again.`
                : t`Not connected. You will be asked to connect when you attach a folder to a study.`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
