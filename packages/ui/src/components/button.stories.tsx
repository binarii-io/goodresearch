import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './button.tsx'

const meta = { component: Button, args: { children: 'Create project' } } satisfies Meta<
  typeof Button
>
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}
export const Outline: Story = { args: { variant: 'outline' } }
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } }
export const Disabled: Story = { args: { disabled: true } }
