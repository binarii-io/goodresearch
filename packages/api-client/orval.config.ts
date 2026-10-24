import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: { target: './openapi.json' },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: './src/fetcher.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
        query: { signal: true },
      },
    },
  },
})
