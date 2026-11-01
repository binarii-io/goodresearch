import type { Me } from '@goodresearch/api-client'
import {
  SidebarFooter,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
} from '@goodresearch/ui/components/app-shell'
import { BrandIcon, Wordmark } from '@goodresearch/ui/components/brand'
import { Button } from '@goodresearch/ui/components/button'
import {
  BookOpenIcon,
  FolderOpenIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { Link, useRouterState } from '@tanstack/react-router'
import { CreateProjectDialog } from '../research/create-project-dialog.tsx'
import { AccountMenu } from './account-menu.tsx'

/** Sidebar of the signed-in shell (spec 003, US2): brand, navigation by role, account. */
export function AppSidebar({ me }: { me: Me }) {
  const { t } = useLingui()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // Spec 019: a study opened from the team's page stays under "Studies".
  const fromTeam = useRouterState({
    select: (state) => (state.location.search as { from?: string }).from === 'team',
  })
  const inStudies =
    pathname.startsWith('/team-studies/') || (pathname.startsWith('/studies/') && fromTeam)
  const inProjects =
    !inStudies &&
    (pathname === '/' || pathname.startsWith('/projects/') || pathname.startsWith('/studies/'))
  return (
    <>
      <SidebarHeader
        brand={
          <Link to="/" className="rounded-md">
            <Wordmark className="h-[22px]" />
          </Link>
        }
        icon={
          <Link to="/" className="rounded-[8px]">
            <BrandIcon />
          </Link>
        }
        labels={{ collapse: t`Collapse the sidebar`, expand: t`Expand the sidebar` }}
      />
      <SidebarNav aria-label={t`Main`}>
        <SidebarNavItem
          icon={<FolderOpenIcon aria-hidden />}
          label={t`Research projects`}
          // Projects and their studies stay under "Research projects".
          render={
            <Link
              to="/"
              activeOptions={{ exact: true, includeSearch: false }}
              aria-current={inProjects ? 'page' : undefined}
            />
          }
          action={
            me.teams.length > 0 ? (
              <CreateProjectDialog
                teams={me.teams}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t`New research project`}
                    title={t`New research project`}
                    className="text-muted-foreground"
                  />
                }
              >
                <PlusIcon aria-hidden />
              </CreateProjectDialog>
            ) : null
          }
        />
        {me.teams[0] ? (
          <SidebarNavItem
            icon={<BookOpenIcon aria-hidden />}
            label={t`Studies`}
            render={
              <Link
                to="/team-studies/$teamId"
                params={{ teamId: me.teams[0].id }}
                aria-current={inStudies ? 'page' : undefined}
              />
            }
          />
        ) : null}
        <SidebarNavItem
          icon={<UsersIcon aria-hidden />}
          label={t`Teams`}
          render={<Link to="/teams" />}
        />
        {me.role === 'admin' ? (
          <SidebarNavItem
            icon={<ShieldCheckIcon aria-hidden />}
            label={t`Members`}
            render={<Link to="/members" />}
          />
        ) : null}
      </SidebarNav>
      <SidebarFooter>
        <AccountMenu me={me} />
      </SidebarFooter>
    </>
  )
}
