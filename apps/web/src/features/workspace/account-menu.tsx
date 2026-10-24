import type { Me } from '@goodresearch/api-client'
import { useSidebar } from '@goodresearch/ui/components/app-shell'
import { Button } from '@goodresearch/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@goodresearch/ui/components/dropdown-menu'
import { LogOutIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from './auth.ts'

const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase())
    .join('')

/** The person's account at the foot of the sidebar: photo (or initials), name, email, its menu, sign-out. */
export function AccountMenu({ me }: { me: Me }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { collapsed, close } = useSidebar()
  const name = me.name || me.email

  const leave = async () => {
    await signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[10px] p-1.5 text-left hover:bg-sidebar-accent">
          {/* The photo covers the initials; if it cannot load (empty alt), the initials show. */}
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-highlight-soft text-xs font-semibold text-highlight-soft-foreground">
            <span aria-hidden>{initials(name)}</span>
            {me.picture ? (
              <img
                src={me.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
          </span>
          {collapsed ? (
            <span className="sr-only">{name}</span>
          ) : (
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{me.email}</span>
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          {/* Base UI requires a group around a menu label. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block">{me.email}</span>
              <span className="text-muted-foreground text-xs">
                {me.role === 'admin' ? t`Admin` : t`Member`}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              close()
              void navigate({ to: '/sources' })
            }}
          >{t`Connected sources`}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void leave()}>{t`Sign out`}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {collapsed ? null : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Sign out`}
          title={t`Sign out`}
          onClick={() => void leave()}
          className="text-muted-foreground"
        >
          <LogOutIcon aria-hidden />
        </Button>
      )}
    </div>
  )
}
