import { useGetPublicConfig } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@goodresearch/ui/components/card'
import { Trans, useLingui } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { safeRedirect, signIn } from '../features/workspace/auth.ts'
import { LanguageSwitch } from '../features/workspace/language-switch.tsx'

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
    // Set by the auth library when the provider or our sign-in rules refused the attempt.
    error: z.string().optional().catch(undefined),
  }),
  component: SignIn,
})

function SignIn() {
  const { t } = useLingui()
  const search = Route.useSearch()
  const config = useGetPublicConfig()
  const [failed, setFailed] = useState(false)

  const start = async (provider: string) => {
    try {
      await signIn(provider, safeRedirect(search.redirect))
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex justify-end p-4">
        <LanguageSwitch signedIn={false} />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold">goodresearch</h1>
            </CardTitle>
            <CardDescription>{t`Better-designed studies, answers you can trust.`}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {search.error || failed ? (
              // FR-008: one generic message, whatever the reason.
              <p role="alert" className="text-destructive text-sm">
                {t`Sign-in did not work. Try again, or contact your administrator if it keeps failing.`}
              </p>
            ) : null}
            {config.data?.signInConfigured === false ? (
              <p>
                <Trans>
                  Sign-in is not configured yet. The person deploying goodresearch must set up an
                  identity provider, see the{' '}
                  <a className="underline" href="https://github.com/binarii-io/goodresearch#deploy">
                    deployment guide
                  </a>
                  .
                </Trans>
              </p>
            ) : (
              config.data?.providers.map(({ id, displayName: provider }) => (
                <Button key={id} size="lg" onClick={() => void start(id)}>
                  {t`Sign in with ${provider}`}
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
