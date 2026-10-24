import { Toaster } from '@goodresearch/ui/components/sonner'
import { useLingui } from '@lingui/react/macro'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Root })

function Root() {
  const { t } = useLingui()
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        {t`Skip to content`}
      </a>
      <Outlet />
      <Toaster />
    </>
  )
}
