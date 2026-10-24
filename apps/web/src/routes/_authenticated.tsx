import { ApiError, setLanguage } from '@goodresearch/api-client'
import { AppShell } from '@goodresearch/ui/components/app-shell'
import { Wordmark } from '@goodresearch/ui/components/brand'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { activate, takePendingLanguage } from '../app/i18n.ts'
import { AppSidebar } from '../features/workspace/app-sidebar.tsx'
import { LanguageSwitch } from '../features/workspace/language-switch.tsx'
import { meQueryOptions, useMe } from '../features/workspace/me.ts'

/** Every page below requires a signed-in, active account (FR-009). */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions)
      const pending = takePendingLanguage()
      if (pending && pending !== me.language) {
        await setLanguage({ language: pending })
        await context.queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      }
      await activate(pending ?? me.language)
      return { me }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw redirect({ to: '/sign-in', search: { redirect: location.href } })
      }
      throw error
    }
  },
  component: Layout,
})

function Layout() {
  const { t } = useLingui()
  const me = useMe()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <AppShell
      sidebar={<AppSidebar me={me} />}
      topbar={<LanguageSwitch signedIn />}
      mobileBrand={
        <Link to="/" className="rounded-md">
          <Wordmark className="h-[18px]" />
        </Link>
      }
      labels={{ openMenu: t`Open the menu`, menu: t`Navigation`, closeMenu: t`Close the menu` }}
      location={pathname}
    >
      <Outlet />
    </AppShell>
  )
}
