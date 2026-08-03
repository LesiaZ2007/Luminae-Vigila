import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Needed so component tests can render JSX. Pinned to v4 because vitest 2
  // resolves vite 5, and plugin-react v6+ requires vite 8.
  //
  // `include` has to cover .js as well: this project keeps JSX in .js files
  // (Next.js handles that transparently), but the plugin only picks up
  // .jsx/.tsx by default and otherwise fails on the first `<`.
  plugins: [react({ include: /\.[jt]sx?$/ })],
  test: {
    globals: true,
    // Pin a non-UTC zone so timezone-sensitive date logic (recurrence instance
    // dates, study-session shifting) is exercised deterministically regardless
    // of the runner's locale.
    env: { TZ: 'America/New_York' },
    include: [
      'src/**/*.test.js',
      'src/**/*.test.jsx',
      'tests/**/*.test.js',
    ],
    // Pure-logic tests stay in node; a file that renders a component opts into
    // jsdom with a `@vitest-environment jsdom` docblock. Keeping node as the
    // default means the lib suite doesn't pay for a DOM it never touches.
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
  },
  // Vite's esbuild pass runs before the react plugin and defaults .js to the
  // plain 'js' loader, which fails on the first JSX tag. Forcing the jsx loader
  // for our own source is what actually lets .js components compile.
  esbuild: {
    loader: 'jsx',
    include: /src[\\/].*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
