/**
 * The OAuth client now comes from `@googleapis/calendar` instead of the `googleapis`
 * umbrella. These pin the two things the rest of the Google integration leans on: it
 * is still google-auth-library's OAuth2Client (so `getToken`, `getAccessToken`,
 * `getTokenInfo`, `request` and `revokeToken` are all there), and a token refresh is
 * still persisted through the 'tokens' event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { auth } from '@googleapis/calendar'

vi.mock('./googleTokenStore', () => ({ upsertAccount: vi.fn(async () => 'acct-1') }))

const { makeOAuth2Client, clientForAccount } = await import('./googleAuth')
const { upsertAccount } = await import('./googleTokenStore')

const account = {
  id: 'acct-1', userId: 'u1', email: 'me@example.com',
  accessToken: 'old-access', refreshToken: 'refresh-1', expiresAt: 1000,
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('GOOGLE_REDIRECT_URI', '')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
  upsertAccount.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('makeOAuth2Client', () => {
  it('is the OAuth2Client the slim package exports, with the methods the routes call', () => {
    const client = makeOAuth2Client('https://app.example')
    expect(client).toBeInstanceOf(auth.OAuth2)
    expect(auth.OAuth2.name).toBe('OAuth2Client')
    for (const method of ['generateAuthUrl', 'getToken', 'getAccessToken', 'getTokenInfo', 'request', 'revokeToken']) {
      expect(typeof client[method]).toBe('function')
    }
  })

  it('sends Google back to this origin’s callback when nothing pins it', () => {
    const url = new URL(makeOAuth2Client('https://app.example').generateAuthUrl({ scope: ['email'] }))
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/api/google/callback')
    expect(url.searchParams.get('client_id')).toBe('client-id')
  })

  it('prefers the stable production domain over the request origin', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'luminae-vigila.vercel.app')
    const url = new URL(makeOAuth2Client('https://preview-abc.vercel.app').generateAuthUrl({ scope: ['email'] }))
    expect(url.searchParams.get('redirect_uri')).toBe('https://luminae-vigila.vercel.app/api/google/callback')
  })
})

describe('clientForAccount', () => {
  it('carries the stored credentials', () => {
    const client = clientForAccount(account)
    expect(client.credentials).toMatchObject({
      access_token: 'old-access', refresh_token: 'refresh-1', expiry_date: 1000,
    })
  })

  it('persists a refreshed access token through the tokens event', () => {
    const client = clientForAccount(account)
    client.emit('tokens', { access_token: 'new-access', expiry_date: 2000 })

    expect(upsertAccount).toHaveBeenCalledTimes(1)
    expect(upsertAccount).toHaveBeenCalledWith('u1', {
      ...account, accessToken: 'new-access', expiresAt: 2000,
    })
  })

  it('keeps the stored refresh token unless Google issues a new one', () => {
    const client = clientForAccount(account)
    client.emit('tokens', { access_token: 'new-access', refresh_token: 'refresh-2' })
    expect(upsertAccount.mock.calls[0][1].refreshToken).toBe('refresh-2')
  })
})
