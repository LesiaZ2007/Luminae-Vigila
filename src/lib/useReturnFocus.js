'use client'

import { useEffect, useRef } from 'react'

/**
 * Give focus back to a popover's trigger when the popover closes from the keyboard.
 *
 * Inside a dialog the menus and pickers are reachable with Tab (see Dialog.js), so a
 * keyboard user can be focused *inside* one when it closes — Enter on an option,
 * Enter in the date field, Escape. Unmounting the focused element drops focus to
 * <body>, and the dialog's Tab trap then treats the next Tab as coming from outside
 * and sends it to the first field: after every choice the whole form had to be tabbed
 * through again, and a screen reader lost its place.
 *
 * Only for a close that came from the keyboard. After a mouse pick Chrome has focused
 * the clicked option too, but moving focus to the trigger then would light up its
 * focus ring for no reason; a mouse user is not navigating by focus.
 *
 * @param {boolean} open
 * @param {{current: HTMLElement|null}} popupRef  the popover's own element
 * @param {{current: HTMLElement|null}} triggerRef what focus goes back to
 */
export default function useReturnFocus(open, popupRef, triggerRef) {
  const state = useRef({ inside: false, keyboard: false })

  useEffect(() => {
    if (!open) return
    const s = state.current
    // The trigger stays mounted while the popover opens and closes, so it is the same node.
    const trigger = triggerRef.current
    s.inside = false
    s.keyboard = false
    const within = target => !!popupRef.current && popupRef.current.contains(target)
    const onFocusIn = e => { if (within(e.target)) s.inside = true }
    const onKeyDown = e => { if (within(e.target)) s.keyboard = true }
    const onPointer = () => { s.keyboard = false }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointer, true)
      if (!s.inside || !s.keyboard) return
      // After the popover has gone: only if focus went down with it.
      requestAnimationFrame(() => {
        const active = document.activeElement
        const lost = !active || active === document.body || !active.isConnected
        if (lost && trigger?.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }, [open, popupRef, triggerRef])
}
