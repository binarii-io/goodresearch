import { AppShell } from '@goodresearch/ui/components/app-shell'
import { Wordmark } from '@goodresearch/ui/components/brand'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { AssistantButton } from '../features/assistant/assistant-button.tsx'
import { AssistantPanel } from '../features/assistant/panel.tsx'
import {
  ASSISTANT_PANEL_ID,
  AssistantProvider,
  useAssistant,
} from '../features/assistant/state.tsx'
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
  const { t } = useLingui()
  const me = useMe()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const assistant = useAssistant()
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
      <Outlet />
    </AppShell>
  )
}
