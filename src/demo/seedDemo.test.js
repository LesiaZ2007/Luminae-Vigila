import { describe, expect, it, vi } from 'vitest'
import { buildDemoSeed } from '@/demo/seedDemo'
import { disableDemoStore, enableDemoStore, readStored } from '@/lib/usePersist'

describe('luminae /demo store and seed', () => {
  it('builds relative-dated demo entries across classes, events, todos, lists, and notes', () => {
    const seed = buildDemoSeed(new Date(2026, 10, 27, 10, 0, 0))
    expect(seed['lv-canvas-classes'].length).toBeGreaterThanOrEqual(2)
    expect(seed['lv-events'].length).toBeGreaterThanOrEqual(3)
    expect(seed['lv-todos'].length).toBeGreaterThanOrEqual(3)
    expect(seed['lv-notes'].length).toBeGreaterThanOrEqual(2)
    expect(seed['lv-custom-lists'].length).toBe(1)
  })

  it('serves reads from memory while demo store is active without touching localStorage', () => {
    const getItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem })
    try {
      enableDemoStore({ 'lv-events': [{ id: 'demo_evt' }] })
      expect(readStored('lv-events', [])).toEqual([{ id: 'demo_evt' }])
      expect(readStored('lv-missing', ['fallback'])).toEqual(['fallback'])
      expect(getItem).not.toHaveBeenCalled()
    } finally {
      disableDemoStore()
      vi.unstubAllGlobals()
    }
  })
})
