import { describe, it, expect } from 'vitest'
import { SIGNED_IN_KEY, rememberSignedIn, forgetSignedIn, wasSignedIn, isSessionExpired } from './sessionExpiry'

function memoryStorage() {
  const m = new Map()
  return {
    getItem:    k => (m.has(k) ? m.get(k) : null),
    setItem:    (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  }
}

describe('signed-in record', () => {
  it('is absent on a device that has never signed in', () => {
    expect(wasSignedIn(memoryStorage())).toBe(false)
  })

  it('survives until an explicit sign out', () => {
    const s = memoryStorage()
    rememberSignedIn(s)
    expect(wasSignedIn(s)).toBe(true)
    expect(s.getItem(SIGNED_IN_KEY)).toBe('1')
    forgetSignedIn(s)
    expect(wasSignedIn(s)).toBe(false)
  })

  it('treats storage that throws as never signed in, rather than throwing', () => {
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(() => rememberSignedIn(broken)).not.toThrow()
    expect(() => forgetSignedIn(broken)).not.toThrow()
    expect(wasSignedIn(broken)).toBe(false)
  })
})

describe('isSessionExpired', () => {
  it('is true only for a 401', () => {
    expect(isSessionExpired({ status: 401 })).toBe(true)
  })

  it('is false for failures that say nothing about the session', () => {
    for (const status of [200, 403, 500, 502, 503]) {
      expect(isSessionExpired({ status })).toBe(false)
    }
    expect(isSessionExpired(null)).toBe(false)
    expect(isSessionExpired(undefined)).toBe(false)
  })
})
