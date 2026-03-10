import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.DEV_API_PORT || 4321}`,
        changeOrigin: true,
      },
    },
  },
})
