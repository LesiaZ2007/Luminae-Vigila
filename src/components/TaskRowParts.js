'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'

/**
 * The small pieces a task row is built from, shared by the To-Do panel's rows and
 * the custom-list rows.
 *
 * The two rows were written as copies and have drifted into two deliberately
 * different looks — the task row a touch roomier, the list row tinted by its list's
 * colour. Those differences are kept, as named presets ('todo' and 'list'), so the
 * mechanics can be shared without either row changing how it looks.
 */

const ACTION_LOOKS = {
  todo: { padding: 2, borderRadius: 4, rest: 0.4,  touch: 0.7  },
  list: { padding: 4, borderRadius: 6, rest: 0.45, touch: 0.75 },
}

/**
 * Style for the per-row action buttons (+ / ⋯ / trash).
 *
 * Touch gets near-full opacity because there is no hover to reveal them; on desktop
 * they sit dimmed until the row is hovered, so a long list does not read as a wall
 * of icons — but they are always there, so nothing has to be discovered by accident.
 */
export function rowActionStyle(hovered, isMobile, look = 'todo') {
  const l = ACTION_LOOKS[look] ?? ACTION_LOOKS.todo
  return {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
    padding: l.padding, borderRadius: l.borderRadius, flexShrink: 0, display: 'flex',
    opacity: isMobile ? l.touch : hovered ? 1 : l.rest,
    transition: 'opacity .13s, color .13s',
  }
}

/**
 * The round tick-box at the front of a row.
 *
 *   color        ring colour while unticked (the task's category, or the border)
 *   checkedColor fill and ring once ticked
 *   bounce       play the little pop — the task row does, on the tick that completes
 *   label        its accessible name; the box itself is only a ring and a tick
 *
 * The click event goes through untouched: the task row aims its confetti from the
 * box's own position.
 */
export function TaskCheckbox({
  checked, onClick, label,
  color = 'var(--border)', checkedColor = color,
  size = 18, strokeWidth = 1.8, marginTop = 0, transition = 'all .2s', bounce = false,
}) {
  const tick = Math.round(size / 2)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        marginTop, width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${checked ? checkedColor : color}`,
        background: checked ? checkedColor : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition,
        animation: bounce ? 'check-bounce 0.32s ease forwards' : 'none',
      }}
    >
      {checked && (
        <svg width={tick} height={tick} viewBox="0 0 10 10" fill="none">
          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

const HANDLE_LOOKS = {
  todo: { marginTop: 4, opacity: 0.6, size: 13 },
  list: { marginTop: 3, opacity: 0.5, size: 12 },
}

/**
 * The drag grip, as a real button.
 *
 * It used to be a bare <div> that only a mouse could use. As a button it takes
 * focus, so ↑ / ↓ can move the row (see useDragReorder), and it says what it is to a
 * screen reader. It stays invisible until the row is hovered, as before — and also
 * while it has keyboard focus, since a focused control you cannot see is no use.
 *
 *   handle   handleProps(id) from useDragReorder
 *   label    what the row is called, for "Reorder <label>"
 */
export function ReorderHandle({ handle, label, hovered, look = 'todo' }) {
  const l = HANDLE_LOOKS[look] ?? HANDLE_LOOKS.todo
  const [focusVisible, setFocusVisible] = useState(false)

  function onFocus(e) {
    /* :focus-visible, not :focus — a mouse press focuses the button too, and the
       grip should not then stay lit after the pointer has left the row. */
    let visible = true
    try { visible = e.currentTarget.matches(':focus-visible') } catch { /* older engines: assume keyboard */ }
    setFocusVisible(visible)
  }

  return (
    <button
      {...handle}
      type="button"
      className="lv-focusable"
      aria-label={`Reorder ${label}`}
      title="Drag to reorder, or focus and use ↑ ↓"
      onFocus={onFocus}
      onBlur={() => setFocusVisible(false)}
      style={{
        marginTop: l.marginTop, color: 'var(--text-3)', cursor: 'grab', flexShrink: 0,
        opacity: focusVisible ? 1 : hovered ? l.opacity : 0,
        transition: 'opacity .13s', touchAction: 'none',
        display: 'flex', padding: 0, border: 'none', background: 'none',
        borderRadius: 4, outlineOffset: 1,
      }}
    >
      <GripVertical size={l.size} />
    </button>
  )
}
