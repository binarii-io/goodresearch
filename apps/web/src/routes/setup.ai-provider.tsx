import { type AiProvider, useGetAiProvider } from '@goodresearch/api-client'
import { Wordmark } from '@goodresearch/ui/components/brand'
import { Button } from '@goodresearch/ui/components/button'
import { Card, CardContent } from '@goodresearch/ui/components/card'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PROVIDERS } from '../features/ai/labels.ts'
import { ApiKeyForm, FailureNotice, VertexForm } from '../features/ai/provider-forms.tsx'
import { signOut } from '../features/workspace/auth.ts'
import { LanguageSwitch } from '../features/workspace/language-switch.tsx'
import { loadSignedIn, needsAiProvider } from '../features/workspace/session.ts'

const Provider = z.enum(['vertex', 'anthropic', 'openai', 'fake'])

/**
 * Spec 004: choose and connect one's own AI provider. Mandatory before the app when the deployer
 * offers at least one provider (FR-002); also reached from "AI provider" to change it.
 */
export const Route = createFileRoute('/setup/ai-provider')({
  validateSearch: z.object({
    provider: Provider.optional().catch(undefined),
    // Set by the Google consent callback.
    google: z.enum(['granted', 'error']).optional().catch(undefined),
  }),
  beforeLoad: async ({ context, location }) => ({
    me: await loadSignedIn(context.queryClient, location.href),
  }),
  component: Setup,
})

function Setup() {
  const { t, i18n } = useLingui()
  const { me } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const page = useGetAiProvider()
  const groupId = useId()
  const [choice, setChoice] = useState<AiProvider | undefined>(search.provider)
  const mandatory = needsAiProvider(me)

  // The return from Google's consent is announced once, then removed from the address.
  const announced = useRef(false)
  useEffect(() => {
    if (!search.google || announced.current) return
    announced.current = true
    if (search.google === 'error')
      toast.error(t`Google Cloud access was not granted. You can try again.`, {
        id: 'google-consent',
      })
    void navigate({ search: (previous) => ({ ...previous, google: undefined }), replace: true })
  }, [search.google, navigate, t])

  const leave = async () => {
    await signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  const offered = page.data?.offered ?? []
  const connection = page.data?.connection ?? null
  const selected = choice ?? connection?.provider ?? offered[0]

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Wordmark className="h-[22px]" />
        <div className="flex items-center gap-3">
          <LanguageSwitch signedIn />
          <Button variant="ghost" size="sm" onClick={() => void leave()}>
            {t`Sign out`}
          </Button>
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-6 pb-16">
        <div className="grid w-full max-w-2xl content-start gap-6">
          <div className="grid gap-2">
            <h1 className="text-[1.75rem] leading-tight">{t`Choose your AI provider`}</h1>
            <p className="text-muted-foreground">{t`goodresearch's assistants run on your own provider account: the costs and the processing of what you send to the AI are yours. Your key or Google access is stored encrypted, used only for your own actions, and you can remove it at any time.`}</p>
          </div>

          {connection?.status === 'needs-attention' && connection.lastFailure ? (
            <div className="grid gap-2">
              <p className="font-medium">{t`Your AI provider needs your attention.`}</p>
              <FailureNotice failure={connection.lastFailure} />
            </div>
          ) : null}

          {page.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : offered.length === 0 ? (
            <p>{t`AI is not configured on this instance.`}</p>
          ) : (
            <Card>
              <CardContent className="grid gap-6">
                <fieldset className="grid gap-3">
                  <legend id={groupId} className="mb-3 font-medium">
                    {t`Provider`}
                  </legend>
                  <RadioGroup
                    aria-labelledby={groupId}
                    value={selected ?? null}
                    onValueChange={(value) => setChoice(Provider.parse(value))}
                    className="grid gap-2"
                  >
                    {offered.map((provider) => (
                      <label
                        key={provider}
                        htmlFor={`${groupId}-${provider}`}
                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 has-data-checked:border-foreground has-data-checked:bg-muted"
                      >
                        <RadioGroupItem
                          id={`${groupId}-${provider}`}
                          value={provider}
                          className="mt-0.5"
                        />
                        <span className="grid gap-0.5">
                          <span className="font-medium">{PROVIDERS[provider].name}</span>
                          <span className="text-muted-foreground text-sm">
                            {i18n._(PROVIDERS[provider].description)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
                {selected === 'vertex' && page.data ? (
                  <VertexForm page={page.data} onSaved={() => void navigate({ to: '/' })} />
                ) : selected && selected !== 'vertex' ? (
                  <ApiKeyForm
                    key={selected}
                    provider={selected}
                    onSaved={() => void navigate({ to: '/' })}
                  />
                ) : null}
              </CardContent>
            </Card>
          )}

          {mandatory ? null : (
            <Link to="/ai-provider" className="w-fit text-sm underline">
              {t`Back to goodresearch`}
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
