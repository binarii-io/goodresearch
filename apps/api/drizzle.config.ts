import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/platform/auth/auth-schema.ts',
    './src/modules/workspace/infrastructure/schema.ts',
    './src/modules/research/infrastructure/schema.ts',
    './src/modules/ingestion/infrastructure/schema.ts',
    './src/modules/ai-gateway/infrastructure/schema.ts',
  ],
  out: './drizzle',
  casing: 'snake_case',
})
