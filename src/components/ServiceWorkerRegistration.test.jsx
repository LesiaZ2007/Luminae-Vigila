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
  startServiceWorker, wantsOfflineReset, withoutOfflineReset, isCachingWorker,
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

describe('handing loaded build files over to the worker', () => {
  const ORIGIN = 'https://lv.test'

  /** A PerformanceObserver whose entries the test pushes in by hand. */
  function fakeObserver() {
    const observers = []
    class Observer {
      constructor(callback) { this.callback = callback; observers.push(this) }
      observe(options) { this.options = options }
    }
    const report = (...entries) => {
      for (const o of observers) o.callback({ getEntries: () => entries })
    }
    return { Observer, observers, report }
  }

  const CACHING_WORKER   = `${ORIGIN}/sw.js?v=2026-10-07T10%3A00%3A00.000Z-ccccccc`
  // What main registered before the cache existed: push only, no message handler.
  const PUSH_ONLY_WORKER = `${ORIGIN}/sw.js`

  const worker = scriptURL => ({ scriptURL, postMessage: vi.fn() })

  function fakeServiceWorker(controlled, scriptURL = CACHING_WORKER) {
    const listeners = {}
    const sw = {
      controller: controlled ? worker(scriptURL) : null,
      addEventListener: (type, fn) => { listeners[type] = fn },
      takeControl(next = CACHING_WORKER) {
        sw.controller = worker(next)
        listeners.controllerchange?.()
      },
    }
    return sw
  }

  const entry = (path, workerStart = 0) => ({ name: `${ORIGIN}${path}`, workerStart })

  // The module keeps a once-per-page guard, so each test gets a fresh copy.
  async function freshHandOver() {
    vi.resetModules()
    return (await import('./ServiceWorkerRegistration')).handOverLoadedAssets
  }

  it('posts the build files that bypassed the worker, buffered from page start', async () => {
    const handOverLoadedAssets = await freshHandOver()
    const { Observer, observers, report } = fakeObserver()
    const serviceWorker = fakeServiceWorker(true)
    handOverLoadedAssets({ serviceWorker, Observer, origin: ORIGIN })
    expect(observers[0].options).toEqual({ type: 'resource', buffered: true })

    report(
      entry('/_next/static/chunks/calendar.js'),
      entry('/_next/static/chunks/through-the-worker.js', 12.5),
      entry('/icon.svg'),
      { name: 'https://fonts.example/_next/static/x.woff2', workerStart: 0 },
    )
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'cache-urls',
      urls: [`${ORIGIN}/_next/static/chunks/calendar.js`],
    })
  })

  it('holds them until the worker takes control, then sends them once', async () => {
    const handOverLoadedAssets = await freshHandOver()
    const { Observer, report } = fakeObserver()
    const serviceWorker = fakeServiceWorker(false)
    handOverLoadedAssets({ serviceWorker, Observer, origin: ORIGIN })

    report(entry('/_next/static/chunks/main.js'), entry('/_next/static/chunks/notes.js'))
    serviceWorker.takeControl()
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledTimes(1)
    expect(serviceWorker.controller.postMessage.mock.calls[0][0].urls).toHaveLength(2)

    // Nothing new to say: no further message.
    report(entry('/_next/static/chunks/later.js', 3))
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledTimes(1)
  })

  // The first visit after the deploy that brought the cache: the old push-only worker
  // is still in control when the first timings report, and would drop the list.
  it('holds them past a worker that does not cache, for the one that does', async () => {
    const handOverLoadedAssets = await freshHandOver()
    const { Observer, report } = fakeObserver()
    const serviceWorker = fakeServiceWorker(true, PUSH_ONLY_WORKER)
    const pushOnly = serviceWorker.controller
    handOverLoadedAssets({ serviceWorker, Observer, origin: ORIGIN })

    report(entry('/_next/static/chunks/main.js'), entry('/_next/static/chunks/calendar.js'))
    expect(pushOnly.postMessage).not.toHaveBeenCalled()

    serviceWorker.takeControl(CACHING_WORKER)
    expect(pushOnly.postMessage).not.toHaveBeenCalled()
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledTimes(1)
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'cache-urls',
      urls: [`${ORIGIN}/_next/static/chunks/main.js`, `${ORIGIN}/_next/static/chunks/calendar.js`],
    })
  })

  it('tells a caching worker by the version on its script URL', () => {
    expect(isCachingWorker(worker(CACHING_WORKER))).toBe(true)
    expect(isCachingWorker(worker(`${ORIGIN}/sw.js?v=dev`))).toBe(true)
    expect(isCachingWorker(worker(PUSH_ONLY_WORKER))).toBe(false)
    expect(isCachingWorker(worker('not a url'))).toBe(false)
    expect(isCachingWorker(null)).toBe(false)
  })

  it('starts only once per page', async () => {
    const handOverLoadedAssets = await freshHandOver()
    const { Observer, observers } = fakeObserver()
    const serviceWorker = fakeServiceWorker(true)
    handOverLoadedAssets({ serviceWorker, Observer, origin: ORIGIN })
    handOverLoadedAssets({ serviceWorker, Observer, origin: ORIGIN })
    expect(observers).toHaveLength(1)
  })

  it('does nothing where the APIs are missing', async () => {
    const handOverLoadedAssets = await freshHandOver()
    const { Observer } = fakeObserver()
    expect(() => handOverLoadedAssets({ serviceWorker: undefined, Observer, origin: ORIGIN })).not.toThrow()
    expect(() => handOverLoadedAssets({ serviceWorker: fakeServiceWorker(true), Observer: undefined, origin: ORIGIN })).not.toThrow()
  })
})
