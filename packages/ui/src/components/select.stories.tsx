import type { Meta, StoryObj } from '@storybook/react-vite'
import { Label } from './label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx'

const meta = { title: 'Select' } satisfies Meta
export default meta

export const TeamSelect: StoryObj = {
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label id="team-label">Team</Label>
      <Select defaultValue="research">
        <SelectTrigger aria-labelledby="team-label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="research">Research</SelectItem>
          <SelectItem value="growth">Growth</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
}
