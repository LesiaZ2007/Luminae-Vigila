/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const BUILT_AT = '2026-10-07T19:13:00.000Z'
const COMMIT   = 'abc1234'

/**
 * The module reads its env at import time (Next inlines it at build time), so each
 * test that cares imports a fresh copy after stubbing.
 */
async function load(env = {}) {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('APP_BUILT_AT', BUILT_AT)
  vi.stubEnv('APP_COMMIT_SHA', COMMIT)
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'AQAB')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('./pushClient')
}

function stubServiceWorker(overrides = {}) {
  const subscription = {
    toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }),
  }
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe: vi.fn(async () => subscription),
    },
  }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistrations: vi.fn(async () => []),
    ...overrides,
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true })
  return { serviceWorker, registration }
}

beforeEach(() => {
  window.PushManager = function PushManager() {}
  window.Notification = { permission: 'granted', requestPermission: vi.fn(async () => 'granted') }
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete navigator.serviceWorker
  delete window.PushManager
  delete window.Notification
})

describe('serviceWorkerVersion', () => {
  it('is build time then commit in production, so versions sort in build order', async () => {
    const { serviceWorkerVersion } = await load()
    expect(serviceWorkerVersion({ nodeEnv: 'production', builtAt: BUILT_AT, commit: COMMIT }))
      .toBe(`${BUILT_AT}-${COMMIT}`)
    const older = serviceWorkerVersion({ nodeEnv: 'production', builtAt: '2026-10-06T23:59:59.000Z', commit: 'fff0000' })
    const newer = serviceWorkerVersion({ nodeEnv: 'production', builtAt: '2026-10-07T00:00:01.000Z', commit: '0000fff' })
    expect([newer, older].sort()).toEqual([older, newer])
  })

  it('is "dev" under next dev, which switches the worker’s caching off', async () => {
    const { serviceWorkerVersion } = await load()
    expect(serviceWorkerVersion({ nodeEnv: 'development', builtAt: BUILT_AT, commit: COMMIT })).toBe('dev')
  })

  it('still changes per build when git is unavailable', async () => {
    const { serviceWorkerVersion } = await load()
    expect(serviceWorkerVersion({ nodeEnv: 'production', builtAt: BUILT_AT, commit: '' })).toBe(`${BUILT_AT}-`)
  })

  it('falls back to "dev" rather than a version that could never change', async () => {
    const { serviceWorkerVersion } = await load()
    expect(serviceWorkerVersion({ nodeEnv: 'production', builtAt: undefined, commit: undefined })).toBe('dev')
  })
})

describe('SW_URL', () => {
  it('carries the encoded build version, which the worker reads back from ?v=', async () => {
    const { SW_URL } = await load()
    expect(SW_URL).toBe(`/sw.js?v=${encodeURIComponent(`${BUILT_AT}-${COMMIT}`)}`)
    expect(new URL(SW_URL, 'https://lv.test').searchParams.get('v')).toBe(`${BUILT_AT}-${COMMIT}`)
  })

  it('is /sw.js?v=dev on a dev server', async () => {
    const { SW_URL } = await load({ NODE_ENV: 'development' })
    expect(SW_URL).toBe('/sw.js?v=dev')
  })
})

describe('registerServiceWorker', () => {
  it('registers SW_URL at the root scope, bypassing the HTTP cache for updates', async () => {
    const { registerServiceWorker, SW_URL } = await load()
    const { serviceWorker, registration } = stubServiceWorker()
    await expect(registerServiceWorker()).resolves.toBe(registration)
    expect(serviceWorker.register).toHaveBeenCalledWith(SW_URL, { scope: '/', updateViaCache: 'none' })
  })

  it('resolves to null where service workers do not exist', async () => {
    const { registerServiceWorker } = await load()
    await expect(registerServiceWorker()).resolves.toBeNull()
  })

  // Two callers registering two different URLs would swap the worker back and forth.
  it('is what the push helpers register with, too', async () => {
    const { registerAndSyncPush, enablePush, SW_URL } = await load()
    const { serviceWorker } = stubServiceWorker()
    await registerAndSyncPush()
    await enablePush()
    expect(serviceWorker.register).toHaveBeenCalledTimes(2)
    for (const [url] of serviceWorker.register.mock.calls) expect(url).toBe(SW_URL)
  })
})

describe('subscription upload', () => {
  it('sends the zone name next to the offset', async () => {
    const { registerAndSyncPush } = await load()
    stubServiceWorker()
    await registerAndSyncPush()
    expect(fetch).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      endpoint: 'https://push.example/1',
      tzOffset: new Date().getTimezoneOffset(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    expect(typeof body.timeZone).toBe('string')
  })
})

describe('resetOfflineCache', () => {
  function fakeCaches(names) {
    const store = new Set(names)
    return {
      keys: vi.fn(async () => [...store]),
      delete: vi.fn(async name => store.delete(name)),
      left: () => [...store],
    }
  }

  it('unregisters every registration and deletes only the worker’s caches', async () => {
    const { resetOfflineCache } = await load()
    const registrations = [{ unregister: vi.fn(async () => true) }, { unregister: vi.fn(async () => true) }]
    const serviceWorker = { getRegistrations: vi.fn(async () => registrations) }
    const cacheStorage = fakeCaches(['lv-shell-a', 'lv-static-a', 'lv-static-b', 'someone-else'])
    await resetOfflineCache({ serviceWorker, cacheStorage })
    for (const r of registrations) expect(r.unregister).toHaveBeenCalled()
    expect(cacheStorage.left()).toEqual(['someone-else'])
  })

  it('carries on past failures, and copes with neither API existing', async () => {
    const { resetOfflineCache } = await load()
    const serviceWorker = { getRegistrations: vi.fn(async () => [{ unregister: vi.fn(async () => { throw new Error('x') }) }]) }
    const cacheStorage = fakeCaches(['lv-shell-a'])
    await expect(resetOfflineCache({ serviceWorker, cacheStorage })).resolves.toBeUndefined()
    expect(cacheStorage.left()).toEqual([])
    await expect(resetOfflineCache({ serviceWorker: undefined, cacheStorage: undefined })).resolves.toBeUndefined()
  })
})
