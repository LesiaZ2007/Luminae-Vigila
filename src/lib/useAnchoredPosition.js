'use client'

/**
 * Position a popover against a trigger without letting it leave the screen.
 *
 * Both pickers previously did their own arithmetic and both got it wrong in the
 * same two ways. DatePicker flipped above the trigger when there was no room
 * below, using a hardcoded 360px guess at its own height — near the top of the
 * screen that produces a negative `top` and the calendar's first weeks are simply
 * unreachable. TimePicker never flipped at all: it was `position: absolute` inside
 * the trigger's wrapper, so it opened downward off the bottom of the viewport and
 * was clipped by any scrolling ancestor on the way. Neither clamped horizontally,
 * so a trigger near the right edge pushed a fixed-width popover past it.
 *
 * This measures the popover instead of guessing, flips only when flipping actually
 * helps, and clamps on both axes as a last resort — a popover that is slightly
 * misaligned is always better than one you cannot reach.
 *
 * Returns `{ top, left, width, maxHeight, placement }` for a `position: fixed`
 * element. `maxHeight` is set whenever the popover cannot have its full height on
 * the better side; the caller is expected to make its content scroll.
 */
import { useState, useLayoutEffect, useCallback } from 'react'

/** Keeps a popover from sitting flush against the screen edge. */
const MARGIN = 8

/** Space between the trigger and the popover. */
const GAP = 6

export default function useAnchoredPosition(open, triggerRef, popupRef, options = {}) {
  const { minWidth = 0, matchTriggerWidth = false, align = 'start' } = options

  const [pos, setPos] = useState({ top: 0, left: 0, width: minWidth, maxHeight: undefined, placement: 'bottom' })

  const calc = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const vw   = window.innerWidth
    const vh   = window.innerHeight

    const width = Math.max(minWidth, matchTriggerWidth ? rect.width : 0) ||
                  popupRef.current?.offsetWidth || minWidth

    // Measured, not assumed. On the very first frame the popover may not be in the
    // DOM yet, in which case minWidth-ish defaults apply and the layout effect runs
    // again once it is — which is why this is useLayoutEffect and not useEffect:
    // the corrected position is committed before the browser paints.
    const popH = popupRef.current?.offsetHeight ?? 0

    const spaceBelow = vh - rect.bottom - GAP - MARGIN
    const spaceAbove = rect.top - GAP - MARGIN

    // Prefer below. Flip up only when below genuinely doesn't fit AND above is
    // roomier — flipping into an equally bad spot just moves the problem.
    const fitsBelow = popH > 0 ? popH <= spaceBelow : spaceBelow >= 200
    const placement = fitsBelow || spaceBelow >= spaceAbove ? 'bottom' : 'top'

    const avail = placement === 'bottom' ? spaceBelow : spaceAbove
    // Only constrain when we must; an unset maxHeight lets content size itself.
    const maxHeight = popH > avail && avail > 0 ? avail : undefined

    // How tall the popover will actually render: its natural height, or the cap
    // when one was needed.
    const height = maxHeight ?? popH
    let top = placement === 'bottom' ? rect.bottom + GAP : rect.top - GAP - height

    // Clamp vertically for the case neither side fits — e.g. a short viewport with
    // the on-screen keyboard open on a phone.
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - height))

    let left = align === 'end'    ? rect.right - width
             : align === 'center' ? rect.left + rect.width / 2 - width / 2
             : rect.left
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN))

    setPos(prev => {
      const next = { top, left, width, maxHeight, placement }
      // setState in a layout effect that runs on scroll would loop without this.
      for (const k of ['top', 'left', 'width', 'maxHeight', 'placement']) {
        if (prev[k] !== next[k]) return next
      }
      return prev
    })
  }, [triggerRef, popupRef, minWidth, matchTriggerWidth, align])

  useLayoutEffect(() => {
    if (!open) return
    calc()

    // `true` captures scrolls on any ancestor, not just the window — the pickers
    // live inside scrolling panels and modals.
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)

    // The popover's own height changes as its content does (the calendar grid gains
    // a row between months, an error line appears). Without this the flip decision
    // is made against a stale measurement.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null
    if (ro && popupRef.current) ro.observe(popupRef.current)

    // The visual viewport shrinks when a mobile keyboard opens; `resize` alone does
    // not always fire for that.
    window.visualViewport?.addEventListener('resize', calc)

    return () => {
      window.removeEventListener('scroll', calc, true)
      window.removeEventListener('resize', calc)
      window.visualViewport?.removeEventListener('resize', calc)
      ro?.disconnect()
    }
  }, [open, calc, popupRef])

  return pos
}
