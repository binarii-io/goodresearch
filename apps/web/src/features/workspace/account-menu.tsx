import type { Me } from '@goodresearch/api-client'
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
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from './auth.ts'

export function AccountMenu({ me }: { me: Me }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const leave = async () => {
    await signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" />}>{me.name}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
        <DropdownMenuItem onClick={() => void leave()}>{t`Sign out`}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
