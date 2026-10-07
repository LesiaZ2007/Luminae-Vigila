import { getCredential, setCredential, clearCredential } from '@/lib/canvasTokenStore'
import { getSession }                                     from '@/lib/session'
import { canvasGet }                                       from '@/lib/canvasFetch'

/** GET — returns connection status (never returns the token itself) */
export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cred = await getCredential(session.userId)
  return Response.json({
    connected: !!cred,
    baseUrl:   cred?.baseUrl ?? null,
  })
}

/** POST — validate token + baseUrl against Canvas, then store */
export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let { token, baseUrl } = body
  if (!token || !baseUrl) {
    return Response.json({ error: 'token and baseUrl are required' }, { status: 400 })
  }

  // Normalise: strip trailing slashes, ensure no extra spaces
  baseUrl = baseUrl.trim().replace(/\/+$/, '')
  token   = token.trim()

  // Validate by calling the Canvas "self" endpoint
  const result = await canvasGet(`${baseUrl}/api/v1/users/self`, token)

  if (!result.ok) {
    if (result.kind === 'network') return Response.json({ error: `Could not reach Canvas: ${result.error.message}` }, { status: 502 })
    if (result.kind === 'unauthorized') {
      return Response.json({ error: 'Invalid token — please generate a new one in Canvas → Account → Settings.' }, { status: 401 })
    }
    if (result.kind === 'badJson') return Response.json({ error: 'Unexpected response from Canvas.' }, { status: 502 })
    return Response.json({ error: `Canvas returned status ${result.status}. Check your base URL.` }, { status: 502 })
  }

  const user = result.data
  await setCredential(session.userId, { token, baseUrl })

  return Response.json({
    ok:          true,
    displayName: user.name ?? user.short_name ?? 'Canvas User',
  })
}

/** DELETE — disconnect Canvas */
export async function DELETE() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  await clearCredential(session.userId)
  return Response.json({ ok: true })
}
