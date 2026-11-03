import {
  type GoogleConnection,
  getGetAiProviderQueryKey,
  getGetMeQueryKey,
  getListMySourcesQueryKey,
  ReconnectResult,
  reconnectAiGoogleGrant,
  reconnectGoogleDrive,
} from '@goodresearch/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Spec 030 research R2: the pop-up landing page tells every tab of the app how it went. */
export const GOOGLE_CHANNEL = 'goodresearch-google'

export type ReconnectMessage = {
  connection: GoogleConnection
  result: ReconnectResult
  /** USD cost of the reconnection's real call (Vertex AI checks); null when unknown. */
  cost: number | null
}

const RESULTS = Object.values(ReconnectResult) as string[]

/** Reads a channel message: anything unexpected is ignored. */
export const readMessage = (data: unknown): ReconnectMessage | null => {
  if (!data || typeof data !== 'object') return null
  const { connection, result } = data as Record<string, unknown>
  if (connection !== 'vertex' && connection !== 'drive') return null
  if (typeof result !== 'string' || !RESULTS.includes(result)) return null
  const raw = (data as Record<string, unknown>).cost
  const cost = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  return {
    connection,
    result: result as ReconnectResult,
    cost: Number.isFinite(cost) && cost >= 0 ? cost : null,
  }
}

const openChannel = (): BroadcastChannel | null => {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(GOOGLE_CHANNEL)
  } catch {
    return null
  }
}

/** Posts the result from the pop-up landing page. */
export const postReconnectResult = (message: ReconnectMessage) => {
  const channel = openChannel()
  channel?.postMessage(message)
  channel?.close()
}

const listen = (onMessage: (message: ReconnectMessage) => void) => {
  const channel = openChannel()
  if (!channel) return () => undefined
  channel.onmessage = (event) => {
    const message = readMessage(event.data)
    if (message) onMessage(message)
  }
  return () => channel.close()
}

/**
 * Mounted once in the app shell: whatever tab reconnected, every open tab reloads what depends
 * on the Google connections (spec 030 edge case "two tabs").
 */
export function useGoogleChannel(onFullPageReturn: (message: ReconnectMessage) => void) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      listen(() => {
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getGetAiProviderQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getListMySourcesQueryKey() })
      }),
    [queryClient],
  )
  // Back from Google without a pop-up (it was blocked): the result is in the address, once.
  useEffect(() => {
    const url = new URL(window.location.href)
    const found = (['google', 'drive'] as const).find((key) =>
      readMessage({
        connection: key === 'google' ? 'vertex' : 'drive',
        result: url.searchParams.get(key),
      }),
    )
    // The study page tells a failed Drive consent itself (spec 002).
    if (!found || (found === 'drive' && url.searchParams.get(found) === 'error')) return
    const message = readMessage({
      connection: found === 'google' ? 'vertex' : 'drive',
      result: url.searchParams.get(found),
      cost: url.searchParams.get('googleCost'),
    })
    url.searchParams.delete(found)
    url.searchParams.delete('googleCost')
    window.history.replaceState(window.history.state, '', url)
    if (message) onFullPageReturn(message)
  }, [onFullPageReturn])
}

const POPUP_FEATURES = 'popup=yes,width=520,height=680'

/**
 * Spec 030 US1/US3: one click opens Google in a pop-up on the saved account; the page stays where
 * it is. When the browser blocks the pop-up, the whole page goes to Google and comes back here.
 */
export function useGoogleReconnect(connection: GoogleConnection) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ReconnectResult | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const watch = useRef<number | null>(null)

  const stopWatching = useCallback(() => {
    if (watch.current !== null) window.clearInterval(watch.current)
    watch.current = null
  }, [])

  useEffect(
    () =>
      listen((message) => {
        if (message.connection !== connection) return
        stopWatching()
        setPending(false)
        setResult(message.result)
        setCost(message.cost)
      }),
    [connection, stopWatching],
  )
  useEffect(() => stopWatching, [stopWatching])

  const start = useCallback(async () => {
    setResult(null)
    setFailed(false)
    setPending(true)
    const returnTo = `${window.location.pathname}${window.location.search}`
    const ask = connection === 'vertex' ? reconnectAiGoogleGrant : reconnectGoogleDrive
    // Opened synchronously in the click, so that the browser allows it.
    const popup = window.open('about:blank', 'goodresearch-google', POPUP_FEATURES)
    try {
      if (popup) {
        const { url } = await ask({ returnTo, popup: true })
        popup.location.href = url
        // Closed by hand, or ended elsewhere than its landing page: the button comes back.
        stopWatching()
        watch.current = window.setInterval(() => {
          if (!popup.closed) return
          stopWatching()
          setPending(false)
        }, 500)
        return
      }
      // The assistant's message is already stored with its conversation: nothing else to keep.
      const { url } = await ask({ returnTo, popup: false })
      window.location.assign(url)
    } catch {
      popup?.close()
      setPending(false)
      setFailed(true)
    }
  }, [connection, stopWatching])

  return { start, pending, result, cost, failed }
}
