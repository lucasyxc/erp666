import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Build with base /erpxy/ when VITE_BASE_PATH is set (e.g. by deploy-frontend.ps1)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5175,
  },
})
