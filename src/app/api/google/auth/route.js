import { makeOAuth2Client } from '@/lib/googleAuth'
import { getSession }       from '@/lib/session'

export async function GET(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'not_configured' }, { status: 503 })
  }

  const oauth2 = makeOAuth2Client()
  const url    = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent', // always show consent so we get a refresh_token
  })

  return Response.json({ url })
}
