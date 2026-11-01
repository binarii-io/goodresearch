import type { Meta, StoryObj } from '@storybook/react-vite'
import { Breakdown } from './breakdown.tsx'

const meta = { component: Breakdown } satisfies Meta<typeof Breakdown>
export default meta
type Story = StoryObj<typeof meta>

export const WithLines: Story = {
  args: { text: 'AI cost: $3.18', lines: ['Analysis $0.62', 'Facts $2.56'] },
}

export const Alone: Story = { args: { text: 'AI cost: unknown', lines: [] } }
