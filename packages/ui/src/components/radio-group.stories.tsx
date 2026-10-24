import type { Meta, StoryObj } from '@storybook/react-vite'
import { Label } from './label.tsx'
import { RadioGroup, RadioGroupItem } from './radio-group.tsx'

const meta = { title: 'Radio group' } satisfies Meta
export default meta

export const StudyType: StoryObj = {
  render: () => (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Type</legend>
      <RadioGroup defaultValue="interviews">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="interviews" id="t-interviews" />
          <Label htmlFor="t-interviews">Interviews</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="survey" id="t-survey" disabled />
          <Label htmlFor="t-survey">Survey (coming later)</Label>
        </div>
      </RadioGroup>
    </fieldset>
  ),
}
