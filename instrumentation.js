// Server-side / Edge instrumentation — loaded by Next.js automatically.
// Error tracking is fully optional: only activates when SENTRY_DSN is set
// AND @sentry/nextjs is installed. Safe to run with neither present.

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  } catch {
    // Package not installed or init failed — silently ignore.
  }
}
