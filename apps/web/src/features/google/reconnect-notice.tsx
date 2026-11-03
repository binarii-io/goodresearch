import type { GoogleConnection, GrantProblem, ReconnectResult } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useMoney } from '../assistant/cost.tsx'
import { useGoogleReconnect } from './reconnect.ts'

/** Why Google refuses the saved access, in plain words (spec 030 FR-002). */
const REASONS: Record<GrantProblem, MessageDescriptor> = {
  refused: msg`Google no longer accepts goodresearch's access: it was withdrawn or has expired.`,
  'reauth-required': msg`Google needs you to sign in again: your organisation asks for it regularly.`,
  unreadable: msg`The saved Google access can no longer be read by goodresearch.`,
}

const CONNECTIONS: Record<GoogleConnection, MessageDescriptor> = {
  vertex: msg`Vertex AI`,
  drive: msg`Google Drive`,
}

export const DRIVE_OTHER_ACCOUNT = msg`Another Google account was chosen. To use it, disconnect Google Drive in Connected sources, then connect again.`

export const RESULTS: Partial<Record<ReconnectResult, MessageDescriptor>> = {
  reconnected: msg`Reconnected. You can carry on.`,
  'missing-right': msg`The access was not ticked on Google's screen. Try again and keep it ticked.`,
  'checks-failed': msg`Google gave access again, but your project no longer passes the checks.`,
  'other-account': msg`Another Google account was chosen. To use it, go through the full setup.`,
  cancelled: msg`Google was closed before the end. Nothing changed.`,
  error: msg`Google did not finish. Try again in a moment.`,
}

/** The Vertex AI checks make one short real call: its cost is shown here (AGENTS.md). */
export function CheckCost({ cost }: { cost: number | null }) {
  const { t } = useLingui()
  const money = useMoney()
  return (
    <p className="text-muted-foreground">
      {cost === null
        ? t`The checks made one short call to Vertex AI; it is counted in your AI provider usage.`
        : t`The checks made one short call to Vertex AI: ${money(cost)}.`}
    </p>
  )
}

/**
 * Spec 030: shown where Google refused a saved access, with one action. The page stays where it
 * is; `children` shows once the connection is back (e.g. "Send again").
 */
export function ReconnectNotice({
  connection,
  problem,
  account,
  children,
}: {
  connection: GoogleConnection
  problem: GrantProblem
  account: string | null
  children?: ReactNode
}) {
  const { t, i18n } = useLingui()
  const reconnect = useGoogleReconnect(connection)
  const name = i18n._(CONNECTIONS[connection])

  if (reconnect.result === 'reconnected')
    return (
      <div role="status" className="grid gap-2 text-sm">
        <p>{i18n._(RESULTS.reconnected as MessageDescriptor)}</p>
        {connection === 'vertex' ? <CheckCost cost={reconnect.cost} /> : null}
        {children}
      </div>
    )

  const result = reconnect.result
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="font-medium text-destructive">{i18n._(REASONS[problem])}</p>
      <p>
        {account
          ? t`Reconnect ${name} with ${account}: one Google screen, you stay on this page.`
          : t`Reconnect ${name}: one Google screen, you stay on this page.`}
      </p>
      <div role="status" className="empty:hidden">
        {result === 'checks-failed' ? (
          <span>
            {i18n._(RESULTS['checks-failed'] as MessageDescriptor)}{' '}
            <Link to="/setup/ai-provider" search={{ provider: 'vertex' }} className="underline">
              {t`Open the setup`}
            </Link>
          </span>
        ) : result === 'other-account' ? (
          <span>
            {i18n._(
              connection === 'vertex'
                ? (RESULTS['other-account'] as MessageDescriptor)
                : DRIVE_OTHER_ACCOUNT,
            )}{' '}
            {connection === 'vertex' ? (
              <Link to="/setup/ai-provider" search={{ provider: 'vertex' }} className="underline">
                {t`Use another account`}
              </Link>
            ) : (
              <Link to="/sources" className="underline">
                {t`Open Connected sources`}
              </Link>
            )}
          </span>
        ) : result && RESULTS[result] ? (
          i18n._(RESULTS[result] as MessageDescriptor)
        ) : reconnect.failed ? (
          t`Google could not be opened. Try again in a moment.`
        ) : null}
      </div>
      <Button
        className="justify-self-start"
        disabled={reconnect.pending}
        onClick={() => void reconnect.start()}
      >
        {reconnect.pending ? t`Waiting for Google…` : t`Reconnect Google`}
      </Button>
    </div>
  )
}
