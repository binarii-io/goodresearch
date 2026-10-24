import { defineConfig } from 'vitest/config'

// Plain functions of the design system (no browser).
export default defineConfig({
  test: { name: 'ui:unit', root: import.meta.dirname, include: ['src/**/*.test.ts'] },
})
