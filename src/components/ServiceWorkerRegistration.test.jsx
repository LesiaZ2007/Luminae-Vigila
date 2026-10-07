/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/pushClient', () => ({
  registerServiceWorker: vi.fn(() => Promise.resolve({})),
  registerAndSyncPush:   vi.fn(() => Promise.resolve()),
  resetOfflineCache:     vi.fn(() => Promise.resolve()),
}))

import { registerServiceWorker, registerAndSyncPush, resetOfflineCache } from '@/lib/pushClient'
import ServiceWorkerRegistration, {
  startServiceWorker, wantsOfflineReset, withoutOfflineReset,
} from './ServiceWorkerRegistration'

beforeEach(() => { vi.clearAllMocks() })

const fakeLocation = href => ({ href, replace: vi.fn() })

describe('ServiceWorkerRegistration', () => {
  // The worker is what opens the app with no connection, and the app works without
  // an account — so signing in is no longer what gets it registered.
  it('registers the worker when signed out, without touching push', () => {
    render(<ServiceWorkerRegistration isSignedIn={false} />)
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
    expect(registerAndSyncPush).not.toHaveBeenCalled()
  })

  it('also re-syncs the push subscription when signed in', () => {
    render(<ServiceWorkerRegistration isSignedIn />)
    expect(registerServiceWorker).toHaveBeenCalled()
    expect(registerAndSyncPush).toHaveBeenCalledTimes(1)
  })

  it('renders nothing', () => {
    const { container } = render(<ServiceWorkerRegistration isSignedIn={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the ?reset-offline=1 kill switch', () => {
  it('recognises only the exact flag', () => {
    expect(wantsOfflineReset('https://lv.test/?reset-offline=1')).toBe(true)
    expect(wantsOfflineReset('https://lv.test/today?x=2&reset-offline=1')).toBe(true)
    expect(wantsOfflineReset('https://lv.test/?reset-offline=0')).toBe(false)
    expect(wantsOfflineReset('https://lv.test/?reset-offline')).toBe(false)
    expect(wantsOfflineReset('https://lv.test/')).toBe(false)
    expect(wantsOfflineReset('not a url')).toBe(false)
  })

  it('strips the flag and keeps everything else', () => {
    expect(withoutOfflineReset('https://lv.test/?reset-offline=1')).toBe('https://lv.test/')
    expect(withoutOfflineReset('https://lv.test/today?x=2&reset-offline=1#top')).toBe('https://lv.test/today?x=2#top')
  })

  it('clears everything, then reloads without the flag — and registers nothing first', async () => {
    const location = fakeLocation('https://lv.test/today?reset-offline=1')
    await startServiceWorker({ isSignedIn: true, location })
    expect(resetOfflineCache).toHaveBeenCalledTimes(1)
    expect(location.replace).toHaveBeenCalledWith('https://lv.test/today')
    expect(registerServiceWorker).not.toHaveBeenCalled()
    expect(registerAndSyncPush).not.toHaveBeenCalled()
  })

  it('still reloads when clearing fails, so the flag cannot strand the page', async () => {
    resetOfflineCache.mockImplementationOnce(() => Promise.reject(new Error('SecurityError')))
    const location = fakeLocation('https://lv.test/?reset-offline=1')
    await startServiceWorker({ isSignedIn: false, location })
    expect(location.replace).toHaveBeenCalledWith('https://lv.test/')
  })

  it('leaves an ordinary load alone', async () => {
    const location = fakeLocation('https://lv.test/?new=task')
    await startServiceWorker({ isSignedIn: false, location })
    expect(resetOfflineCache).not.toHaveBeenCalled()
    expect(location.replace).not.toHaveBeenCalled()
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
  })
})
