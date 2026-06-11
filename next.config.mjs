/** @type {import('next').NextConfig} */
// Note: Sentry is wired up via instrumentation.js / src/instrumentation-client.js.
// @sentry/nextjs is NOT imported here so the dev server works without the package.
const nextConfig = {
  /* config options here */
};

export default nextConfig;
