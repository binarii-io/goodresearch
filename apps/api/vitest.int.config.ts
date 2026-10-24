import { defineConfig } from 'vitest/config'

// Integration tests on a real PostgreSQL (Testcontainers); Docker must be running.
export default defineConfig({
  test: {
    name: 'api:int',
    root: import.meta.dirname,
    include: ['src/**/*.int.test.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
