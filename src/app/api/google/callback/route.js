import { google }                                   from 'googleapis'
import { makeOAuth2Client }                         from '@/lib/googleAuth'
import { upsertAccount, getAccounts }               from '@/lib/googleTokenStore'
import { getSession }                               from '@/lib/session'

/** Return an HTML page that postMessages to the opener and closes itself. */
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
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:${JSON.stringify(error)}},'*');window.close();`,
    )
  }

  if (!code) {
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:'No authorization code received'},'*');window.close();`,
    )
  }

  // Require a valid session so we know which user to associate this account with
  const session = await getSession()
  if (!session) {
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:'Not signed in — please sign in first.'},'*');window.close();`,
    )
  }

  try {
    const oauth2 = makeOAuth2Client()
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    // Fetch the Google account email
    const infoApi  = google.oauth2({ version: 'v2', auth: oauth2 })
    const { data } = await infoApi.userinfo.get()
    const email    = data.email

    // Upsert into the DB scoped to this user
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
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return popupHtml(
      `window.opener?.postMessage({type:'gc_error',error:${JSON.stringify(err.message)}},'*');window.close();`,
    )
  }
}
