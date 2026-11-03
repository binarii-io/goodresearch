import { Button } from '@goodresearch/ui/components/button'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { postReconnectResult, readMessage } from '../features/google/reconnect.ts'

const Search = z.object({
  connection: z.string().optional(),
  result: z.string().optional(),
  cost: z.string().optional(),
})

/**
 * Spec 030: where Google's window ends after "Reconnect Google". It tells the page that opened it
 * (every tab of the app, through a BroadcastChannel) and closes itself.
 */
export const Route = createFileRoute('/google/done')({
  validateSearch: Search,
  component: Done,
})

function Done() {
  const { t } = useLingui()
  const search = Route.useSearch()
  useEffect(() => {
    const message = readMessage(search) ?? {
      connection: search.connection === 'drive' ? 'drive' : 'vertex',
      result: 'error',
      cost: null,
    }
    postReconnectResult(message)
    window.close()
  }, [search])
  return (
    <main className="grid min-h-svh place-content-center gap-3 bg-background p-6 text-center">
      <p role="status">{t`Done. You can close this window and go back to goodresearch.`}</p>
      <Button className="justify-self-center" onClick={() => window.close()}>
        {t`Close this window`}
      </Button>
    </main>
  )
}
