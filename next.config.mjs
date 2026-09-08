/** @type {import('next').NextConfig} */
// Note: Sentry is wired up via instrumentation.js / src/instrumentation-client.js.
// @sentry/nextjs is NOT imported here so the dev server works without the package.
import { execSync } from 'node:child_process'

/**
 * Which commit this bundle was built from.
 *
 * On Vercel this comes from VERCEL_GIT_COMMIT_SHA, which is set for every build.
 * Locally there is no such variable, so ask git — that way the marker is useful on a
 * dev server too, which is the case where "are both devices on the same code?" is
 * hardest to answer by eye.
 *
 * Deliberately not `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`: that one only reaches the
 * bundle if "Automatically expose System Environment Variables" is on in the Vercel
 * project, so relying on it would make the marker silently blank depending on a
 * setting nobody remembers. Values in `env` below are inlined at build time
 * whatever they are called.
 */
function commitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    // A tarball with no .git, or no git on PATH. A blank marker is better than a
    // build that fails over a diagnostic.
    return ''
  }
}

const nextConfig = {
  env: {
    APP_COMMIT_SHA: commitSha(),
    APP_BUILT_AT:   new Date().toISOString(),
  },
};

export default nextConfig;
