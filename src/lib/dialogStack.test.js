/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  pushLayer, removeLayer, isDialogOpen, isTopLayer, reserveOrder,
  useDialogOpen, useDialogLayer, _resetDialogStack,
} from './dialogStack'

afterEach(() => _resetDialogStack())

/** Press Escape the way a browser does: on the focused element, bubbling up to window. */
function pressEscape(target = document.body, init = {}) {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe('dialogStack — Escape', () => {
  it('goes to the topmost layer only', () => {
    const below = vi.fn(), above = vi.fn()
    pushLayer(below)
    pushLayer(above)

    pressEscape()

    expect(above).toHaveBeenCalledTimes(1)
    expect(below).not.toHaveBeenCalled()
  })

  it('peels one layer per press as each one closes', () => {
    const calls = []
    const outer = pushLayer(() => { calls.push('outer'); removeLayer(outer) })
    const inner = pushLayer(() => { calls.push('inner'); removeLayer(inner) })

    pressEscape()
    pressEscape()
    pressEscape()

    expect(calls).toEqual(['inner', 'outer'])
  })

  it('marks the key as used, so later listeners can tell', () => {
    pushLayer(() => {})
    expect(pressEscape().defaultPrevented).toBe(true)
  })

  // The contract: something inside a dialog that uses Escape itself says so with
  // preventDefault, and the dialog stays open.
  it('ignores an Escape something else already handled', () => {
    const onEscape = vi.fn()
    pushLayer(onEscape)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.addEventListener('keydown', e => e.preventDefault())

    pressEscape(input)

    expect(onEscape).not.toHaveBeenCalled()
    input.remove()
  })

  it('ignores Escape while an IME composition is being cancelled', () => {
    const onEscape = vi.fn()
    pushLayer(onEscape)
    pressEscape(document.body, { isComposing: true })
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const onEscape = vi.fn()
    pushLayer(onEscape)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onEscape).not.toHaveBeenCalled()
  })

  // A dialog that has to be answered still sits in the stack, so Escape cannot fall
  // through and close the one beneath it.
  it('swallows Escape for a layer with no handler', () => {
    const below = vi.fn()
    pushLayer(below)
    pushLayer(null)

    const e = pressEscape()

    expect(below).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
  })

  it('orders layers by the order they reserved, not the order they registered', () => {
    const parent = vi.fn(), child = vi.fn()
    const parentOrder = reserveOrder()
    const childOrder  = reserveOrder()
    // Effects run children-first, so the child registers before its parent.
    pushLayer(child, childOrder)
    pushLayer(parent, parentOrder)

    pressEscape()

    expect(child).toHaveBeenCalled()
    expect(parent).not.toHaveBeenCalled()
  })
})

describe('dialogStack — listener lifetime', () => {
  it('is only on window while something is open', () => {
    const add    = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const a = pushLayer(() => {})
    const b = pushLayer(() => {})
    removeLayer(a)
    removeLayer(b)

    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    add.mockRestore()
    remove.mockRestore()
  })

  it('does nothing on Escape once the stack is empty', () => {
    const onEscape = vi.fn()
    removeLayer(pushLayer(onEscape))
    expect(pressEscape().defaultPrevented).toBe(false)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('tolerates removing a layer twice', () => {
    const id = pushLayer(() => {})
    removeLayer(id)
    expect(() => removeLayer(id)).not.toThrow()
    expect(isDialogOpen()).toBe(false)
  })
})

describe('dialogStack — queries', () => {
  it('isDialogOpen tracks the stack', () => {
    expect(isDialogOpen()).toBe(false)
    const id = pushLayer(() => {})
    expect(isDialogOpen()).toBe(true)
    removeLayer(id)
    expect(isDialogOpen()).toBe(false)
  })

  it('isTopLayer names only the topmost', () => {
    const a = pushLayer(() => {})
    const b = pushLayer(() => {})
    expect(isTopLayer(b)).toBe(true)
    expect(isTopLayer(a)).toBe(false)
    removeLayer(b)
    expect(isTopLayer(a)).toBe(true)
  })

  it('useDialogOpen re-renders when a layer opens or closes', () => {
    const { result } = renderHook(() => useDialogOpen())
    expect(result.current).toBe(false)
    let id
    act(() => { id = pushLayer(() => {}) })
    expect(result.current).toBe(true)
    act(() => removeLayer(id))
    expect(result.current).toBe(false)
  })
})

describe('useDialogLayer', () => {
  it('holds a layer while mounted and calls the latest handler', () => {
    const first = vi.fn(), second = vi.fn()
    const { rerender, unmount } = renderHook(({ fn }) => useDialogLayer(fn), { initialProps: { fn: first } })
    expect(isDialogOpen()).toBe(true)

    rerender({ fn: second })
    pressEscape()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    unmount()
    expect(isDialogOpen()).toBe(false)
  })

  it('registers nothing while disabled', () => {
    const { rerender } = renderHook(({ on }) => useDialogLayer(() => {}, on), { initialProps: { on: false } })
    expect(isDialogOpen()).toBe(false)
    rerender({ on: true })
    expect(isDialogOpen()).toBe(true)
  })

  it('hands back the layer id for isTopLayer', () => {
    const { result } = renderHook(() => useDialogLayer(() => {}))
    expect(isTopLayer(result.current.current)).toBe(true)
  })
})
