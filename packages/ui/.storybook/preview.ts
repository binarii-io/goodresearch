import type { Preview } from '@storybook/react-vite'
import '../src/styles/globals.css'

const preview: Preview = {
  parameters: {
    // Accessibility violations fail the story tests (WCAG 2.2 AA, constitution VIII).
    a11y: { test: 'error' },
    layout: 'padded',
  },
}

export default preview
