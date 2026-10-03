import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Port 5173 — the single frontend port for the workspace.
// The API is allowed to accept this origin via FRONTEND_ORIGIN (see apps/api/.env.example).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
