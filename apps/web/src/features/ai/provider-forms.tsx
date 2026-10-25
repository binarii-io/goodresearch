import {
  type AiFailure,
  type AiProviderPage,
  ApiError,
  getGetAiProviderQueryKey,
  getGetMeQueryKey,
  useCheckVertexProject,
  useConnectAiApiKey,
  useStartAiGoogleGrant,
  type VertexCheck,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import { FAILURES, PROVIDERS, VERTEX_ACCESS_REFUSED } from './labels.ts'

/** The reason and the action for a failed check, in plain words (FR-007). */
export function FailureNotice({
  failure,
  provider,
}: {
  failure: AiFailure
  /** Vertex AI: a refused access is fixed by a new Google consent, not by a new key. */
  provider?: string | undefined
}) {
  const { i18n } = useLingui()
  const text =
    provider === 'vertex' && failure === 'INVALID_CREDENTIAL'
      ? VERTEX_ACCESS_REFUSED
      : FAILURES[failure]
  return (
    <div
      role="alert"
      className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="font-medium text-destructive">{i18n._(text.reason)}</p>
      <p>{i18n._(text.action)}</p>
    </div>
  )
}

const failureOf = (error: unknown): AiFailure | null => {
  const failure = error instanceof ApiError ? error.problem?.detail?.failure : undefined
  return typeof failure === 'string' && failure in FAILURES ? (failure as AiFailure) : null
}

/** Refreshes what depends on the provider: `Me` (the gate) and the provider page. */
const useRefresh = () => {
  const queryClient = useQueryClient()
  return async () => {
    // Refetched, not only invalidated: the app layout reads `Me` from the cache for its gate.
    await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() })
    await queryClient.invalidateQueries({ queryKey: getGetAiProviderQueryKey() })
  }
}

/** Anthropic, OpenAI (and the dev test provider): a key, checked by a real call before saving. */
export function ApiKeyForm({
  provider,
  onSaved,
}: {
  provider: 'anthropic' | 'openai' | 'fake'
  onSaved: () => void
}) {
  const { t, i18n } = useLingui()
  const connect = useConnectAiApiKey()
  const refresh = useRefresh()
  const [apiKey, setApiKey] = useState('')
  const id = useId()
  const failure = failureOf(connect.error)
  const setupUrl = PROVIDERS[provider].setupUrl
  const name = PROVIDERS[provider].name

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await connect.mutateAsync({ data: { provider, apiKey } })
    await refresh()
    onSaved()
  }

  return (
    <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={id}>{t`${name} API key`}</Label>
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          aria-invalid={failure ? true : undefined}
        />
        {setupUrl ? (
          <a className="w-fit text-sm underline" href={setupUrl} target="_blank" rel="noreferrer">
            {t`Get a key from ${name}`}
          </a>
        ) : null}
      </div>
      {failure ? <FailureNotice failure={failure} /> : null}
      {connect.isError && !failure ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, connect.error)}
        </p>
      ) : null}
      <Button
        type="submit"
        className="justify-self-start"
        disabled={connect.isPending || apiKey.trim().length < 8}
      >
        {connect.isPending ? t`Checking the key…` : t`Check and save`}
      </Button>
    </form>
  )
}

const CHECK_LABELS: Record<VertexCheck['key'], MessageDescriptor> = {
  format: msg`Project ID format`,
  api: msg`Access to the project and Vertex AI API enabled`,
  permission: msg`Permission to call models`,
  call: msg`Test call to the model`,
}

const STATUS_LABELS: Record<VertexCheck['status'], MessageDescriptor> = {
  ok: msg`Passed`,
  error: msg`Failed`,
  skipped: msg`Not run`,
  unknown: msg`Could not be verified`,
}

function CheckStatusIcon({ status }: { status: VertexCheck['status'] }) {
  if (status === 'ok') return <CheckIcon aria-hidden className="size-4 text-foreground" />
  if (status === 'error') return <XIcon aria-hidden className="size-4 text-destructive" />
  if (status === 'unknown')
    return <CircleHelpIcon aria-hidden className="size-4 text-muted-foreground" />
  return <CircleDashedIcon aria-hidden className="size-4 text-muted-foreground" />
}

/** Vertex AI: Google consent, then project and region, checked before saving (US2). */
export function VertexForm({ page, onSaved }: { page: AiProviderPage; onSaved: () => void }) {
  const { t, i18n } = useLingui()
  const start = useStartAiGoogleGrant()
  const check = useCheckVertexProject()
  const refresh = useRefresh()
  const [project, setProject] = useState(page.connection?.project ?? '')
  const [region, setRegion] = useState(page.connection?.region ?? page.regions[0] ?? 'global')
  const ids = { project: useId(), region: useId() }

  const consent = async () => {
    const { url } = await start.mutateAsync({
      data: { returnTo: '/setup/ai-provider?provider=vertex' },
    })
    window.location.assign(url)
  }

  if (!page.googleGranted)
    return (
      <div className="grid gap-3">
        <p className="text-sm">{t`goodresearch will ask Google for access to Google Cloud on your behalf. This access is separate from signing in and from Google Drive, and you can remove it at any time.`}</p>
        {start.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, start.error)}
          </p>
        ) : null}
        <Button
          className="justify-self-start"
          disabled={start.isPending}
          onClick={() => void consent().catch(() => undefined)}
        >
          {page.connection?.provider === 'vertex' ? t`Reconnect Google` : t`Continue with Google`}
        </Button>
      </div>
    )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await check.mutateAsync({ data: { project, region } })
    if (result.saved) {
      await refresh()
      onSaved()
    }
  }
  const checks = check.data?.checks
  const enableUrl = `https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=${encodeURIComponent(project)}`

  return (
    <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={ids.project}>{t`Google Cloud project ID`}</Label>
          <Input
            id={ids.project}
            value={project}
            spellCheck={false}
            placeholder="my-research-project"
            onChange={(e) => setProject(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label id={ids.region}>{t`Region`}</Label>
          <Select value={region} onValueChange={(value) => value && setRegion(value)}>
            <SelectTrigger aria-labelledby={ids.region} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {page.regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {checks ? (
        <ol aria-label={t`Checks`} className="grid gap-2">
          {checks.map((c) => (
            <li key={c.key} className="grid gap-1 rounded-md border bg-card p-3 text-sm">
              <span className="flex items-center gap-2">
                <CheckStatusIcon status={c.status} />
                <span className="font-medium">{i18n._(CHECK_LABELS[c.key])}</span>
                <span className="text-muted-foreground">· {i18n._(STATUS_LABELS[c.status])}</span>
              </span>
              {c.status === 'error' && c.key === 'format' ? (
                <span>{t`Use the project ID, not its name: lower-case letters, digits and hyphens, 6 to 30 characters.`}</span>
              ) : null}
              {c.status === 'error' && c.failure ? (
                <FailureNotice failure={c.failure} provider="vertex" />
              ) : null}
              {c.failure === 'API_DISABLED' ? (
                <a className="w-fit underline" href={enableUrl} target="_blank" rel="noreferrer">
                  {t`Open the Vertex AI API page of this project`}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {check.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, check.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={check.isPending || project.trim().length === 0}>
          {check.isPending ? t`Running the checks…` : t`Run the checks`}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => void consent().catch(() => undefined)}
        >{t`Use another Google account`}</Button>
      </div>
    </form>
  )
}
