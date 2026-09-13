'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import useAnchoredPosition from '@/lib/useAnchoredPosition'

function pad(n) { return String(n).padStart(2, '0') }

const CX = 110, CY = 110, R = 78

/** Radius of the tappable disc behind each number on the ring. */
const LABEL_R = 17

/** Inside this radius the angle under the pointer is meaningless. A press near
 *  the centre of the face used to snap the hand to whatever `atan2` happened to
 *  return, so a stray click in the middle silently changed the time. */
const DEAD_ZONE = 26

/** How close to a 5-minute label the pointer must be for the minute to snap to
 *  it. Tight enough that the gaps between labels stay usable for odd minutes,
 *  loose enough that aiming at a label always lands on it. */
const SNAP_R = 13

function polarPos(idx, total, radius) {
  const angle = (idx / total) * 2 * Math.PI - Math.PI / 2
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) }
}

/**
 * Value under a point on the face, or null if the point is in the dead zone.
 *
 * Hours snap to the twelve labels. Minutes deliberately do not: they resolve to
 * the exact minute under the pointer and only snap when the pointer is actually
 * over one of the 5-minute labels. Locking the whole ring to multiples of five —
 * as this did before — made 7:20 easy and 7:22 impossible without typing.
 */
function coordsToValue(x, y, mode) {
  const dx = x - CX, dy = y - CY
  if (Math.hypot(dx, dy) < DEAD_ZONE) return null

  let angle = Math.atan2(dy, dx) + Math.PI / 2
  if (angle < 0) angle += 2 * Math.PI
  const frac = angle / (2 * Math.PI)

  if (mode === 'hour') return HOURS[Math.round(frac * 12) % 12]

  const exact    = Math.round(frac * 60) % 60
  const nearest5 = (Math.round(exact / 5) * 5) % 60
  const label    = polarPos(nearest5 / 5, 12, R)
  return Math.hypot(x - label.x, y - label.y) <= SNAP_R ? nearest5 : exact
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINS  = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

/**
 * Parse whatever the user typed into { h24, min }, or null.
 *
 * People type times fast and sloppily — "330p", "1530", "3.30 pm", "noon" — and
 * the old parser accepted only three tidy shapes, so most of those quietly
 * reverted to the previous value on blur with no explanation.
 */
export function parseTimeString(raw) {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s === 'noon' || s === 'midday')   return { h24: 12, min: 0 }
  if (s === 'midnight')                 return { h24: 0,  min: 0 }

  // Peel any am/pm marker off the end first so the digits parse on their own.
  // Accepts "pm", "p.m.", "p" and the spacing variants of each.
  let period = null
  const suffix = s.match(/([ap])\.?\s*m?\.?$/)
  if (suffix) {
    period = suffix[1]
    s = s.slice(0, suffix.index).trim()
  }

  let h, min
  // Hour and minute with any of : . h or a space between them (seconds ignored).
  let m = s.match(/^(\d{1,2})\s*[:.h ]\s*(\d{1,2})(?::\d{1,2})?$/)
  if (m) {
    h = Number(m[1]); min = Number(m[2])
  } else if ((m = s.match(/^(\d{1,4})$/))) {
    // Bare digits: 1-2 of them are an hour, 3-4 are hhmm.
    const d = m[1]
    if (d.length <= 2) { h = Number(d); min = 0 }
    else               { h = Number(d.slice(0, d.length - 2)); min = Number(d.slice(-2)) }
  } else {
    return null
  }

  if (min > 59) return null
  if (period) {
    if (h < 1 || h > 12) return null
    if (period === 'p' && h !== 12) h += 12
    if (period === 'a' && h === 12) h = 0
  } else if (h > 23) {
    return null
  }
  return { h24: h, min }
}

