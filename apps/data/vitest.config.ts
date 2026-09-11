import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import path from 'path'

config({ path: '.env.local' })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
