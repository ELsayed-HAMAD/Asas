import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Port 5173 — the single frontend port for the workspace.
// The API is allowed to accept this origin via FRONTEND_ORIGIN (see apps/api/.env.example).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keep the browser and API on the same site so Better Auth's Lax session cookie
    // is sent on cross-port requests (both use 127.0.0.1 in local development).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
