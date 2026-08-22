import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: projectRoot,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: path.join(projectRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/health.json': {
        target: process.env.MEMEDROP_WEB_BACKEND_URL ?? 'http://127.0.0.1:3010',
        changeOrigin: false,
      },
    },
  },
})
