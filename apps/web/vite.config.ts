import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Vendor chunk map for the CI 500 kB/chunk budget (`ci.yml` checks every `dist/assets/*.js`).
 * Recharts is the heavy one — it drags d3 with it — so it gets its own chunk along with the
 * d3 family; React, routing, state, dnd-kit, Radix, and Sentry each get a named chunk so no
 * single vendor graph can ever grow past the budget unnoticed.
 */
function vendorChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')
  if (!normalized.includes('node_modules/')) return undefined
  if (
    /\/(recharts|d3-|victory-vendor|react-smooth|react-resize-detector|eventemitter3|lodash-merge|clsx|class-variance-authority)\//.test(
      normalized,
    )
  ) {
    return 'charts'
  }
  if (/\/@sentry\//.test(normalized)) return 'sentry'
  if (/\/@dnd-kit\//.test(normalized)) return 'dnd'
  if (/\/@tanstack\//.test(normalized)) return 'tanstack'
  if (/\/@radix-ui\//.test(normalized)) return 'radix'
  if (/\/react-router\//.test(normalized)) return 'router'
  if (/\/(react|react-dom|scheduler)\//.test(normalized)) return 'react'
  if (/\/(zustand|better-auth|lucide-react|tailwind-merge)\//.test(normalized)) return 'ui'
  return 'vendor'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // E2E specs are run by Playwright (`pnpm e2e`), not Vitest.
    exclude: ['node_modules', 'e2e'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
})
