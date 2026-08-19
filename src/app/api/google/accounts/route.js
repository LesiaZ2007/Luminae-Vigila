import { getAccounts, removeAccount } from '@/lib/googleTokenStore'
import { clientForAccount }            from '@/lib/googleAuth'
import { MIRROR_SCOPE }                from '@/lib/googleMirror'
import { getSession }                  from '@/lib/session'

/**
 * Ask Google what a stored grant is actually still good for.
 *
 * Without this the settings panel could only report a problem *after* an events fetch
 * happened to fail, so a dead account looked identical to one with no calendars
 * selected. Introspection is a single cheap call and tells us three distinct things
 * apart: the token is gone, the token works but predates a scope we now need, or the
 * account is fine.
 */
async function accountHealth(account) {
  // Without a refresh token there is no silent re-auth possible, ever — this account
  // is already dead even if the current access token has not expired yet.
  if (!account.refreshToken) {
    return { healthy: false, needsReconnect: true, reason: 'no_refresh_token' }
  }

  try {
    const auth      = clientForAccount(account)
    const { token } = await auth.getAccessToken()
    const info      = await auth.getTokenInfo(token)
    const scopes    = info.scopes ?? []

    if (!scopes.includes(MIRROR_SCOPE)) {
      return { healthy: true, needsReconnect: false, missingWriteScope: true, reason: 'missing_write_scope' }
    }
    return { healthy: true, needsReconnect: false, missingWriteScope: false, reason: null }
  } catch {
    // Revoked, expired beyond refresh, or the consent was withdrawn from Google's side.
    return { healthy: false, needsReconnect: true, reason: 'token_rejected' }
  }
}

export async function GET(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await getAccounts(session.userId)

  // Health costs a network round trip per account, so it is opt-in: the calendar's
  // frequent refreshes do not need it, and the settings panel asks for it once.
  const wantHealth = new URL(request.url).searchParams.get('health') === '1'
  if (!wantHealth) {
    return Response.json({ accounts: accounts.map(({ id, email }) => ({ id, email })) })
  }

  const health = await Promise.all(accounts.map(a => accountHealth(a).catch(() => ({
    healthy: false, needsReconnect: true, reason: 'check_failed',
  }))))

  // Only safe, non-secret fields — never a token.
  return Response.json({
    accounts: accounts.map(({ id, email }, i) => ({ id, email, ...health[i] })),
  })
}

export async function DELETE(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  await removeAccount(id, session.userId)
  return Response.json({ ok: true })
}
