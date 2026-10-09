/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { handleShortcutKey, useKeyboardShortcuts } from './useKeyboardShortcuts'
import { pushLayer, _resetDialogStack } from './dialogStack'

afterEach(() => _resetDialogStack())

function key(k, init = {}) {
  return new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
}

function handlers() {
  return {
    onNewEvent: vi.fn(), onNewTask: vi.fn(), onNewNote: vi.fn(),
    onToggleFocus: vi.fn(), onShowHelp: vi.fn(), onEscape: vi.fn(),
  }
}

describe('handleShortcutKey — Escape', () => {
  it('closes the planner’s own layers when no dialog is open', () => {
    const h = handlers()
    handleShortcutKey(key('Escape'), h)
    expect(h.onEscape).toHaveBeenCalledTimes(1)
  })

  // One Escape used to close a dialog and the focus timer behind it together.
  it('leaves Escape to the dialog stack while a dialog is open', () => {
    const h = handlers()
    pushLayer(() => {})
    handleShortcutKey(key('Escape'), h)
    expect(h.onEscape).not.toHaveBeenCalled()
  })

  it('ignores an Escape something else already used', () => {
    const h = handlers()
    const e = key('Escape')
    e.preventDefault()
    handleShortcutKey(e, h)
    expect(h.onEscape).not.toHaveBeenCalled()
  })
})

describe('handleShortcutKey — letter shortcuts', () => {
  it('fires when nothing is open', () => {
    const h = handlers()
    handleShortcutKey(key('n'), h)
    handleShortcutKey(key('T'), h)
    handleShortcutKey(key('/'), h)
    expect(h.onNewEvent).toHaveBeenCalled()
    expect(h.onNewTask).toHaveBeenCalled()
    expect(h.onShowHelp).toHaveBeenCalled()
  })

  // N behind the detail view, or F behind the onboarding tour, opened things the
  // page's own list of open overlays didn't know to block.
  it('is off while any dialog is open', () => {
    const h = handlers()
    pushLayer(() => {})
    handleShortcutKey(key('n'), h)
    handleShortcutKey(key('f'), h)
    handleShortcutKey(key('/'), h)
    expect(h.onNewEvent).not.toHaveBeenCalled()
    expect(h.onToggleFocus).not.toHaveBeenCalled()
    expect(h.onShowHelp).not.toHaveBeenCalled()
  })

  it('is off while the page says an overlay is open', () => {
    const h = handlers()
    handleShortcutKey(key('n'), h, true)
    expect(h.onNewEvent).not.toHaveBeenCalled()
  })

  it('is off while typing', () => {
    const h = handlers()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.addEventListener('keydown', e => handleShortcutKey(e, h))
    input.dispatchEvent(key('n'))
    expect(h.onNewEvent).not.toHaveBeenCalled()
    input.remove()
  })

  it('is off with a modifier held', () => {
    const h = handlers()
    handleShortcutKey(key('n', { ctrlKey: true }), h)
    expect(h.onNewEvent).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts', () => {
  it('binds the window listener once and calls the latest handlers', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const first = handlers(), second = handlers()
    const { rerender, unmount } = renderHook(({ h }) => useKeyboardShortcuts(h), { initialProps: { h: first } })
    rerender({ h: second })
    rerender({ h: second })

    window.dispatchEvent(key('n'))

    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(first.onNewEvent).not.toHaveBeenCalled()
    expect(second.onNewEvent).toHaveBeenCalledTimes(1)
    unmount()
    add.mockRestore()
  })
})
