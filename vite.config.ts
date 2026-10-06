import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { featureFlags } from './src/config/feature-flags.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'appearance-release-flag',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replaceAll('__COLOR_MODE_ENABLED__', JSON.stringify(featureFlags.colorMode)),
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
