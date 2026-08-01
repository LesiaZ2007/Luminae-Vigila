import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    // Pin a non-UTC zone so timezone-sensitive date logic (recurrence instance
    // dates) is exercised deterministically regardless of the runner's locale.
    env: { TZ: 'America/New_York' },
    include: [
      'src/**/*.test.js',
      'tests/**/*.test.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
