import {
  checkAiGoogleGrant,
  checkGoogleDriveGrant,
  getGetMeQueryKey,
} from '@goodresearch/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMe } from '../workspace/me.ts'
import { ReconnectNotice } from './reconnect-notice.tsx'

const CHECKED = 'goodresearch:google-grants-checked'

/** Pages that show the notice of one connection in their own content. */
const OWN_NOTICE = { vertex: '/ai-provider', drive: '/sources' } as const

/** Per account: another person signing in on the same tab is checked too. */
const checkedThisSession = (accountId: string) => {
  try {
    return sessionStorage.getItem(`${CHECKED}:${accountId}`) !== null
  } catch {
    // Storage blocked: check on each load of the shell, still no AI call.
    return false
  }
}

const markChecked = (accountId: string) => {
  try {
    sessionStorage.setItem(`${CHECKED}:${accountId}`, '1')
  } catch {
    // Storage blocked: nothing to remember.
  }
}

/**
 * Spec 030 US4: once per browser session, the saved Google grants are checked (a token request,
 * no AI call, no cost); a refused one shows a notice above every page, without blocking anything,
 * so a screen whose AI or Drive work failed for that reason offers the reconnection right there.
 */
export function GrantBanner() {
  const me = useMe()
  const queryClient = useQueryClient()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    if (checkedThisSession(me.id)) return
    void Promise.allSettled([checkAiGoogleGrant(), checkGoogleDriveGrant()]).then((answers) => {
      // Only a session where both checks got an answer counts as checked: a blip is retried.
      if (answers.every((a) => a.status === 'fulfilled' && a.value.state !== 'unreachable'))
        markChecked(me.id)
      if (answers.some((a) => a.status === 'fulfilled' && a.value.state !== 'none'))
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
    })
  }, [queryClient, me.id])

  const vertex = pathname === OWN_NOTICE.vertex ? null : me.aiProvider.grantProblem
  const drive =
    me.drive.status === 'lost' && pathname !== OWN_NOTICE.drive
      ? (me.drive.grantProblem ?? 'refused')
      : null
  if (!vertex && !drive) return null
  return (
    <div className="grid gap-2 px-4 pt-4 md:px-6">
      {vertex ? <ReconnectNotice connection="vertex" problem={vertex} account={null} /> : null}
      {drive ? (
        <ReconnectNotice connection="drive" problem={drive} account={me.drive.account} />
      ) : null}
    </div>
  )
}
