'use client'

/**
 * CustomListPanel
 *
 * Renders the "list switcher" tabs at the top of the To-Do area
 * (My Tasks | 🛒 Groceries | + …) and the body of a selected custom list.
 *
 * The component is designed to slot in *above* TodoPanel when activeList === 'my-tasks',
 * and to *replace* the TodoPanel body when a custom list is active.
 *
 * Props
 * ─────
 *  lists            CustomList[]      — all custom lists
 *  activeListId     string | 'my-tasks'
 *  onSelectList     (id) => void
 *  onCreateList     () => void        — parent opens a creation modal
 *  onUpdateList     (list) => void    — save changes to a list
 *  onDeleteList     (id)  => void
 *  fullPage         bool
 *  isMobile         bool
 *
 * Children (only rendered when activeListId === 'my-tasks'):
 *  Anything passed as children is rendered below the switcher tabs
 *  (i.e. the existing TodoPanel).
 */

import { useState, useRef, useCallback } from 'react'
import { Plus, GripVertical, MoreHorizontal, Trash2, X, ChevronDown, CheckSquare } from 'lucide-react'
import { makeItem } from '@/lib/customLists'

const EMOJI_OPTIONS = ['📝', '🛒', '📦', '✅', '🎒', '🎁', '🛠️', '💡', '🧹', '🌿']

