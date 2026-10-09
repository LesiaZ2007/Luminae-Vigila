'use client'

import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'

/**
 * Swipe-to-act for task rows on touch: right to complete, left to delete.
 *
 * The task list and the custom lists had identical copies of this — the same
 * thresholds, the same axis lock, the same timings — differing only in how the
 * coloured backgrounds were drawn. The behaviour lives here once; the two looks
 * are kept exactly as they were, as presets.
 *
 *   const swipe = useSwipeActions({ enabled: isMobile, onSwipeRight, onSwipeLeft })
 *   <li {...swipe.handlers}>
 *     {isMobile && <SwipeBackgrounds dx={swipe.dx} look="todo" />}
 *     <div style={{ transform: swipe.transform, transition: swipe.committing ? … : … }}>
 */

/** Travel needed to act. Short of it the row snaps back, so a sloppy scroll is safe. */
export const SWIPE_THRESHOLD = 72
/** The row stops following the finger here; the background is fully shown well before. */
export const SWIPE_MAX = 100
/** Movement before deciding whether this is a swipe or a scroll. */
export const SWIPE_AXIS_LOCK = 6
/** How long the row takes to slide off before the action runs. */
export const SWIPE_COMMIT_MS = 260

/**
 * Options
 *   enabled        attach nothing when false (desktop)
 *   onSwipeRight   () => void — complete
 *   onSwipeLeft    () => void — delete
 *   canSwipeRight  false for a row that is already done: a right swipe on it snaps back
 *
 * Returns
 *   handlers    touch handlers for the row element ({} when disabled)
 *   dx          current travel in px, clamped to ±SWIPE_MAX
 *   committing  true while the row slides off, before the action runs
 *   transform   the main row's translateX (undefined when disabled)
 */
export function useSwipeActions({ enabled = true, onSwipeRight, onSwipeLeft, canSwipeRight = true }) {
  const swipeRef = useRef({ startX: 0, startY: 0, dx: 0, locked: null, active: false })
  const [dx,         setDx]         = useState(0)
  const [committing, setCommitting] = useState(false)

  function onTouchStart(e) {
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, locked: null, active: true }
  }

  function onTouchMove(e) {
    const s = swipeRef.current
    if (!s.active) return
    const t  = e.touches[0]
    const mx = t.clientX - s.startX
    const my = t.clientY - s.startY

    // Decide the axis once, after a few px, so a swipe and a scroll never fight.
    if (s.locked === null) {
      if (Math.abs(mx) < SWIPE_AXIS_LOCK && Math.abs(my) < SWIPE_AXIS_LOCK) return
      s.locked = Math.abs(mx) >= Math.abs(my) ? 'x' : 'y'
    }
    if (s.locked === 'y') return // vertical scroll — leave it to the browser

    e.preventDefault()
    s.dx = mx
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, mx)))
  }

  function slideOffThen(action) {
    setCommitting(true)
    setTimeout(() => {
      setDx(0)
      setCommitting(false)
      action?.()
    }, SWIPE_COMMIT_MS)
  }

  function onTouchEnd() {
    const s = swipeRef.current
    s.active = false
    if (s.locked !== 'x') { setDx(0); return }

    if (s.dx >= SWIPE_THRESHOLD && canSwipeRight) slideOffThen(onSwipeRight)
    else if (s.dx <= -SWIPE_THRESHOLD)            slideOffThen(onSwipeLeft)
    else setDx(0) // fell short — snap back
  }

  return {
    handlers: enabled ? { onTouchStart, onTouchMove, onTouchEnd } : {},
    dx,
    committing,
    transform: enabled
      ? (committing ? `translateX(${dx >= 0 ? '100%' : '-100%'})` : `translateX(${dx}px)`)
      : undefined,
  }
}

/* The two looks, exactly as each row drew them before they shared this. The task
   row is a little roomier — larger radius, inset and icons — and its trash is the
   app's own glyph rather than Lucide's. */
const LOOKS = {
  todo: {
    radius: 12, inset: 16,
    check: 20,
    trash: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    ),
  },
  list: {
    radius: 10, inset: 14,
    check: 18,
    trash: <Trash2 size={16} color="white" />,
  },
}

/**
 * The green "complete" and red "delete" layers behind a swiping row, each fading in
 * with the travel towards its threshold. Sits under the row's main content, which is
 * what moves; clipped to the row's own radius so it never shows past the corners.
 */
export function SwipeBackgrounds({ dx, look = 'todo' }) {
  const { radius, inset, check, trash } = LOOKS[look] ?? LOOKS.todo
  const layer = { position: 'absolute', inset: 0, borderRadius: radius, display: 'flex', alignItems: 'center', transition: 'opacity .1s' }
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ ...layer, background: '#10b981', paddingLeft: inset, opacity: dx > 8 ? Math.min(1, dx / SWIPE_THRESHOLD) : 0 }}>
        <svg width={check} height={check} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style={{ ...layer, background: '#ef4444', justifyContent: 'flex-end', paddingRight: inset, opacity: dx < -8 ? Math.min(1, -dx / SWIPE_THRESHOLD) : 0 }}>
        {trash}
      </div>
    </div>
  )
}
