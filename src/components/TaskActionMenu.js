'use client'

/**
 * What a task offers when you click it on a calendar.
 *
 * Both calendars used to answer a click on a task by opening the full edit form. That
 * is the wrong default for the same reason it was wrong for events (see
 * EventDetailModal): most clicks on a task are *"done"*, and the cheapest action was
 * costing a modal, a scroll to the checkbox, and a save. Delete was worse — it wasn't
 * reachable from either calendar at all.
 *
 * So three rows, ticking off first. Editing stays one click away, which is where it
 * belongs rather than being the only thing on offer.
 *
 * Anchored to whatever was clicked — a chip, a row, or a bare point on the month grid,
 * which is why this takes a rect rather than a ref. Positioning goes through the shared
 * `useAnchoredPosition` so it can't open off the bottom of the screen; see that hook for
 * the arithmetic both date pickers used to get wrong.
 */

import { useRef, useEffect, useMemo } from 'react'
import { CircleCheck, Circle, Pencil, Trash2 } from 'lucide-react'
import useAnchoredPosition from '@/lib/useAnchoredPosition'

const MENU_WIDTH = 184

function Row({ icon: Icon, label, danger, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        /* 40px of height without a fixed one, so a long label can still wrap. */
        padding: '10px 12px', borderRadius: 8, border: 'none', background: 'transparent',
        color: danger ? 'var(--red)' : 'var(--text)',
        fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
        textAlign: 'left', cursor: 'pointer', transition: 'background .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,.1)' : 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={14} style={{ flexShrink: 0 }} />
      {label}
    </button>
  )
}

/**
 * @param anchor   DOMRect-ish for the thing clicked. A click with no element behind it
 *                 (the month grid's own background) can pass a zero-size rect at the
 *                 pointer, which positions just as well.
 * @param title    shown as a heading, so it's clear which task the rows act on
 * @param done     drives whether the first row ticks or un-ticks
 * @param onToggle, onEdit, onDelete — omit any to leave that row out
 * @param onClose  called after any row, and on Escape or an outside click
 */
export default function TaskActionMenu({ anchor, title, done, onToggle, onEdit, onDelete, onClose }) {
  const popupRef = useRef(null)

  /* The hook wants a ref to measure; what we have is a rect. A stand-in with just
     getBoundingClientRect is all it reads, which also means a menu opened at a bare
     pointer position works exactly like one opened on a chip. */
  const triggerRef = useMemo(() => ({
    current: anchor ? { getBoundingClientRect: () => anchor } : null,
  }), [anchor])

  const pos = useAnchoredPosition(!!anchor, triggerRef, popupRef, { minWidth: MENU_WIDTH })

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    function onDown(e) { if (!popupRef.current?.contains(e.target)) onClose?.() }
    document.addEventListener('keydown', onKey)
    /* `mousedown` rather than `click`: the click that opened this menu is still
       propagating, and a `click` listener would catch it and close immediately. */
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  if (!anchor) return null

  function run(fn) {
    return () => { fn?.(); onClose?.() }
  }

  return (
    <div
      ref={popupRef}
      role="menu"
      aria-label={`Actions for ${title || 'task'}`}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9999,
        top: pos.top, left: pos.left, width: pos.width,
        maxHeight: pos.maxHeight, overflowY: pos.maxHeight ? 'auto' : undefined,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 5, boxShadow: 'var(--shadow-modal)',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
    >
      {title && (
        <div style={{
          padding: '6px 12px 5px', fontSize: '0.72rem', fontWeight: 700,
          color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
      )}
      {onToggle && (
        <Row icon={done ? Circle : CircleCheck}
             label={done ? 'Mark not done' : 'Mark done'}
             onClick={run(onToggle)} />
      )}
      {onEdit   && <Row icon={Pencil} label="Edit task"   onClick={run(onEdit)} />}
      {onDelete && <Row icon={Trash2} label="Delete task" danger onClick={run(onDelete)} />}
    </div>
  )
}
