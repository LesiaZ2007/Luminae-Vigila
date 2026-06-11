/**
 * Google OAuth2 client factory.
 * Handles automatic token refresh and persists new tokens back to the DB.
 */
import { google }        from 'googleapis'
import { upsertAccount } from './googleTokenStore'

function getRedirectUri(origin) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  if (process.env.VERCEL_URL)          return `https://${process.env.VERCEL_URL}/api/google/callback`
  if (origin)                          return `${origin}/api/google/callback`
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
    upsertAccount(account.userId, updated).catch(() => { /* will auto-refresh on next request */ })
  })
  return oauth2
}
