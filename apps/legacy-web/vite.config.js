import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Port 5174 — deliberately NOT 5173 (occupied by @asas/web in the same monorepo).
// The API is allowed to accept this origin via FRONTEND_ORIGIN (see apps/api/.env.example).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
  },
})
