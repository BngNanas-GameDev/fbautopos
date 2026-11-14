import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend lives in web/, built to web/dist (served by the Express backend).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})