import { ApiError, setLanguage } from '@goodresearch/api-client'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { activate, takePendingLanguage } from '../app/i18n.ts'
import { AccountMenu } from '../features/workspace/account-menu.tsx'
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
  const link =
    'rounded-md px-3 py-2 text-sm font-medium hover:bg-muted data-[status=active]:bg-muted'

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold">
            goodresearch
          </Link>
          <nav aria-label={t`Main`} className="flex flex-1 gap-1">
            <Link to="/" className={link} activeOptions={{ exact: true }}>
              {t`Projects`}
            </Link>
            <Link to="/teams" className={link}>
              {t`Teams`}
            </Link>
            {me.role === 'admin' ? (
              <Link to="/members" className={link}>
                {t`Members`}
              </Link>
            ) : null}
          </nav>
          <LanguageSwitch signedIn />
          <AccountMenu me={me} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
