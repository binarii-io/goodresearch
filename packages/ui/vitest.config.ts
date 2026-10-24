import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Every story runs as a browser test with axe checks, in the light and the dark theme.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    storybookTest({ configDir: `${import.meta.dirname}/.storybook` }),
  ],
  test: {
    name: 'ui',
    root: import.meta.dirname,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      // Both themes (spec 003, SC-001): the dark theme follows the colour scheme of the browser.
      instances: [
        { browser: 'chromium', name: 'ui (light)' },
        {
          browser: 'chromium',
          name: 'ui (dark)',
          provider: playwright({ contextOptions: { colorScheme: 'dark' } }),
        },
      ],
    },
  },
})
