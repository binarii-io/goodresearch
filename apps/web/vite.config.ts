import { lingui } from '@lingui/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // The router plugin must run before the React plugin.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    lingui({ macroTransform: true, cwd: import.meta.dirname }),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    // Same origin as in production: the API is reached through /api.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
