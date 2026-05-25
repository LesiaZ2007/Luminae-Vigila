import { google }                      from 'googleapis'
import { randomUUID }                   from 'crypto'
import { makeOAuth2Client }             from '@/lib/googleAuth'
import { upsertAccount, getAccounts }   from '@/lib/googleTokenStore'

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

  try {
    const oauth2 = makeOAuth2Client()
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    // Fetch the user's email
    const infoApi  = google.oauth2({ version: 'v2', auth: oauth2 })
    const { data } = await infoApi.userinfo.get()
    const email    = data.email

    // Re-use the same ID if the account is already connected (avoid duplicates)
    const existing = (await getAccounts()).find(a => a.email === email)
    const id       = existing?.id ?? randomUUID()

    await upsertAccount({
      id,
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
