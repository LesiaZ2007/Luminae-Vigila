'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Zap, CalendarDays, ListTodo, X } from 'lucide-react'
import { quickParse, formatPreview } from '@/lib/quickParse'

/**
 * QuickAdd — single-input natural-language omnibar.
 *
 * Props:
 *   onSaveEvent(eventPayload)  — called to create a new calendar event
 *   onAddTodo(todoPayload)     — called to create a new task
 *   todoCategories             — array of { id, label, color }
 *   eventCategories            — array of { id, label, color }
 *   focusRef                   — optional ref from parent (for Q shortcut)
 *   isMobile                   — boolean
 */
export default function QuickAdd({
  onSaveEvent,
  onAddTodo,
  todoCategories = [],
  eventCategories = [],
  focusRef,
  isMobile = false,
}) {
  const [value,   setValue]   = useState('')
  const [focused, setFocused] = useState(false)
  const [parsed,  setParsed]  = useState(null)
  const [typeOverride, setTypeOverride] = useState(null) // 'event' | 'task' | null
  const inputRef = useRef(null)

  // Expose the input ref to the parent so the Q shortcut can focus it
  useEffect(() => {
    if (focusRef) focusRef.current = inputRef.current
  }, [focusRef])

  // Re-parse on every keystroke
  useEffect(() => {
    if (!value.trim()) { setParsed(null); setTypeOverride(null); return }
    const result = quickParse(value)
    setParsed(result)
    // Reset override when input changes substantially (new parse)
    setTypeOverride(null)
  }, [value])

  // Effective type (override takes priority over parser's heuristic)
  const effectiveType = typeOverride ?? parsed?.type ?? 'task'

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setValue('')
      setParsed(null)
      setTypeOverride(null)
      inputRef.current?.blur()
      e.stopPropagation() // don't bubble to global Esc handler
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  const commit = useCallback(() => {
    if (!value.trim()) return

    // Use the parsed result (with effective type), or fall back gracefully
    const base = parsed || { title: value.trim(), type: 'task', start: null, end: null, dueDate: null, recurrence: null }
    const type = effectiveType

    if (type === 'event') {
      const defaultCategory = eventCategories[0]?.id || 'personal'
      const startISO = base.start || (() => {
        const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:00:00`
      })()
      const endISO = base.end || (() => {
        const s = new Date(startISO); s.setHours(s.getHours() + 1)
        return `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}T${String(s.getHours()).padStart(2,'0')}:00:00`
      })()

      onSaveEvent({
        id:    String(Date.now()),
        title: base.title || value.trim(),
        start: startISO,
        end:   endISO,
        allDay: false,
        color: eventCategories[0]?.color || '#3a6fa8',
        extendedProps: { category: defaultCategory, notes: null },
        reminder: null,
        recurrence: base.recurrence || null,
      })
    } else {
      // Task
      const defaultCategory = todoCategories[0]?.id || 'academic'
      onAddTodo({
        title:         base.title || value.trim(),
        category:      defaultCategory,
        dueDate:       base.dueDate || null,
        priority:      'medium',
        notes:         null,
        reminder:      null,
        linkedEventId: null,
        linkedClassId: null,
        recurrence:    base.recurrence || null,
        subtasks:      [],
      })
    }

    // Reset
    setValue('')
    setParsed(null)
    setTypeOverride(null)
    inputRef.current?.blur()
  }, [value, parsed, effectiveType, onSaveEvent, onAddTodo, eventCategories, todoCategories])

  // Build preview text
  const previewText = parsed && value.trim()
    ? formatPreview({ ...parsed, type: effectiveType })
    : null

  const showPreview = focused && previewText

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        flex: isMobile ? 1 : undefined,
        minWidth: 0,
      }}
    >
      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 36,
          paddingLeft: 10,
          paddingRight: 6,
          borderRadius: focused ? '10px 10px 0 0' : 10,
          border: `1.5px solid ${focused ? 'var(--blue)' : 'var(--border)'}`,
          background: 'var(--input-bg)',
          boxShadow: focused ? '0 0 0 3px var(--blue-ring)' : 'none',
          transition: 'border-color .15s, box-shadow .15s, border-radius .1s',
          minWidth: isMobile ? 0 : 240,
          maxWidth: isMobile ? '100%' : 380,
        }}
      >
        {/* Lightning icon */}
        <Zap
          size={14}
          style={{
            flexShrink: 0,
            color: focused ? 'var(--blue)' : 'var(--text-3)',
            transition: 'color .15s',
          }}
        />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Small delay so click on preview chip doesn't immediately hide it
            setTimeout(() => setFocused(false), 150)
          }}
          placeholder={isMobile ? 'Quick add…' : 'Quick add: "dentist fri 2-3pm"'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            color: 'var(--text)',
            minWidth: 0,
          }}
        />

        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={() => { setValue(''); setParsed(null); setTypeOverride(null); inputRef.current?.focus() }}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              transition: 'color .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Preview chip — appears below input when focused and something is parsed */}
      {showPreview && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 500,
            background: 'var(--surface)',
            border: '1.5px solid var(--blue)',
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
            padding: '8px 10px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}
        >
          {/* Type icon */}
          <span style={{ flexShrink: 0, color: 'var(--blue)', display: 'flex', alignItems: 'center' }}>
            {effectiveType === 'event'
              ? <CalendarDays size={13} />
              : <ListTodo size={13} />}
          </span>

          {/* Preview text */}
          <span
            style={{
              flex: 1,
              fontSize: '0.76rem',
              color: 'var(--text-2)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {previewText}
          </span>

          {/* Toggle task/event */}
          <button
            type="button"
            onMouseDown={e => {
              // mousedown fires before blur, so we use it to prevent the blur from hiding the chip
              e.preventDefault()
              setTypeOverride(t => {
                const cur = t ?? parsed?.type ?? 'task'
                return cur === 'event' ? 'task' : 'event'
              })
              inputRef.current?.focus()
            }}
            title="Toggle task / event"
            style={{
              flexShrink: 0,
              background: 'var(--blue-bg)',
              border: '1px solid var(--blue-ring)',
              borderRadius: 6,
              padding: '2px 7px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 700,
              fontFamily: 'inherit',
              color: 'var(--blue-text)',
              whiteSpace: 'nowrap',
              transition: 'background .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--blue)' }
            onMouseLeave={e => e.currentTarget.style.background = 'var(--blue-bg)' }
          >
            {effectiveType === 'event' ? 'Make task' : 'Make event'}
          </button>

          {/* Commit button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              commit()
            }}
            style={{
              flexShrink: 0,
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 6,
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 700,
              fontFamily: 'inherit',
              color: '#fff',
              whiteSpace: 'nowrap',
              transition: 'filter .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
            onMouseLeave={e => e.currentTarget.style.filter = 'none'}
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
