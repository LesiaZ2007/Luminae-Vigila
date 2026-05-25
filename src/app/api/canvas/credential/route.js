import { getCredential, setCredential, clearCredential } from '@/lib/canvasTokenStore'

/** GET — returns connection status (never returns the token itself) */
export async function GET() {
  const cred = await getCredential()
  return Response.json({
    connected: !!cred,
    baseUrl:   cred?.baseUrl ?? null,
  })
}

/** POST — validate token + baseUrl against Canvas, then store */
export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let { token, baseUrl } = body
  if (!token || !baseUrl) {
    return Response.json({ error: 'token and baseUrl are required' }, { status: 400 })
  }

  // Normalise: strip trailing slashes, ensure https
  baseUrl = baseUrl.trim().replace(/\/+$/, '')
  token   = token.trim()

  // Validate by calling the Canvas "self" endpoint
  let res
  try {
    res = await fetch(`${baseUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err) {
    return Response.json({ error: `Could not reach Canvas: ${err.message}` }, { status: 502 })
  }

  if (res.status === 401) {
    return Response.json({ error: 'Invalid token — please generate a new one in Canvas → Account → Settings.' }, { status: 401 })
  }
  if (!res.ok) {
    return Response.json({ error: `Canvas returned status ${res.status}. Check your base URL.` }, { status: 502 })
  }

  let user
  try { user = await res.json() } catch {
    return Response.json({ error: 'Unexpected response from Canvas.' }, { status: 502 })
  }

  await setCredential({ token, baseUrl })

  return Response.json({
    ok:          true,
    displayName: user.name ?? user.short_name ?? 'Canvas User',
  })
}

/** DELETE — disconnect Canvas */
export async function DELETE() {
  await clearCredential()
  return Response.json({ ok: true })
}
