import type { Meta, StoryObj } from '@storybook/react-vite'
import { JourneyStep, JourneySteps } from './journey.tsx'

const meta = { component: JourneySteps } satisfies Meta<typeof JourneySteps>
export default meta
type Story = StoryObj<typeof meta>

export const InProgress: Story = {
  render: () => (
    <JourneySteps>
      <JourneyStep
        number={1}
        label="Interviews"
        value={24}
        detail="22 participants"
        render={<a href="#a" />}
      />
      <JourneyStep
        number={2}
        label="Facts"
        value={612}
        next="Next step"
        action="Decide the 464 facts left"
        detail="148 validated"
        progress={{ value: 148, max: 612, label: 'Facts validated' }}
        render={<a href="#b" />}
      />
      <JourneyStep
        number={3}
        label="Insights"
        value={0}
        detail="Will come from the facts"
        dimmed
        render={<a href="#c" />}
      />
    </JourneySteps>
  ),
}
