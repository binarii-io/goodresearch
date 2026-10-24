import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx'

const meta = { title: 'Dropdown menu' } satisfies Meta
export default meta

export const AccountMenu: StoryObj = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" />}>Alex Example</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>alex@example.org</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Alex Example' }))
    // The menu opens in a portal, with an entry animation.
    await expect(
      await within(document.body).findByRole('menuitem', { name: 'Sign out' }),
    ).toBeInTheDocument()
  },
}
