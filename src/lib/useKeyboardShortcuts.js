'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { isDialogOpen } from '@/lib/dialogStack'

/**
 * Returns true when the event target is an editable element
 * (input, textarea, contenteditable, or select).
 * Shortcuts should be suppressed in these contexts.
 */
function isEditableTarget(e) {
  const tag = e.target?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (e.target?.isContentEditable) return true
  return false
}

/**
 * What one keydown does, given the handlers and what is open. Kept apart from the
 * hook so the rules can be read (and tested) in one place.
 *
 * Escape belongs to the dialog stack whenever a dialog is open (lib/dialogStack.js)
 * — it closes the top dialog and nothing else. Only when no dialog is open does it
 * reach `onEscape`, which closes the planner's non-modal layers (focus timer,
 * floating Corvus). An Escape something else already used (`defaultPrevented`) is
 * left alone too.
 *
 * The single-key shortcuts are off while typing, while a modifier is held, and while
 * any overlay is open — `modalOpen` from the page, or any dialog in the stack.
 */
export function handleShortcutKey(e, handlers, modalOpen = false) {
  const { onNewEvent, onNewTask, onNewNote, onToggleFocus, onShowHelp, onEscape } = handlers

  if (e.key === 'Escape') {
    if (e.defaultPrevented || isDialogOpen()) return
    onEscape?.()
    return
  }

  // All other shortcuts require no modifier keys
  if (e.metaKey || e.ctrlKey || e.altKey) return

  // Suppress while typing
  if (isEditableTarget(e)) return

  // Suppress while an overlay is open
  if (modalOpen || isDialogOpen()) return

  switch (e.key) {
    case 'n':
    case 'N':
      e.preventDefault()
      onNewEvent?.()
      break
    case 't':
    case 'T':
      e.preventDefault()
      onNewTask?.()
      break
    case 'w':
    case 'W':
      e.preventDefault()
      onNewNote?.()
      break
    // `/` shows the shortcuts overlay. Search moved to Ctrl+K only (handled
    // separately in page.js) — `/` is the more discoverable "what can I press"
    // key, and Ctrl+K is the search convention users already expect.
    case '/':
      e.preventDefault()
      onShowHelp?.()
      break
    case '?':
      e.preventDefault()
      onShowHelp?.()
      break
    case 'f':
    case 'F':
      e.preventDefault()
      onToggleFocus?.()
      break
    default:
      break
  }
}

/**
 * useKeyboardShortcuts
 *
 * Registers global single-key shortcuts for power-user navigation. See
 * handleShortcutKey for what each key does and when it is ignored.
 *
 * The listener is bound once, on mount, and reads the latest handlers from a ref.
 * The page passes a fresh object of inline handlers on every render, so binding
 * them directly re-subscribed the window listener on every render of the planner.
 *
 * @param {object} handlers
 *   - onNewEvent()       — N
 *   - onNewTask()        — T
 *   - onNewNote()        — W  ("write") — N is already taken by New Event
 *   - onToggleFocus()    — F
 *   - onShowHelp()       — / and ? (Shift+/)
 *   - onEscape()         — Escape, when no dialog is open
 * @param {boolean} modalOpen — true when an overlay the dialog stack doesn't know about is visible
 */
export function useKeyboardShortcuts(handlers, modalOpen = false) {
  const latest = useRef({ handlers, modalOpen })
  useLayoutEffect(() => { latest.current = { handlers, modalOpen } })

  useEffect(() => {
    function onKeyDown(e) {
      handleShortcutKey(e, latest.current.handlers, latest.current.modalOpen)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
