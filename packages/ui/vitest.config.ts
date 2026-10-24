import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Every story runs as a browser test with axe checks.
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
      instances: [{ browser: 'chromium' }],
    },
  },
})
