/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { msUntilNextTick, useNow } from './useNow'

afterEach(() => vi.useRealTimers())

describe('msUntilNextTick', () => {
  it('lands on the next whole second', () => {
    expect(msUntilNextTick(1000, 12_250)).toBe(750)
  })

  it('waits a full interval when already on the boundary', () => {
    expect(msUntilNextTick(60_000, 120_000)).toBe(60_000)
  })
})

describe('useNow', () => {
  it('ticks on the boundary, not an interval after mounting', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T09:00:00.400Z'))
    const { result } = renderHook(() => useNow(1000))
    const first = result.current.getTime()

    act(() => { vi.advanceTimersByTime(599) })
    expect(result.current.getTime()).toBe(first)

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.toISOString()).toBe('2026-10-07T09:00:01.000Z')

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.toISOString()).toBe('2026-10-07T09:00:02.000Z')
  })

  it('stops ticking once unmounted', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useNow(60_000))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
