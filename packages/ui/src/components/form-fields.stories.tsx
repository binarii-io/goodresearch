import type { Meta, StoryObj } from '@storybook/react-vite'
import { Checkbox } from './checkbox.tsx'
import { Input } from './input.tsx'
import { Label } from './label.tsx'
import { Textarea } from './textarea.tsx'

const meta = { title: 'Form fields' } satisfies Meta
export default meta

export const TextInput: StoryObj = {
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="name">Project name</Label>
      <Input id="name" placeholder="Onboarding study" />
    </div>
  ),
}

export const InvalidInput: StoryObj = {
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="name-invalid">Project name</Label>
      <Input id="name-invalid" aria-invalid aria-describedby="name-error" />
      <p id="name-error" className="text-destructive text-sm">
        Enter a name.
      </p>
    </div>
  ),
}

export const MultilineText: StoryObj = {
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="goal">Research goal</Label>
      <Textarea id="goal" />
    </div>
  ),
}

export const CheckboxField: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="team" />
      <Label htmlFor="team">Research team</Label>
    </div>
  ),
}
