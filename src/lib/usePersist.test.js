/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { renderHook, act } from '@testing-library/react'
import { readStored, usePersist } from './usePersist'

// The pairing page.js uses for every stored collection.
function usePersistentState(key, fallback, revive) {
  const [value, setValue] = useState(() => readStored(key, fallback, revive))
  usePersist(key, value)
  return [value, setValue]
}

beforeEach(() => localStorage.clear())

describe('readStored', () => {
  it('returns the fallback when the key is missing', () => {
    expect(readStored('lv-x', ['default'])).toEqual(['default'])
  })

  it('parses a stored value', () => {
    localStorage.setItem('lv-x', JSON.stringify([{ id: 'a' }]))
    expect(readStored('lv-x', [])).toEqual([{ id: 'a' }])
  })

  it('falls back on a corrupt value instead of throwing', () => {
    localStorage.setItem('lv-x', '{not json')
    expect(readStored('lv-x', [])).toEqual([])
  })

  it('runs revive on the parsed value only', () => {
    const revive = vi.fn(list => list.filter(x => !x.gone))
    localStorage.setItem('lv-x', JSON.stringify([{ id: 'a' }, { id: 'b', gone: true }]))
    expect(readStored('lv-x', [], revive)).toEqual([{ id: 'a' }])
    expect(revive).toHaveBeenCalledTimes(1)

    revive.mockClear()
    expect(readStored('lv-missing', ['fb'], revive)).toEqual(['fb'])
    expect(revive).not.toHaveBeenCalled()
  })

  it('lets revive reject a shape it cannot use', () => {
    // The event-category rule: an empty list would leave no categories and no
    // obvious way back, so it falls through to the defaults.
    const nonEmpty = v => (Array.isArray(v) && v.length > 0 ? v : ['defaults'])
    localStorage.setItem('lv-x', '[]')
    expect(readStored('lv-x', ['defaults'], nonEmpty)).toEqual(['defaults'])
  })
})

describe('readStored + usePersist', () => {
  it('starts from the stored value on the very first render', () => {
    localStorage.setItem('lv-notes', JSON.stringify([{ id: 'n1' }]))
    const seen = []
    renderHook(() => {
      const [notes] = usePersistentState('lv-notes', [])
      seen.push(notes)
    })
    // No empty first pass for an effect to fill in later.
    expect(seen[0]).toEqual([{ id: 'n1' }])
  })

  it('never writes the empty fallback over stored data on mount', () => {
    localStorage.setItem('lv-events', JSON.stringify([{ id: 'e1' }]))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => usePersistentState('lv-events', []))
    for (const [key, value] of setItem.mock.calls) {
      if (key === 'lv-events') expect(value).toBe(JSON.stringify([{ id: 'e1' }]))
    }
    setItem.mockRestore()
  })

  it('keeps an updater queued by a mount effect', () => {
    // The shared-note case: something prepends during mount, and the stored list
    // must not land on top of it afterwards.
    localStorage.setItem('lv-notes', JSON.stringify([{ id: 'old' }]))
    const { result } = renderHook(() => usePersistentState('lv-notes', []))
    act(() => result.current[1](prev => [{ id: 'shared' }, ...prev]))
    expect(result.current[0]).toEqual([{ id: 'shared' }, { id: 'old' }])
    expect(JSON.parse(localStorage.getItem('lv-notes'))).toEqual([{ id: 'shared' }, { id: 'old' }])
  })

  it('reads each key on its own, so one corrupt key spares the rest', () => {
    localStorage.setItem('lv-todo-cats', '{corrupt')
    localStorage.setItem('lv-notes', JSON.stringify([{ id: 'n1' }]))
    const { result } = renderHook(() => ({
      cats:  usePersistentState('lv-todo-cats', ['default'])[0],
      notes: usePersistentState('lv-notes', [])[0],
    }))
    expect(result.current.cats).toEqual(['default'])
    expect(result.current.notes).toEqual([{ id: 'n1' }])
    expect(JSON.parse(localStorage.getItem('lv-notes'))).toEqual([{ id: 'n1' }])
  })

  it('persists every update', () => {
    const { result } = renderHook(() => usePersistentState('lv-todos', []))
    act(() => result.current[1]([{ id: 't1' }]))
    expect(JSON.parse(localStorage.getItem('lv-todos'))).toEqual([{ id: 't1' }])
  })

  it('survives storage refusing the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => usePersistentState('lv-todos', []))
    act(() => result.current[1]([{ id: 't1' }]))
    expect(result.current[0]).toEqual([{ id: 't1' }])
    setItem.mockRestore()
  })
})
