/**
 * GET /api/google/auth
 * Generates a Google OAuth URL for the "add another account" connect flow.
 * Encodes { action: 'connect' } in the OAuth state so the callback
 * opens a popup postMessage instead of creating a new session.
 * Requires an active session (user must already be logged in).
 */
import { makeOAuth2Client } from '@/lib/googleAuth'
import { getSession }       from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'not_configured' }, { status: 503 })
  }

  const state = Buffer.from(JSON.stringify({ action: 'connect' })).toString('base64url')

  const oauth2 = makeOAuth2Client()
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    state,
  })

  return Response.json({ url })
}
