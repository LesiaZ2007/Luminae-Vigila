/**
 * GET /api/google/callback
 * Single callback for both flows, distinguished by the `state` parameter:
 *
 *   action: 'login'   → first-time / returning sign-in
 *                        find/create user, store tokens, create JWT session,
 *                        redirect to `state.next` (defaults to /)
 *
 *   action: 'connect' → adding an extra Google account from within the app
 *                        requires an existing session, stores tokens,
 *                        postMessages to the opener popup and closes
 */
import { google }            from 'googleapis'
import { makeOAuth2Client }  from '@/lib/googleAuth'
import { upsertAccount, getAccounts } from '@/lib/googleTokenStore'
import { findOrCreateUser }  from '@/lib/auth'
import { createSession, getSession } from '@/lib/session'

/** Tiny HTML page that postMessages to the opener then closes itself. */
function popupHtml(script) {
  return new Response(
    `<!DOCTYPE html><html><head><title>Google Sign-in</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155;}p{font-size:15px;}</style>
    </head><body><p>Connecting… you can close this window.</p>
    <script>${script}</script></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code      = searchParams.get('code')
  const error     = searchParams.get('error')
  const stateRaw  = searchParams.get('state') ?? ''

  // Decode state
  let state = { action: 'connect' }
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
  } catch { /* fall back to connect */ }

  const isLogin = state.action === 'login'

  // ── Error from Google ────────────────────────────────────────────────────
  if (error) {
    if (isLogin) {
      return Response.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url))
    }
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:${JSON.stringify(error)}},'*');window.close();`,
    )
  }

  if (!code) {
    if (isLogin) {
      return Response.redirect(new URL('/login?error=no_code', request.url))
    }
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:'No authorization code received'},'*');window.close();`,
    )
  }

  try {
    const origin = new URL(request.url).origin
    const oauth2 = makeOAuth2Client(origin)
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    // Fetch the Google account email
    const infoApi  = google.oauth2({ version: 'v2', auth: oauth2 })
    const { data } = await infoApi.userinfo.get()
    const email    = data.email

    if (isLogin) {
      // ── LOGIN FLOW ──────────────────────────────────────────────────────
      // Identity only — find or create the user record, then issue a session.
      // Calendar tokens are NOT stored here; that's a separate opt-in step.
      const user = await findOrCreateUser(email)
      await createSession(user.id)

      const next = (state.next ?? '/').startsWith('/') ? (state.next ?? '/') : '/'
      return Response.redirect(new URL(next, request.url))

    } else {
      // ── CONNECT FLOW (add extra account from within app) ────────────────
      const session = await getSession()
      if (!session) {
        return popupHtml(
          `window.opener?.postMessage({type:'gc_error',error:'Not signed in — please sign in first.'},'*');window.close();`,
        )
      }

      const existing = (await getAccounts(session.userId)).find(a => a.email === email)
      const id = await upsertAccount(session.userId, {
        email,
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? null,
        expiresAt:    tokens.expiry_date   ?? null,
      })

      return popupHtml(
        `window.opener?.postMessage({type:'gc_connected',email:${JSON.stringify(email)},accountId:${JSON.stringify(id)}},'*');window.close();`,
      )
    }

  } catch (err) {
    console.error('Google OAuth callback error:', err)
    // Give a friendlier error key when the DB simply isn't configured yet
    const isDbError = err.message?.includes('DATABASE_URL') || err.message?.includes('database') || err.code === 'ECONNREFUSED'
    if (isLogin) {
      const errorKey = isDbError ? 'db_unavailable' : encodeURIComponent(err.message)
      return Response.redirect(new URL(`/login?error=${errorKey}`, request.url))
    }
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:${JSON.stringify(err.message)}},'*');window.close();`,
    )
  }
}
