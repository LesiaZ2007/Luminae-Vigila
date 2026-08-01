/**
 * Google OAuth2 client factory.
 * Handles automatic token refresh and persists new tokens back to the DB.
 */
import { google }        from 'googleapis'
import { upsertAccount } from './googleTokenStore'

/**
 * Resolve the OAuth redirect URI.
 *
 * Google requires this to be registered ahead of time AND to be byte-identical
 * between the authorize call and the token exchange. That rules out
 * `VERCEL_URL`, which is a *per-deployment* hostname
 * (luminae-vigila-<hash>-<scope>.vercel.app) — it changes on every push, so it
 * can never be pre-registered and always fails with redirect_uri_mismatch.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the stable production domain and is set on
 * preview deployments too, so previews send you back through production — which
 * is what we want, since only a fixed list of URIs can be registered. Set
 * GOOGLE_REDIRECT_URI to override any of this (e.g. a custom domain).
 */
function getRedirectUri(origin) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/google/callback`
  if (origin)                          return `${origin}/api/google/callback`
  // Last resort. VERCEL_URL is deliberately NOT used — see above.
  return 'http://localhost:3000/api/google/callback'
}

export function makeOAuth2Client(origin) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(origin),
  )
}

/**
 * Returns an authenticated OAuth2 client for a stored account.
 * If the access token has expired, googleapis will refresh it automatically
 * and the 'tokens' event persists the new tokens back to the DB.
 *
 * The account object must include { id, userId, email, accessToken, refreshToken, expiresAt }.
 */
export function clientForAccount(account) {
  const oauth2 = makeOAuth2Client()
  oauth2.setCredentials({
    access_token:  account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date:   account.expiresAt,
  })
  // Persist refreshed tokens automatically (fire-and-forget)
  oauth2.on('tokens', (tokens) => {
    const updated = { ...account }
    if (tokens.access_token)  updated.accessToken  = tokens.access_token
    if (tokens.expiry_date)   updated.expiresAt    = tokens.expiry_date
    if (tokens.refresh_token) updated.refreshToken = tokens.refresh_token
    upsertAccount(account.userId, updated).catch(err => {
      // If this write fails the refreshed token is lost and the next request
      // must refresh again — log it so silent token churn is diagnosable.
      console.error('[google] failed to persist refreshed token:', err?.message)
    })
  })
  return oauth2
}
