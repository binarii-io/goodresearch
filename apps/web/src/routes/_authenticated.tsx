import { AppShell } from '@goodresearch/ui/components/app-shell'
import { Wordmark } from '@goodresearch/ui/components/brand'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { AssistantButton } from '../features/assistant/assistant-button.tsx'
import { AssistantPanel } from '../features/assistant/panel.tsx'
import {
  ASSISTANT_PANEL_ID,
  AssistantProvider,
  useAssistant,
} from '../features/assistant/state.tsx'
import { GrantBanner } from '../features/google/grant-banner.tsx'
import { type ReconnectMessage, useGoogleChannel } from '../features/google/reconnect.ts'
import { DRIVE_OTHER_ACCOUNT, RESULTS } from '../features/google/reconnect-notice.tsx'
import { AppSidebar } from '../features/workspace/app-sidebar.tsx'
import { LanguageSwitch } from '../features/workspace/language-switch.tsx'
import { useMe } from '../features/workspace/me.ts'
import { loadSignedIn, needsAiProvider } from '../features/workspace/session.ts'

/** Every page below requires a signed-in, active account (FR-009) with a working AI provider (spec 004). */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const me = await loadSignedIn(context.queryClient, location.href)
    if (needsAiProvider(me)) throw redirect({ to: '/setup/ai-provider' })
    return { me }
  },
  component: Layout,
})

function Layout() {
  return (
    <AssistantProvider>
      <Shell />
    </AssistantProvider>
  )
}

function Shell() {
  const { t, i18n } = useLingui()
  const me = useMe()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const assistant = useAssistant()
  // Back from Google without a pop-up: the outcome is told once, the page stays as it is.
  const onFullPageReturn = useCallback(
    (message: ReconnectMessage) => {
      const text =
        message.connection === 'drive' && message.result === 'other-account'
          ? DRIVE_OTHER_ACCOUNT
          : RESULTS[message.result]
      if (!text) return
      if (message.result === 'reconnected') toast.success(i18n._(text), { id: 'google-reconnect' })
      else toast.error(i18n._(text), { id: 'google-reconnect' })
    },
    [i18n],
  )
  useGoogleChannel(onFullPageReturn)
  return (
    <AppShell
      sidebar={<AppSidebar me={me} />}
      topbar={
        <>
          <LanguageSwitch signedIn />
          {/* Last in the top bar: right next to the panel it opens. */}
          <AssistantButton />
        </>
      }
      mobileBrand={
        <Link to="/" className="rounded-md">
          <Wordmark className="h-[18px]" />
        </Link>
      }
      labels={{ openMenu: t`Open the menu`, menu: t`Navigation`, closeMenu: t`Close the menu` }}
      location={pathname}
      panel={{
        id: ASSISTANT_PANEL_ID,
        label: t`Assistant`,
        open: assistant.open,
        onClose: assistant.close,
        content: <AssistantPanel />,
      }}
    >
      <GrantBanner />
      <Outlet />
    </AppShell>
  )
}
