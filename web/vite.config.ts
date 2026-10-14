/// <reference types="vitest/config" />
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Go binary embeds internal/ui/dist; .gitkeep keeps that directory (and the embed) valid in git.
const outDir = fileURLToPath(new URL('../internal/ui/dist', import.meta.url))
const api = process.env.GRESBASE_DEV_API ?? 'http://127.0.0.1:8080'

export default defineConfig(({ command }) => ({
  // Relative asset URLs + the <base href> injected by the server make GRESBASE_BASE_PATH work.
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    { name: 'keep-dist-dir', closeBundle: () => writeFileSync(`${outDir}/.gitkeep`, '') },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir, emptyOutDir: true },
  server: {
    host: process.env.GRESBASE_DEV_HOST ?? '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': api, '/healthz': api },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}))
