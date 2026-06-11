// Client-side instrumentation — loaded by Next.js 16 in the browser.
// Error tracking is fully optional: only activates when NEXT_PUBLIC_SENTRY_DSN
// is set AND @sentry/nextjs is installed. Safe to run with neither present.

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0.1,
        replaysOnErrorSampleRate: 0,
      });
    })
    .catch(() => {
      // Package not installed or init failed — silently ignore.
    });
}
