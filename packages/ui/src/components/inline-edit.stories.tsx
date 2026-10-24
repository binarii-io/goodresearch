import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { InlineEdit } from './inline-edit.tsx'

const meta = { title: 'Inline edit' } satisfies Meta
export default meta

const Field = ({ multiline = false }: { multiline?: boolean }) => {
  const [value, setValue] = useState(
    multiline ? 'Why do people abandon onboarding?\n- Find blockers' : 'Onboarding study',
  )
  return (
    <InlineEdit
      label={multiline ? 'Research goal' : 'Project name'}
      value={value}
      multiline={multiline}
      onSave={setValue}
      savedMessage="Saved"
      editHint={
        multiline ? 'Ctrl+Enter to save, Escape to cancel' : 'Enter to save, Escape to cancel'
      }
    />
  )
}

export const SingleLine: StoryObj = {
  render: () => <Field />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Project name/ }))
    const input = canvas.getByRole('textbox', { name: 'Project name' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Pricing study{Enter}')
    await expect(canvas.getByRole('button', { name: /Pricing study/ })).toBeInTheDocument()
  },
}

export const EscapeCancels: StoryObj = {
  render: () => <Field />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Project name/ }))
    await userEvent.type(canvas.getByRole('textbox', { name: 'Project name' }), ' draft{Escape}')
    await expect(canvas.getByRole('button', { name: /Onboarding study$/ })).toBeInTheDocument()
  },
}

export const Multiline: StoryObj = { render: () => <Field multiline /> }

export const WithError: StoryObj = {
  render: () => (
    <InlineEdit
      label="Project name"
      value=""
      onSave={() => {}}
      savedMessage="Saved"
      editHint="Enter to save"
      error="Enter a name."
      placeholder="Untitled"
    />
  ),
}
