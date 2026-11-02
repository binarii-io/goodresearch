import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReadOnlyBadge } from './read-only-badge.tsx'

const meta = { component: ReadOnlyBadge } satisfies Meta<typeof ReadOnlyBadge>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { children: 'Read only', team: 'Research' } }
