import type { Meta, StoryObj } from '@storybook/react-vite'
import { OutcomeBand } from './outcome-band.tsx'

const meta = { component: OutcomeBand } satisfies Meta<typeof OutcomeBand>
export default meta
type Story = StoryObj<typeof meta>

export const WithNote: Story = {
  args: {
    id: 'outcome',
    title: 'Key takeaways',
    action: <a href="#debrief">See the debrief</a>,
    note: 'May be out of date',
    children: 'People find their data but do not trust it.',
  },
}
