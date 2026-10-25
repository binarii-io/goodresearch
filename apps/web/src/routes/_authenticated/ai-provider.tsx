import {
  getGetAiProviderQueryKey,
  getGetMeQueryKey,
  useGetAiProvider,
  useRemoveAiProvider,
  useTestAiProvider,
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
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { Card, CardContent } from '@goodresearch/ui/components/card'
import { PageTitle } from '@goodresearch/ui/components/page-header'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PROVIDERS } from '../../features/ai/labels.ts'
import { FailureNotice } from '../../features/ai/provider-forms.tsx'
import { useFormatDate } from '../../features/workspace/format.ts'

/** "AI provider": see, test, change or remove one's own provider (spec 004 US3). */
export const Route = createFileRoute('/_authenticated/ai-provider')({ component: AiProviderPage })

function AiProviderPage() {
  const { t } = useLingui()
  const page = useGetAiProvider()
  const test = useTestAiProvider()
  const remove = useRemoveAiProvider()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const formatDate = useFormatDate()

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetAiProviderQueryKey() })
    await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() })
  }

  if (page.isPending) return <Skeleton className="h-40 w-full" />
  const connection = page.data?.connection
  const usage = page.data?.usage
  const checked = formatDate(connection?.lastCheckedAt)
  const calls = usage?.calls ?? 0
  const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)

  return (
    <div className="grid max-w-3xl gap-6">
      <PageTitle
        title={t`AI provider`}
        description={t`goodresearch's assistants use your own provider account. Costs and data processing are yours.`}
      />
      {connection ? (
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg">{PROVIDERS[connection.provider].name}</h2>
              <Badge variant={connection.status === 'working' ? 'secondary' : 'destructive'}>
                {connection.status === 'working' ? t`Working` : t`Needs attention`}
              </Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">{t`Model`}</dt>
              <dd>{connection.model}</dd>
              {connection.credentialHint ? (
                <>
                  <dt className="text-muted-foreground">{t`API key`}</dt>
                  <dd>
                    <span aria-hidden>••••</span>
                    <span className="sr-only">{t`ending with`}</span> {connection.credentialHint}
                  </dd>
                </>
              ) : null}
              {connection.project ? (
                <>
                  <dt className="text-muted-foreground">{t`Google Cloud project`}</dt>
                  <dd>
                    {connection.project} · {connection.region}
                  </dd>
                </>
              ) : null}
              {connection.googleAccount ? (
                <>
                  <dt className="text-muted-foreground">{t`Google account`}</dt>
                  <dd>{connection.googleAccount}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t`Last successful check`}</dt>
              <dd>{checked}</dd>
              <dt className="text-muted-foreground">{t`Usage`}</dt>
              <dd>{t`${calls} calls · ${tokens} tokens`}</dd>
            </dl>
            {connection.provider === 'vertex' ? (
              <p className="text-muted-foreground text-sm">
                {t`Removing the provider deletes it from goodresearch. To also withdraw goodresearch's access at Google, use your Google account permissions.`}{' '}
                <a
                  className="underline"
                  href="https://myaccount.google.com/connections"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t`Open Google account permissions`}
                </a>
              </p>
            ) : null}
            {connection.status !== 'working' && connection.lastFailure ? (
              <FailureNotice failure={connection.lastFailure} provider={connection.provider} />
            ) : null}
            {test.data ? (
              test.data.ok ? (
                <p role="status" className="text-sm">
                  {t`The provider answered.`}
                </p>
              ) : test.data.failure ? (
                <FailureNotice failure={test.data.failure} provider={connection.provider} />
              ) : null
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={test.isPending}
                onClick={() =>
                  void test
                    .mutateAsync()
                    .then(refresh)
                    .catch(() => undefined)
                }
              >
                {test.isPending ? t`Testing…` : t`Test again`}
              </Button>
              {connection.provider === 'vertex' &&
              connection.status === 'needs-attention' &&
              connection.lastFailure === 'INVALID_CREDENTIAL' ? (
                <Button render={<Link to="/setup/ai-provider" search={{ provider: 'vertex' }} />}>
                  {t`Reconnect Google`}
                </Button>
              ) : null}
              <Button variant="outline" render={<Link to="/setup/ai-provider" />}>
                {t`Change provider`}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" className="text-destructive hover:text-destructive" />
                  }
                >
                  {t`Remove`}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t`Remove your AI provider?`}</AlertDialogTitle>
                    <AlertDialogDescription>{t`Your key or Google access is deleted from goodresearch. You will be asked to choose a provider again before using the app.`}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void remove
                          .mutateAsync()
                          .then(refresh)
                          .then(() => navigate({ to: '/setup/ai-provider' }))
                      }
                    >
                      {t`Remove`}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p>
          <Link to="/setup/ai-provider" className="underline">
            {t`Choose your AI provider`}
          </Link>
        </p>
      )}
    </div>
  )
}