// ── New-list creation modal ────────────────────────────────────────────
export function NewListModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📝')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, emoji)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'lv-backdrop-in .18s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(400px,100%)', background: 'var(--surface)', borderRadius: 18,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)',
          padding: '24px 24px 20px',
          animation: 'modal-in .22s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>New custom list</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Emoji picker */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Icon</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e} type="button"
                  onClick={() => setEmoji(e)}
                  style={{
                    width: 38, height: 38, borderRadius: 10, border: `2px solid ${emoji === e ? 'var(--blue)' : 'var(--border)'}`,
                    background: emoji === e ? 'var(--blue-bg)' : 'var(--surface2)',
                    fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .12s',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name input */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>List name</div>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Groceries, Packing, Ideas…"
              maxLength={48}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontSize: '0.9rem', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
                    style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()}
                    style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: name.trim() ? 'var(--blue)' : 'var(--surface2)', color: name.trim() ? '#fff' : 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default', transition: 'background .13s' }}>
              Create list
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── List-item row (with drag + optional swipe on mobile) ───────────────
function ListItem({ item, isMobile, onToggle, onDelete, onUpdateText, onUpdateNote, onUpdateDue,
                    onDragStart, onDragOver, onDrop, isDragging }) {
  const [hovered,     setHovered]     = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [editingText, setEditingText] = useState(false)
  const [textVal,     setTextVal]     = useState(item.text)
  const [showNote,    setShowNote]    = useState(false)
  const [noteVal,     setNoteVal]     = useState(item.note || '')
  const [dueVal,      setDueVal]      = useState(item.dueDate || '')

  // Touch swipe
  const swipeRef    = useRef({ startX: 0, startY: 0, dx: 0, locked: null, active: false })
  const [swipeDx,   setSwipeDx]   = useState(0)
  const [swipeDone, setSwipeDone] = useState(false)
  const SWIPE_THRESHOLD = 72
  const SWIPE_MAX       = 100

  function onTouchStart(e) {
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, locked: null, active: true }
  }

  function onTouchMove(e) {
    const s = swipeRef.current
    if (!s.active) return
    const t = e.touches[0]
    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    if (s.locked === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.locked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    }
    if (s.locked === 'y') return
    e.preventDefault()
    s.dx = dx
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx))
    setSwipeDx(clamped)
  }

  function onTouchEnd() {
    const s = swipeRef.current
    s.active = false
    const dx = s.dx
    if (s.locked !== 'x') { setSwipeDx(0); return }
    if (dx >= SWIPE_THRESHOLD && !item.checked) {
      setSwipeDone(true)
      setTimeout(() => { setSwipeDx(0); setSwipeDone(false); onToggle(item.id) }, 260)
    } else if (dx <= -SWIPE_THRESHOLD) {
      setSwipeDone(true)
      setTimeout(() => { setSwipeDx(0); setSwipeDone(false); onDelete(item.id) }, 260)
    } else {
      setSwipeDx(0)
    }
  }

  function commitText() {
    const trimmed = textVal.trim()
    if (trimmed && trimmed !== item.text) onUpdateText(item.id, trimmed)
    else setTextVal(item.text)
    setEditingText(false)
  }

  function commitNote() {
    onUpdateNote(item.id, noteVal.trim() || null)
  }

  function commitDue() {
    onUpdateDue(item.id, dueVal || null)
    setMenuOpen(false)
  }

  const swipeLeft  = swipeDx < -8
  const swipeRight = swipeDx > 8

  return (
    <li
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
      draggable={!isMobile}
      onDragStart={() => onDragStart?.(item.id)}
      onDragOver={e => { e.preventDefault(); onDragOver?.(item.id) }}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onTouchStart={isMobile ? onTouchStart : undefined}
      onTouchMove={isMobile ? onTouchMove : undefined}
      onTouchEnd={isMobile ? onTouchEnd : undefined}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 10,
        opacity: isDragging ? 0.4 : 1,
        transition: swipeDone ? 'opacity 0.22s, transform 0.22s' : undefined,
      }}
    >
      {/* Swipe backgrounds (mobile) */}
      {isMobile && (
        <>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#10b981', display: 'flex', alignItems: 'center', paddingLeft: 14, opacity: swipeRight ? Math.min(1, swipeDx / SWIPE_THRESHOLD) : 0, transition: 'opacity .1s', pointerEvents: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, opacity: swipeLeft ? Math.min(1, -swipeDx / SWIPE_THRESHOLD) : 0, transition: 'opacity .1s', pointerEvents: 'none' }}>
            <Trash2 size={16} color="white" />
          </div>
        </>
      )}

      {/* Main row */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 6px',
        borderRadius: 10,
        background: hovered ? 'var(--surface2)' : 'transparent',
        transition: swipeDone
          ? 'transform 0.22s'
          : 'background .15s',
        transform: isMobile
          ? (swipeDone ? `translateX(${swipeDx >= 0 ? '100%' : '-100%'})` : `translateX(${swipeDx}px)`)
          : undefined,
      }}>
        {/* Drag handle (desktop) */}
        {!isMobile && (
          <div
            onPointerDown={e => { e.stopPropagation(); onDragStart?.(item.id) }}
            style={{ marginTop: 3, color: 'var(--text-3)', cursor: 'grab', flexShrink: 0, opacity: hovered ? 0.5 : 0, transition: 'opacity .13s', touchAction: 'none' }}
            title="Drag to reorder"
          >
            <GripVertical size={12} />
          </div>
        )}

        {/* Checkbox */}
        <button
          onClick={e => { e.stopPropagation(); onToggle(item.id) }}
          style={{
            marginTop: 3, flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
            border: `2px solid ${item.checked ? 'var(--blue)' : 'var(--border)'}`,
            background: item.checked ? 'var(--blue)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .18s',
          }}
        >
          {item.checked && (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Text + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingText ? (
            <input
              autoFocus
              value={textVal}
              onChange={e => setTextVal(e.target.value)}
              onBlur={commitText}
              onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') { setTextVal(item.text); setEditingText(false) } }}
              style={{
                width: '100%', background: 'transparent', border: 'none', borderBottom: '1.5px solid var(--blue)',
                color: 'var(--text)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', padding: '1px 0',
              }}
            />
          ) : (
            <span
              onDoubleClick={() => !item.checked && setEditingText(true)}
              style={{
                fontSize: '0.875rem', fontWeight: 500, color: item.checked ? 'var(--text-3)' : 'var(--text)',
                textDecoration: item.checked ? 'line-through' : 'none',
                lineHeight: 1.35, display: 'block',
                cursor: item.checked ? 'default' : 'text',
              }}
            >
              {item.text}
            </span>
          )}

          {/* Meta row: due date + note */}
          {(item.dueDate || item.note) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              {item.dueDate && (
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-3)' }}>
                  📅 {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {item.note && !showNote && (
                <button
                  onClick={() => setShowNote(true)}
                  style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  💬 note
                </button>
              )}
            </div>
          )}

          {/* Inline note editor */}
          {showNote && (
            <div style={{ marginTop: 5 }}>
              <textarea
                autoFocus
                value={noteVal}
                onChange={e => setNoteVal(e.target.value)}
                onBlur={() => { commitNote(); setShowNote(false) }}
                placeholder="Add a note…"
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 8,
                  border: '1.5px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* ⋯ menu */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            style={{
              padding: 4, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--text-3)', opacity: hovered || menuOpen ? 1 : 0, transition: 'opacity .13s', display: 'flex',
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: 'var(--shadow-modal)', zIndex: 100, minWidth: 170, overflow: 'hidden',
              }}
            >
              {/* Due date picker */}
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Due date</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="date"
                    value={dueVal}
                    onChange={e => setDueVal(e.target.value)}
                    style={{
                      flex: 1, padding: '4px 6px', borderRadius: 7, border: '1.5px solid var(--border)',
                      background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button onClick={commitDue}
                          style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                    Set
                  </button>
                </div>
                {dueVal && (
                  <button onClick={() => { setDueVal(''); onUpdateDue(item.id, null); setMenuOpen(false) }}
                          style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Clear date
                  </button>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Note toggle */}
              <button
                onClick={() => { setShowNote(true); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--text-2)', textAlign: 'left', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                💬 {item.note ? 'Edit note' : 'Add note'}
              </button>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Delete */}
              <button
                onClick={() => { onDelete(item.id); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: '#ef4444', textAlign: 'left', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.07)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Trash2 size={12} /> Delete item
              </button>
            </div>
          )}
        </div>

        {/* Desktop delete on hover */}
        {!isMobile && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id) }}
            style={{ marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: hovered ? 0.6 : 0, transition: 'opacity .13s, color .13s', padding: 2, borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            title="Delete"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </li>
  )
}

// ── Main panel for a single custom list ─────────────────────────────────
function CustomListBody({ list, isMobile, onUpdateList, onDeleteList, fullPage }) {
  const [newText,   setNewText]   = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Drag state
  const dragIdRef     = useRef(null)
  const dragOverIdRef = useRef(null)
  const [localOrder, setLocalOrder] = useState(null)

  const items = localOrder || (list.items ?? []).slice().sort((a, b) => {
    if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
    if (a.sortOrder != null) return -1
    if (b.sortOrder != null) return 1
    return 0
  })

  function addItem() {
    const text = newText.trim()
    if (!text) return
    const item = makeItem(text)
    item.sortOrder = items.length
    onUpdateList({ ...list, items: [...(list.items ?? []), item] })
    setNewText('')
  }

  function toggleItem(id) {
    onUpdateList({
      ...list,
      items: (list.items ?? []).map(i => i.id === id ? { ...i, checked: !i.checked } : i),
    })
  }

  function deleteItem(id) {
    onUpdateList({ ...list, items: (list.items ?? []).filter(i => i.id !== id) })
  }

  function updateText(id, text) {
    onUpdateList({ ...list, items: (list.items ?? []).map(i => i.id === id ? { ...i, text } : i) })
  }

  function updateNote(id, note) {
    onUpdateList({ ...list, items: (list.items ?? []).map(i => i.id === id ? { ...i, note } : i) })
  }

  function updateDue(id, dueDate) {
    onUpdateList({ ...list, items: (list.items ?? []).map(i => i.id === id ? { ...i, dueDate } : i) })
  }

  function clearChecked() {
    onUpdateList({ ...list, items: (list.items ?? []).filter(i => !i.checked) })
  }

  // Drag handlers
  function handleDragStart(id) { dragIdRef.current = id }

  function handleDragOver(id) {
    if (!dragIdRef.current || id === dragIdRef.current) return
    if (dragOverIdRef.current === id) return
    dragOverIdRef.current = id
    const fromIdx = items.findIndex(i => i.id === dragIdRef.current)
    const toIdx   = items.findIndex(i => i.id === id)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...items]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setLocalOrder(next)
  }

  function handleDrop() {
    if (!dragIdRef.current || !localOrder) { resetDrag(); return }
    const withOrder = localOrder.map((i, idx) => ({ ...i, sortOrder: idx }))
    onUpdateList({ ...list, items: withOrder })
    setLocalOrder(null)
    resetDrag()
  }

  function resetDrag() {
    dragIdRef.current     = null
    dragOverIdRef.current = null
  }

  const checkedCount = (list.items ?? []).filter(i => i.checked).length
  const totalCount   = (list.items ?? []).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* List header */}
      <div style={{ padding: fullPage ? '16px 28px 12px' : '10px 16px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{list.emoji}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>{list.name}</span>
          {totalCount > 0 && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--surface2)', color: 'var(--text-3)' }}>
              {checkedCount}/{totalCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {checkedCount > 0 && (
            <button
              onClick={clearChecked}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'color .13s, border-color .13s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text-2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              title="Remove all checked items"
            >
              Clear checked
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            title="Delete this list"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* New item input */}
      <div style={{ padding: fullPage ? '10px 28px 6px' : '8px 16px 4px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <form onSubmit={e => { e.preventDefault(); addItem() }} style={{ display: 'flex', gap: 7 }}>
          <input
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Add an item…"
            style={{
              flex: 1, padding: '7px 12px', borderRadius: 9,
              border: '1.5px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
              transition: 'border-color .13s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--blue)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            style={{
              padding: '7px 12px', borderRadius: 9, border: 'none',
              background: newText.trim() ? 'var(--blue)' : 'var(--surface2)',
              color: newText.trim() ? '#fff' : 'var(--text-3)',
              cursor: newText.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', transition: 'background .13s',
            }}
          >
            <Plus size={15} />
          </button>
        </form>
      </div>

      {/* Items list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: fullPage ? '8px 24px 40px' : '6px 12px 20px' }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontWeight: 500 }}>No items yet — add one above</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map(item => (
              <ListItem
                key={item.id}
                item={item}
                isMobile={isMobile}
                onToggle={toggleItem}
                onDelete={deleteItem}
                onUpdateText={updateText}
                onUpdateNote={updateNote}
                onUpdateDue={updateDue}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={dragIdRef.current === item.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div onClick={e => e.stopPropagation()}
               style={{ width: 'min(320px,100%)', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)', padding: '24px 20px 18px' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Delete "{list.name}"?</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 20px' }}>All {totalCount} item{totalCount !== 1 ? 's' : ''} will be removed. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)}
                      style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { onDeleteList(list.id); setShowDeleteConfirm(false) }}
                      style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                Delete list
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── List switcher tabs + routing ──────────────────────────────────────────
export default function CustomListPanel({
  lists,
  activeListId,
  onSelectList,
  onCreateList,
  onUpdateList,
  onDeleteList,
  fullPage,
  isMobile,
  children, // TodoPanel content when activeListId === 'my-tasks'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
      {/* ── Switcher tabs ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: fullPage ? '10px 24px 0' : '8px 12px 0',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {/* My Tasks tab */}
        <button
          onClick={() => onSelectList('my-tasks')}
          style={{
            padding: '6px 12px', borderRadius: '8px 8px 0 0',
            border: 'none', borderBottom: activeListId === 'my-tasks' ? '2px solid var(--blue)' : '2px solid transparent',
            background: 'transparent',
            color: activeListId === 'my-tasks' ? 'var(--blue-text)' : 'var(--text-3)',
            fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .13s',
          }}
        >
          My Tasks
        </button>

        {/* Custom list tabs */}
        {lists.map(list => (
          <button
            key={list.id}
            onClick={() => onSelectList(list.id)}
            style={{
              padding: '6px 12px', borderRadius: '8px 8px 0 0',
              border: 'none', borderBottom: activeListId === list.id ? '2px solid var(--blue)' : '2px solid transparent',
              background: 'transparent',
              color: activeListId === list.id ? 'var(--blue-text)' : 'var(--text-3)',
              fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .13s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span>{list.emoji}</span>
            <span>{list.name}</span>
          </button>
        ))}

        {/* + New list button */}
        <button
          onClick={onCreateList}
          title="New custom list"
          style={{
            padding: '6px 10px', borderRadius: '8px 8px 0 0',
            border: 'none', borderBottom: '2px solid transparent',
            background: 'transparent', color: 'var(--text-3)',
            fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, transition: 'color .13s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeListId === 'my-tasks' ? (
          children
        ) : (
          (() => {
            const list = lists.find(l => l.id === activeListId)
            if (!list) return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>List not found.</p>
              </div>
            )
            return (
              <CustomListBody
                list={list}
                isMobile={isMobile}
                fullPage={fullPage}
                onUpdateList={onUpdateList}
                onDeleteList={onDeleteList}
              />
            )
          })()
        )}
      </div>
    </div>
  )
}
