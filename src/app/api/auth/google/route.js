/**
 * GET /api/auth/google?next=/
 * Starts the Google sign-in flow for identity only.
 * Only requests userinfo.email — no calendar access.
 * Calendar connection is a separate, explicit opt-in in the settings.
 */
import { makeOAuth2Client } from '@/lib/googleAuth'

export async function GET(request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'Google OAuth is not configured.' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/'

  const state = Buffer.from(JSON.stringify({ action: 'login', next })).toString('base64url')

  // Pass the origin so the redirect URI matches the one /api/google/callback
  // computes at token-exchange time. Without it this route fell through to the
  // per-deployment VERCEL_URL and every sign-in failed with redirect_uri_mismatch.
  const origin = new URL(request.url).origin
  const oauth2 = makeOAuth2Client(origin)
  const url = oauth2.generateAuthUrl({
    access_type: 'online',   // no offline access — just identity, no refresh needed
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state,
  })

  return Response.redirect(url)
}