export default function TimePicker({ value, onChange }) {
  /* hour / minute / period are DERIVED from `value`, not mirrored into state.

     They used to be three useStates kept in sync by an effect on [value]. That
     mirror was redundant: every local edit already calls emit24 -> onChange, the
     parent updates `value`, and the effect copied it straight back. The state
     was never the source of truth, only a lagging cache of the prop — and one
     that briefly disagreed with it on every change, for a render.

     Deriving instead means there is one source of truth and no effect. */
  const [h24, rawMin] = (value || '09:00').split(':').map(Number)
  const safeH24 = Number.isFinite(h24) ? h24 : 9
  const period  = safeH24 >= 12 ? 'PM' : 'AM'
  const hour    = safeH24 === 0 ? 12 : safeH24 > 12 ? safeH24 - 12 : safeH24
  const minute  = Number.isFinite(rawMin) ? rawMin : 0

  const [open,       setOpen]       = useState(false)
  const [mode,       setMode]       = useState('hour')
  const [hoveredIdx, setHoveredIdx] = useState(-1)
  const [isDragging, setIsDragging] = useState(false)

  // Inline free-text edit in the trigger
  const [inlineEdit, setInlineEdit] = useState(false)
  const [inlineVal,  setInlineVal]  = useState('')
  const [focused,    setFocused]    = useState(false)

  /* Clock-face digit entry. One field at a time, with the digits typed so far in
     `buffer` — replacing the old four pieces of state (editH/editM/typedH/typedM),
     which pre-filled the field with the current value so the first keystroke
     appended to it instead of replacing it. */
  const [typing, setTyping] = useState(null)   // null | 'hour' | 'minute'
  const [buffer, setBuffer] = useState('')

  const wrapRef   = useRef(null)
  const popupRef  = useRef(null)
  const svgRef    = useRef(null)
  const timerRef  = useRef(null)
  const inputRef  = useRef(null)
  const revertRef = useRef(null)   // value to restore if digit entry is escaped

  // The clock is portaled to <body> (see below), so it is no longer a DOM
  // descendant of the trigger — an outside-click test against wrapRef alone would
  // treat every tap on the clock face as "outside" and close it mid-drag.
  useEffect(() => {
    if (!open && !inlineEdit) return
    function onDown(e) {
      const inTrigger = wrapRef.current?.contains(e.target)
      const inPopup   = popupRef.current?.contains(e.target)
      if (!inTrigger && !inPopup) {
        setOpen(false)
        commitInline()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, inlineEdit, inlineVal])

  // Centred under the trigger, flipped above it when there is no room below, and
  // clamped inside the viewport either way. See lib/useAnchoredPosition.
  const popupPos = useAnchoredPosition(open, wrapRef, popupRef, {
    minWidth: 252,
    align: 'center',
  })

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function emit24(h, m, p) {
    let out = h % 12
    if (p === 'PM') out += 12
    onChange(`${pad(out)}:${pad(m)}`)
  }

  /** Shift the whole time by whole minutes, wrapping across midnight. */
  function nudge(deltaMin) {
    const total = ((safeH24 * 60 + minute + deltaMin) % 1440 + 1440) % 1440
    onChange(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`)
  }

  function displayText() { return `${hour}:${pad(minute)} ${period}` }

  // ── Free-text entry in the trigger ──────────────────────────────────────────

  const inlineTrimmed = inlineVal.trim()
  const inlineParsed  = inlineEdit && inlineTrimmed ? parseTimeString(inlineTrimmed) : null
  const inlineInvalid = Boolean(inlineEdit && inlineTrimmed && !inlineParsed)

  function startInline() {
    setOpen(false)          // one editor at a time
    setInlineEdit(true)
    setInlineVal(displayText())
    // Select it all, so the first keystroke replaces rather than appends. The
    // field used to open with the caret in the middle of "3:30 PM".
    requestAnimationFrame(() => inputRef.current?.select())
  }

  /** Commit the typed text. Returns false when it could not be understood. */
  function commitInline(raw) {
    const str = (raw ?? inlineVal).trim()
    if (str) {
      const parsed = parseTimeString(str)
      if (!parsed) { setInlineEdit(false); setInlineVal(''); return false }
      onChange(`${pad(parsed.h24)}:${pad(parsed.min)}`)
    }
    setInlineEdit(false)
    setInlineVal('')
    return true
  }

  // ── Digit entry on the clock face ───────────────────────────────────────────

  function beginTyping(field, first = '') {
    revertRef.current = value || '09:00'
    setMode(field)
    setTyping(field)
    setBuffer('')
    if (first) pushDigits(first, field)
  }

  function cancelTyping(revert = false) {
    if (revert && revertRef.current != null) onChange(revertRef.current)
    setTyping(null)
    setBuffer('')
  }

  /**
   * Feed digits into the active field, emitting as we go so the hand tracks what
   * is being typed, and advancing to the next field as soon as the current one
   * cannot take another digit — "9" is a complete hour, "1" is not.
   */
  function pushDigits(next, field) {
    const digits = String(next).replace(/\D/g, '').slice(0, 2)
    if (!digits) { setBuffer(''); return }
    const n = Number(digits)

    if (field === 'hour') {
      if (digits.length === 2) {
        // 13-23 is someone typing 24-hour time into a 12-hour field; honour it
        // rather than rejecting the keystroke.
        if (n >= 13 && n <= 23) emit24(n - 12, minute, 'PM')
        else if (n === 0)       emit24(12, minute, 'AM')
        else if (n <= 12)       emit24(n, minute, period)
        else return                              // 24-99: not a time, ignore
        setBuffer(digits)
        advanceTo('minute')
        return
      }
      setBuffer(digits)
      if (n >= 1) emit24(n, minute, period)
      if (n >= 2) advanceTo('minute')            // 2-9 cannot gain a second digit
      return
    }

    if (n > 59) return                           // only reachable by pasting
    setBuffer(digits)
    emit24(hour, n, period)
    // Two digits is always complete; so is a leading 6-9, since there is no
    // minute past 59.
    if (digits.length === 2 || n >= 6) { setTyping(null); setBuffer('') }
  }

  /* Synchronous, not on a timer. A delay here reads better but loses digits:
     typing "930" quickly lands the "3" while the hour field is still mounted,
     where it reads as the hour "93" and is thrown away. */
  function advanceTo(field) {
    setMode(field)
    setTyping(field)
    setBuffer('')
  }

  // ── Keyboard on the open popup ──────────────────────────────────────────────
  // Held in a ref so the listener always sees current values without
  // re-subscribing on every keystroke.
  const keyHandlerRef = useRef(null)
  keyHandlerRef.current = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (typing) cancelTyping(true)
      else setOpen(false)
      return
    }
    // While a digit field is focused its own handler owns the keyboard.
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return

    if (e.key === 'Enter')      { e.preventDefault(); setOpen(false); return }
    if (/^\d$/.test(e.key))     { e.preventDefault(); beginTyping(mode, e.key); return }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setMode('hour');   return }
    if (e.key === 'ArrowRight') { e.preventDefault(); setMode('minute'); return }
    if (e.key === 'a' || e.key === 'A') { e.preventDefault(); emit24(hour, minute, 'AM'); return }
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); emit24(hour, minute, 'PM'); return }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const dir = e.key === 'ArrowUp' ? 1 : -1
      if (mode === 'hour') {
        onChange(`${pad(((safeH24 + dir) % 24 + 24) % 24)}:${pad(minute)}`)
      } else {
        // Wraps within the hour: people expect the minute field alone to roll.
        const m = ((minute + dir * (e.shiftKey ? 5 : 1)) % 60 + 60) % 60
        onChange(`${pad(safeH24)}:${pad(m)}`)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = e => keyHandlerRef.current?.(e)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // ── Pointer handling on the face ────────────────────────────────────────────
  // Pointer events rather than mouse events: the face set `touchAction: 'none'`
  // but listened only for mousedown/mousemove, so dragging the hand did nothing
  // at all on a touchscreen. Pointer capture also means the drag survives the
  // pointer leaving the SVG, which the old window listeners emulated by hand.

  function svgCoords(clientX, clientY) {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return {
      x: (clientX - rect.left) * (220 / rect.width),
      y: (clientY - rect.top)  * (220 / rect.height),
    }
  }

  function applyPointer(clientX, clientY) {
    const pos = svgCoords(clientX, clientY)
    if (!pos) return
    const val = coordsToValue(pos.x, pos.y, mode)
    if (val == null) return                       // dead zone: leave the time alone
    if (mode === 'hour') emit24(val, minute, period)
    else                 emit24(hour, val, period)
  }

  function onPointerDown(e) {
    if (e.button > 0) return
    e.preventDefault()
    cancelTyping()
    clearTimeout(timerRef.current)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setIsDragging(true)
    applyPointer(e.clientX, e.clientY)
  }

  function onPointerMove(e) {
    if (!isDragging) return
    applyPointer(e.clientX, e.clientY)
  }

  function onPointerUp(e) {
    if (!isDragging) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setIsDragging(false)
    setHoveredIdx(-1)
    // Hour picked — move on to minutes. This lived in two places before (the
    // label's onClick and the window mouseup), which armed two timers per tap.
    if (mode === 'hour') {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setMode('minute'), 180)
    }
  }

  const items       = mode === 'hour' ? HOURS : MINS
  const selectedVal = mode === 'hour' ? hour : minute
  const selectedIdx = items.indexOf(selectedVal)
  // Off-label minutes point at their true angle; only then is the hand tip drawn
  // as a dot, since there is no number under it to highlight.
  const offLabel = mode === 'minute' && selectedIdx < 0
  const handEnd = (() => {
    if (offLabel) {
      const angle = (minute / 60) * 2 * Math.PI - Math.PI / 2
      return { x: CX + (R - 10) * Math.cos(angle), y: CY + (R - 10) * Math.sin(angle) }
    }
    return selectedIdx >= 0 ? polarPos(selectedIdx, 12, R - 10) : null
  })()

  const digitChip = (active) => ({
    padding: '6px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
    background: active ? 'var(--blue)' : 'var(--surface2)',
    color: active ? '#fff' : 'var(--text-3)',
    transition: 'background .15s, color .15s', minWidth: 56, textAlign: 'center',
  })

  const digitInput = {
    padding: '6px 10px', borderRadius: 10, border: '2px solid var(--blue)',
    fontFamily: 'inherit', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1,
    background: 'var(--blue)', color: '#fff', width: 62, textAlign: 'center',
    outline: 'none',
  }

  const borderColor = inlineInvalid ? 'var(--red)' : focused ? 'var(--blue)' : 'var(--border)'

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>

      {/* ── Trigger: inline text input + clock icon button ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--input-bg)', border: `1.5px solid ${borderColor}`,
        borderRadius: 10, overflow: 'hidden',
        boxShadow: inlineInvalid ? '0 0 0 3px rgba(229,72,77,.18)' : focused ? '0 0 0 3px var(--blue-ring)' : 'none',
        transition: 'border-color .15s, box-shadow .15s',
      }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }}
      >
        {inlineEdit ? (
          <>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={inlineVal}
              placeholder={displayText()}
              aria-invalid={inlineInvalid || undefined}
              onChange={e => setInlineVal(e.target.value)}
              onBlur={() => commitInline()}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Don't throw away text we couldn't read — keep the caret in
                  // the field so it can be corrected.
                  if (commitInline()) return
                }
                if (e.key === 'Escape') { e.preventDefault(); setInlineEdit(false); setInlineVal('') }
              }}
              style={{
                flex: 1, minWidth: 0, padding: '9px 14px', background: 'transparent', border: 'none',
                color: inlineInvalid ? 'var(--red)' : 'var(--text)',
                fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600,
                outline: 'none',
              }}
            />
            {/* What the text will become, so odd input like "330p" is confirmed
                before it is committed rather than after. */}
            {inlineParsed && (
              <span style={{
                padding: '0 8px', fontSize: '0.72rem', fontWeight: 600,
                color: 'var(--text-3)', whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {(() => {
                  const h = inlineParsed.h24 === 0 ? 12 : inlineParsed.h24 > 12 ? inlineParsed.h24 - 12 : inlineParsed.h24
                  return `${h}:${pad(inlineParsed.min)} ${inlineParsed.h24 >= 12 ? 'PM' : 'AM'}`
                })()}
              </span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={startInline}
            onKeyDown={e => {
              if (open) return
              if (e.key === 'ArrowUp')   { e.preventDefault(); nudge(e.shiftKey ? 60 : 5) }
              if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -60 : -5) }
            }}
            title="Type a time — 3:30 PM, 15:30, 330p. ↑/↓ nudges by 5 minutes."
            style={{
              flex: 1, padding: '9px 14px', background: 'transparent', border: 'none',
              color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600,
              cursor: 'text', textAlign: 'left',
            }}
          >
            {displayText()}
          </button>
        )}

        {/* Clock icon opens the popup */}
        <button
          type="button"
          onClick={() => {
            // Opening used to discard whatever was half-typed in the field.
            if (inlineEdit) commitInline()
            setOpen(v => !v)
            setMode('hour')
            cancelTyping()
          }}
          title="Open clock picker"
          style={{
            padding: '9px 11px', background: 'transparent', border: 'none',
            borderLeft: '1px solid var(--border)',
            color: open ? 'var(--blue)' : 'var(--text-3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            transition: 'color .15s',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.color = 'var(--text-2)' }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
      </div>

      {/* ── Clock popover ──
          Portaled to <body> rather than absolutely positioned inside the trigger:
          as a descendant it was clipped by any scrolling ancestor (the note editor's
          meta bar, modals) and could only ever open downward, off the bottom of the
          screen. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={popupRef} style={{
          position: 'fixed',
          top:   popupPos.top,
          left:  popupPos.left,
          maxHeight: popupPos.maxHeight,
          overflowY: popupPos.maxHeight ? 'auto' : undefined,
          zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, boxShadow: 'var(--shadow-modal)', padding: '16px 16px 14px',
          width: 252, userSelect: 'none',
        }}>

          {/* Digital time + AM/PM */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 14 }}>
            {typing === 'hour' ? (
              <input autoFocus type="text" inputMode="numeric" maxLength={2}
                     aria-label="Hour"
                     value={buffer}
                     placeholder={pad(hour)}
                     onChange={e => pushDigits(e.target.value, 'hour')}
                     onBlur={() => cancelTyping()}
                     onKeyDown={e => {
                       if (e.key === 'Enter')  { e.preventDefault(); cancelTyping(); setMode('minute') }
                       if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelTyping(true) }
                       if (e.key === 'Tab')    { cancelTyping(); setMode('minute') }
                     }}
                     style={digitInput} />
            ) : (
              <button type="button"
                      aria-label="Hour"
                      onClick={() => beginTyping('hour')}
                      style={digitChip(mode === 'hour')}>
                {pad(hour)}
              </button>
            )}

            <span style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-3)', lineHeight: 1 }}>:</span>

            {typing === 'minute' ? (
              <input autoFocus type="text" inputMode="numeric" maxLength={2}
                     aria-label="Minute"
                     value={buffer}
                     placeholder={pad(minute)}
                     onChange={e => pushDigits(e.target.value, 'minute')}
                     onBlur={() => cancelTyping()}
                     onKeyDown={e => {
                       if (e.key === 'Enter')  { e.preventDefault(); cancelTyping(); setOpen(false) }
                       if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelTyping(true) }
                     }}
                     style={digitInput} />
            ) : (
              <button type="button"
                      aria-label="Minute"
                      onClick={() => beginTyping('minute')}
                      style={digitChip(mode === 'minute')}>
                {pad(minute)}
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 8 }}>
              {['AM', 'PM'].map(p => (
                <button key={p} type="button" onClick={() => emit24(hour, minute, p)}
                        style={{ padding: '5px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, background: period === p ? 'var(--blue)' : 'var(--surface2)', color: period === p ? '#fff' : 'var(--text-3)', transition: 'all .15s' }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Clock face SVG */}
          <svg ref={svgRef} width="220" height="220" viewBox="0 0 220 220"
               style={{ display: 'block', margin: '0 auto', cursor: isDragging ? 'grabbing' : 'pointer', touchAction: 'none' }}
               onPointerDown={onPointerDown}
               onPointerMove={onPointerMove}
               onPointerUp={onPointerUp}
               onPointerCancel={onPointerUp}>
            <circle cx={CX} cy={CY} r={R + 10} fill="var(--surface2)" />
            {handEnd && (
              <>
                <line x1={CX} y1={CY} x2={handEnd.x} y2={handEnd.y} stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" />
                <circle cx={CX} cy={CY} r="4" fill="var(--blue)" />
                <circle cx={handEnd.x} cy={handEnd.y} r={offLabel ? 6 : 17} fill="var(--blue)" opacity={offLabel ? 1 : 0.18} />
              </>
            )}
            {items.map((val, i) => {
              const pos   = polarPos(i, 12, R)
              const isSel = val === selectedVal
              const isHov = hoveredIdx === i && !isSel
              return (
                <g key={val} style={{ cursor: 'pointer' }}
                   onPointerEnter={() => { if (!isDragging) setHoveredIdx(i) }}
                   onPointerLeave={() => { if (!isDragging) setHoveredIdx(-1) }}>
                  <circle cx={pos.x} cy={pos.y} r={LABEL_R} fill={isSel ? 'var(--blue)' : isHov ? 'var(--border)' : 'transparent'} />
                  <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                        fill={isSel ? '#fff' : 'var(--text-2)'} fontSize="12.5"
                        fontWeight={isSel ? '700' : '500'} fontFamily="inherit"
                        style={{ pointerEvents: 'none' }}>
                    {mode === 'minute' ? pad(val) : val}
                  </text>
                </g>
              )
            })}
          </svg>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
            <span style={{ fontSize: '0.67rem', color: 'var(--text-3)', fontWeight: 500, lineHeight: 1.3 }}>
              {mode === 'minute'
                ? 'Drag between numbers for odd minutes · type · ↑↓'
                : 'Drag or tap · type digits · ↑↓ to nudge'}
            </span>
            <button type="button" onClick={() => setOpen(false)}
                    style={{ padding: '6px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, flex: '0 0 auto' }}>OK</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
