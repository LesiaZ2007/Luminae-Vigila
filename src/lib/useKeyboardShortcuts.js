'use client'

import { useEffect, useCallback } from 'react'

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
 * useKeyboardShortcuts
 *
 * Registers global single-key shortcuts for power-user navigation.
 * All shortcuts are ignored when:
 *   - The user is typing in an input / textarea / contenteditable / select
 *   - A modal overlay is open (detected via `modalOpen` prop), EXCEPT for
 *     Escape (closes the modal) and ? (shows the help overlay even if another
 *     modal is open — ? is only fired when no modal is open per spec, but
 *     Escape is always active regardless).
 *
 * @param {object} handlers
 *   - onNewEvent()       — N
 *   - onNewTask()        — T
 *   - onSearch()         — / (forward-slash)
 *   - onToggleFocus()    — F
 *   - onShowHelp()       — ? (Shift+/)
 *   - onQuickAdd()       — Q  (focus the quick-add omnibar)
 *   - onEscape()         — Escape (also called when modals are open)
 * @param {boolean} modalOpen — true when ANY overlay modal is visible
 */
export function useKeyboardShortcuts({ onNewEvent, onNewTask, onSearch, onToggleFocus, onShowHelp, onQuickAdd, onEscape }, modalOpen = false) {
  const handleKeyDown = useCallback((e) => {
    // Escape is always active — used to close whatever is open
    if (e.key === 'Escape') {
      onEscape?.()
      return
    }

    // All other shortcuts require no modifier keys
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // Suppress while typing
    if (isEditableTarget(e)) return

    // Suppress while a modal is open (except Escape handled above)
    if (modalOpen) return

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
      case '/':
        e.preventDefault()
        onSearch?.()
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
      case 'q':
      case 'Q':
        e.preventDefault()
        onQuickAdd?.()
        break
      default:
        break
    }
  }, [onNewEvent, onNewTask, onSearch, onToggleFocus, onShowHelp, onQuickAdd, onEscape, modalOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
