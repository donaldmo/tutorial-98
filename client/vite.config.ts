import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5500',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
              if (res && 'writeHead' in res) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ detail: 'Server starting, please retry.' }))
              }
            }
          })
        },
      },
    },
  },
})
