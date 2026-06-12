'use client'

/**
 * CustomListPanel
 *
 * Renders the "list switcher" tabs at the top of the To-Do area
 * (My Tasks | <icon> Groceries | + …) and the body of a selected custom list.
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

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Plus, GripVertical, MoreHorizontal, Trash2, X, Pencil, Check,
  ShoppingCart, Package, ListChecks, NotebookPen, Backpack, Gift,
  Wrench, Lightbulb, Plane, Heart, Star, BookOpen, Dumbbell, Utensils,
  Calendar, StickyNote,
} from 'lucide-react'
import Confetti from '@/components/Confetti'
import { makeItem, makeSubtask } from '@/lib/customLists'
import DatePicker from '@/components/DatePicker'

// ── Icon registry ──────────────────────────────────────────────────────────
// Keys are stored in list.icon. Unknown values (legacy emojis) fall back gracefully.
export const LIST_ICONS = {
  ShoppingCart,
  Package,
  ListChecks,
  NotebookPen,
  Backpack,
  Gift,
  Wrench,
  Lightbulb,
  Plane,
  Heart,
  Star,
  BookOpen,
  Dumbbell,
  Utensils,
}

const ICON_KEYS = Object.keys(LIST_ICONS)

/**
 * Render a list icon: if key is a known Lucide key, render the component;
 * otherwise render as text (legacy emoji backward compat).
 */
function ListIconDisplay({ icon, size = 14, color, style }) {
  const Component = LIST_ICONS[icon]
  if (Component) return <Component size={size} color={color} style={style} />
  // Fallback: emoji or unknown string rendered as text
  return <span style={{ fontSize: size * 1.1, lineHeight: 1, ...style }}>{icon || '📝'}</span>
}

// ── Color palette ─────────────────────────────────────────────────────────
// Matches the app's EVENT_CATEGORIES colors + a few more.
const COLOR_PALETTE = [
  '#3a6fa8', // Luminae blue (default)
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
]

// ── List name/icon/color editor (shared by New + Edit) ─────────────────────
function ListEditor({ initial, onSave, onCancel, saveLabel = 'Save' }) {
  const [name,    setName]    = useState(initial?.name    ?? '')
  const [icon,    setIcon]    = useState(initial?.icon    ?? 'ListChecks')
  const [color,   setColor]   = useState(initial?.color   ?? '#3a6fa8')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed, icon, color, dueDate || null)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Icon picker */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Icon</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ICON_KEYS.map(key => {
            const Ic = LIST_ICONS[key]
            const active = icon === key
            return (
              <button
                key={key} type="button"
                onClick={() => setIcon(key)}
                title={key}
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  border: `2px solid ${active ? color : 'var(--border)'}`,
                  background: active ? color + '22' : 'var(--surface2)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .12s',
                }}
              >
                <Ic size={16} color={active ? color : 'var(--text-3)'} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Color picker */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLOR_PALETTE.map(c => (
            <button
              key={c} type="button"
              onClick={() => setColor(c)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: c,
                border: color === c ? `3px solid var(--text)` : '3px solid transparent',
                outline: color === c ? `2px solid ${c}` : 'none',
                cursor: 'pointer', transition: 'all .12s', padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 14 }}>
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

      {/* Due date */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due date (optional)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
          </div>
          {dueDate && (
            <button
              type="button"
              onClick={() => setDueDate('')}
              style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
                style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={!name.trim()}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: name.trim() ? color : 'var(--surface2)', color: name.trim() ? '#fff' : 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default', transition: 'background .13s' }}>
          {saveLabel}
        </button>
      </div>
    </form>
  )
}

// ── New-list creation modal ────────────────────────────────────────────────
export function NewListModal({ onClose, onCreate }) {
  // Escape to close
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
          width: 'min(420px,100%)', background: 'var(--surface)', borderRadius: 18,
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
        <ListEditor
          onSave={(name, icon, color, dueDate) => { onCreate(name, icon, color, dueDate); onClose() }}
          onCancel={onClose}
          saveLabel="Create list"
        />
      </div>
    </div>
  )
}

// ── Edit-list modal ────────────────────────────────────────────────────────
function EditListModal({ list, onClose, onSave }) {
  // Escape to close
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
          width: 'min(420px,100%)', background: 'var(--surface)', borderRadius: 18,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)',
          padding: '24px 24px 20px',
          animation: 'modal-in .22s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>Edit list</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>
        <ListEditor
          initial={list}
          onSave={(name, icon, color, dueDate) => { onSave(name, icon, color, dueDate); onClose() }}
          onCancel={onClose}
          saveLabel="Save changes"
        />
      </div>
    </div>
  )
}

// ── Subtask row ────────────────────────────────────────────────────────────
function SubtaskRow({ subtask, listColor, onToggle, onDelete, onUpdateText }) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState(subtask.text)

  function commit() {
    const trimmed = val.trim()
    if (trimmed && trimmed !== subtask.text) onUpdateText(subtask.id, trimmed)
    else setVal(subtask.text)
    setEditing(false)
  }

  const accent = listColor || '#3a6fa8'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0 3px 8px', marginLeft: 28 }}>
      {/* Subtask checkbox */}
      <button
        onClick={() => onToggle(subtask.id)}
        style={{
          flexShrink: 0, width: 14, height: 14, borderRadius: '50%',
          border: `2px solid ${subtask.checked ? accent : 'var(--border)'}`,
          background: subtask.checked ? accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all .18s',
        }}
      >
        {subtask.checked && (
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(subtask.text); setEditing(false) } }}
          style={{
            flex: 1, background: 'transparent', border: 'none', borderBottom: `1.5px solid ${accent}`,
            color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', padding: '1px 0',
          }}
        />
      ) : (
        <span
          onDoubleClick={() => !subtask.checked && setEditing(true)}
          style={{
            flex: 1, fontSize: '0.78rem', color: subtask.checked ? 'var(--text-3)' : 'var(--text-2)',
            textDecoration: subtask.checked ? 'line-through' : 'none',
            cursor: subtask.checked ? 'default' : 'text',
          }}
        >
          {subtask.text}
        </span>
      )}

      <button
        onClick={() => onDelete(subtask.id)}
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, borderRadius: 4, display: 'flex', opacity: 0.6 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
      >
        <X size={10} />
      </button>
    </div>
  )
}

// ── List-item row (with drag + optional swipe on mobile) ───────────────────
function ListItem({
  item, listColor, isMobile, onToggle, onDelete, onUpdateText, onUpdateNote, onUpdateDue,
  onAddSubtask, onToggleSubtask, onDeleteSubtask, onUpdateSubtaskText,
  onDragStart, onDragOver, onDrop, isDragging,
}) {
  const [hovered,     setHovered]     = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [menuPos,     setMenuPos]     = useState({ top: 0, left: 0 })
  const [editingText, setEditingText] = useState(false)
  const [textVal,     setTextVal]     = useState(item.text)
  const [showNote,    setShowNote]    = useState(false)
  const [noteVal,     setNoteVal]     = useState(item.note || '')
  const [dueVal,      setDueVal]      = useState(item.dueDate || '')
  const menuBtnRef = useRef(null)

  // Touch swipe
  const swipeRef    = useRef({ startX: 0, startY: 0, dx: 0, locked: null, active: false })
  const [swipeDx,   setSwipeDx]   = useState(0)
  const [swipeDone, setSwipeDone] = useState(false)
  const SWIPE_THRESHOLD = 72
  const SWIPE_MAX       = 100

  const accent = listColor || '#3a6fa8'

  // ── Close menu on outside-click / Escape ──
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e) {
      if (menuBtnRef.current?.contains(e.target)) return
      // If click is inside the fixed menu portal, don't close
      const portal = document.getElementById('cl-item-menu-portal')
      if (portal?.contains(e.target)) return
      // If click is inside a DatePicker calendar popup (portaled to body), don't close
      if (e.target.closest?.('[data-datepicker-popup]')) return
      setMenuOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [menuOpen])

  function openMenu(e) {
    e.stopPropagation()
    if (!menuOpen) {
      // Anchor the fixed dropdown to the button's viewport coords
      const rect = menuBtnRef.current?.getBoundingClientRect()
      if (rect) {
        // Position below the button; if too close to bottom, flip upward
        const spaceBelow = window.innerHeight - rect.bottom
        const menuH = 200 // approx
        const top = spaceBelow > menuH ? rect.bottom + 4 : rect.top - menuH - 4
        // Right-align to button; don't overflow left
        const right = window.innerWidth - rect.right
        setMenuPos({ top, right: Math.max(right, 8) })
      }
    }
    setMenuOpen(v => !v)
  }

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

  const swipeLeft  = swipeDx < -8
  const swipeRight = swipeDx > 8
  const subtasks   = item.subtasks ?? []

  // The dropdown is rendered into a fixed portal div at the root to escape overflow:hidden
  const menuDropdown = menuOpen ? (
    <div
      id="cl-item-menu-portal"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top:   menuPos.top,
        right: menuPos.right,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: 'var(--shadow-modal)', zIndex: 9000, minWidth: 180, overflow: 'hidden',
      }}
    >
      {/* Due date picker */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
          <Calendar size={12} /> Due date
        </div>
        <DatePicker
          value={dueVal}
          onChange={val => { setDueVal(val); onUpdateDue(item.id, val || null) }}
          placeholder="Set due date"
        />
        {dueVal && (
          <button onClick={() => { setDueVal(''); onUpdateDue(item.id, null); setMenuOpen(false) }}
                  style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            Clear date
          </button>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Add subtask */}
      <button
        onClick={() => { onAddSubtask(item.id); setMenuOpen(false) }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--text-2)', textAlign: 'left', transition: 'background .12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <Plus size={12} /> Add subtask
      </button>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Note toggle */}
      <button
        onClick={() => { setShowNote(true); setMenuOpen(false) }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--text-2)', textAlign: 'left', transition: 'background .12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <StickyNote size={12} /> {item.note ? 'Edit note' : 'Add note'}
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
  ) : null

  return (
    <>
      {/* Render menu dropdown at document level via a portal div in <body> */}
      {menuOpen && typeof document !== 'undefined' && (() => {
        // We use a simple inline portal: append a div to body imperatively.
        // React portals require ReactDOM.createPortal — we avoid that by using
        // position:fixed with high z-index and NOT being inside overflow:hidden ancestors.
        // The menu is rendered outside the <li> via a sibling fragment below.
        return null
      })()}
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
          position: 'relative',
          borderRadius: 10,
          opacity: isDragging ? 0.4 : 1,
          transition: swipeDone ? 'opacity 0.22s, transform 0.22s' : undefined,
        }}
      >
        {/* Swipe backgrounds (mobile) — inside their own overflow:hidden wrapper */}
        {isMobile && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#10b981', display: 'flex', alignItems: 'center', paddingLeft: 14, opacity: swipeRight ? Math.min(1, swipeDx / SWIPE_THRESHOLD) : 0, transition: 'opacity .1s' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14, opacity: swipeLeft ? Math.min(1, -swipeDx / SWIPE_THRESHOLD) : 0, transition: 'opacity .1s' }}>
              <Trash2 size={16} color="white" />
            </div>
          </div>
        )}

        {/* Main row */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 6px',
          borderRadius: 10,
          background: hovered ? 'var(--surface2)' : 'transparent',
          transition: swipeDone ? 'transform 0.22s' : 'background .15s',
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
              border: `2px solid ${item.checked ? accent : 'var(--border)'}`,
              background: item.checked ? accent : 'transparent',
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
                  width: '100%', background: 'transparent', border: 'none', borderBottom: `1.5px solid ${accent}`,
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
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Calendar size={11} style={{ flexShrink: 0 }} />
                    {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {item.note && !showNote && (
                  <button
                    onClick={() => setShowNote(true)}
                    style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                  >
                    <StickyNote size={11} style={{ flexShrink: 0 }} /> note
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

          {/* ⋯ menu button */}
          <button
            ref={menuBtnRef}
            onClick={openMenu}
            style={{
              padding: 4, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--text-3)', opacity: hovered || menuOpen ? 1 : 0, transition: 'opacity .13s', display: 'flex', flexShrink: 0,
            }}
          >
            <MoreHorizontal size={14} />
          </button>

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

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <div style={{ paddingBottom: 4 }}>
            {subtasks.map(st => (
              <SubtaskRow
                key={st.id}
                subtask={st}
                listColor={accent}
                onToggle={id => onToggleSubtask(item.id, id)}
                onDelete={id => onDeleteSubtask(item.id, id)}
                onUpdateText={(id, text) => onUpdateSubtaskText(item.id, id, text)}
              />
            ))}
          </div>
        )}
      </li>

      {/* Fixed-position menu portal — rendered as sibling outside the li */}
      {menuDropdown}
    </>
  )
}

// ── Main panel for a single custom list ────────────────────────────────────
function CustomListBody({ list, isMobile, onUpdateList, onDeleteList, fullPage }) {
  const [newText,   setNewText]   = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditModal,     setShowEditModal]     = useState(false)
  const [confetti, setConfetti] = useState(null)

  // Track previous completion state for confetti edge detection
  const wasCompleteRef = useRef(false)
  // Ref on the list name element for confetti positioning
  const headerNameRef = useRef(null)

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

  const totalCount   = (list.items ?? []).length
  const checkedCount = (list.items ?? []).filter(i => i.checked).length
  const accent       = list.color || '#3a6fa8'

  // List is "complete" when all top-level items are checked (subtasks do not affect this)
  const isComplete = totalCount > 0 && checkedCount === totalCount

  // Confetti: fire once on the transition from incomplete → complete
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      // Burst from the list name element; fall back to viewport center
      let x = window.innerWidth / 2
      let y = window.innerHeight / 2
      if (headerNameRef.current) {
        const rect = headerNameRef.current.getBoundingClientRect()
        x = rect.left + rect.width / 2
        y = rect.top  + rect.height / 2
      }
      setConfetti({ key: Date.now(), x, y })
      setTimeout(() => setConfetti(null), 2000)
    }
    wasCompleteRef.current = isComplete
  }, [isComplete])

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

  // Subtask handlers
  function addSubtask(itemId) {
    const text = window.prompt('New subtask:')?.trim()
    if (!text) return
    const st = makeSubtask(text)
    onUpdateList({
      ...list,
      items: (list.items ?? []).map(i =>
        i.id === itemId ? { ...i, subtasks: [...(i.subtasks ?? []), st] } : i
      ),
    })
  }

  function toggleSubtask(itemId, subtaskId) {
    onUpdateList({
      ...list,
      items: (list.items ?? []).map(i =>
        i.id !== itemId ? i : {
          ...i,
          subtasks: (i.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, checked: !s.checked } : s),
        }
      ),
    })
  }

  function deleteSubtask(itemId, subtaskId) {
    onUpdateList({
      ...list,
      items: (list.items ?? []).map(i =>
        i.id !== itemId ? i : { ...i, subtasks: (i.subtasks ?? []).filter(s => s.id !== subtaskId) }
      ),
    })
  }

  function updateSubtaskText(itemId, subtaskId, text) {
    onUpdateList({
      ...list,
      items: (list.items ?? []).map(i =>
        i.id !== itemId ? i : {
          ...i,
          subtasks: (i.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, text } : s),
        }
      ),
    })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* List header */}
      <div style={{ padding: fullPage ? '16px 28px 12px' : '10px 16px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ListIconDisplay icon={list.icon} size={16} color={accent} />
          <span
            ref={headerNameRef}
            style={{
              fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)',
              textDecoration: isComplete ? 'line-through' : 'none',
              opacity: isComplete ? 0.55 : 1,
              transition: 'all .2s',
            }}
          >
            {list.name}
          </span>
          {totalCount > 0 && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: isComplete ? accent + '22' : 'var(--surface2)',
              color: isComplete ? accent : 'var(--text-3)',
              transition: 'all .2s',
            }}>
              {checkedCount}/{totalCount}
            </span>
          )}
          {/* List-level due date pill */}
          {list.dueDate && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: accent + '22', color: accent,
              border: `1px solid ${accent}44`,
              transition: 'all .2s',
            }}>
              <Calendar size={11} style={{ flexShrink: 0 }} />
              {new Date(list.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              <button
                type="button"
                onClick={() => onUpdateList({ ...list, dueDate: null })}
                title="Clear due date"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: accent, opacity: 0.7, lineHeight: 1, marginLeft: 1 }}
              >
                <X size={9} />
              </button>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Edit list button */}
          <button
            onClick={() => setShowEditModal(true)}
            style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            title="Edit list name, icon, color"
          >
            <Pencil size={13} />
          </button>

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
            onFocus={e => e.target.style.borderColor = accent}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            style={{
              padding: '7px 12px', borderRadius: 9, border: 'none',
              background: newText.trim() ? accent : 'var(--surface2)',
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
                listColor={accent}
                isMobile={isMobile}
                onToggle={toggleItem}
                onDelete={deleteItem}
                onUpdateText={updateText}
                onUpdateNote={updateNote}
                onUpdateDue={updateDue}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onUpdateSubtaskText={updateSubtaskText}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={dragIdRef.current === item.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Confetti on list completion */}
      {confetti && (
        <Confetti key={confetti.key} priority="medium" x={confetti.x} y={confetti.y} />
      )}

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

      {/* Edit list modal */}
      {showEditModal && (
        <EditListModal
          list={list}
          onClose={() => setShowEditModal(false)}
          onSave={(name, icon, color, dueDate) => onUpdateList({ ...list, name, icon, color, dueDate: dueDate ?? null })}
        />
      )}
    </div>
  )
}

// ── List switcher tabs + routing ─────────────────────────────────────────────
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
  const [deletingId, setDeletingId] = useState(null)

  // Per-list completion for tab strikethrough
  function listIsComplete(list) {
    const items = list.items ?? []
    return items.length > 0 && items.every(i => i.checked)
  }

  function confirmDeleteTab(e, id) {
    e.stopPropagation()
    setDeletingId(id)
  }

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
        {lists.map(list => {
          const complete = listIsComplete(list)
          const accent   = list.color || '#3a6fa8'
          const active   = activeListId === list.id
          return (
            <div key={list.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <button
                onClick={() => onSelectList(list.id)}
                style={{
                  padding: '6px 10px 6px 12px', borderRadius: '8px 8px 0 0',
                  border: 'none',
                  borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                  background: 'transparent',
                  color: active ? accent : 'var(--text-3)',
                  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap', transition: 'all .13s',
                  display: 'flex', alignItems: 'center', gap: 5,
                  paddingRight: 22, // leave room for × button
                }}
              >
                <ListIconDisplay icon={list.icon} size={13} color={active ? accent : undefined} />
                <span style={{
                  textDecoration: complete ? 'line-through' : 'none',
                  opacity: complete ? 0.55 : 1,
                  transition: 'all .2s',
                }}>
                  {list.name}
                </span>
                {complete && <Check size={10} color={accent} style={{ flexShrink: 0 }} />}
              </button>

              {/* × delete tab button */}
              <button
                onClick={e => confirmDeleteTab(e, list.id)}
                title={`Delete ${list.name}`}
                style={{
                  position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-3)', padding: 2, borderRadius: 4,
                  display: 'flex', alignItems: 'center',
                  opacity: 0.5, transition: 'opacity .12s, color .12s',
                  fontSize: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-3)' }}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

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

      {/* Tab × delete confirm dialog */}
      {deletingId && (() => {
        const list = lists.find(l => l.id === deletingId)
        if (!list) { setDeletingId(null); return null }
        const totalCount = (list.items ?? []).length
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setDeletingId(null)}
          >
            <div onClick={e => e.stopPropagation()}
                 style={{ width: 'min(320px,100%)', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)', padding: '24px 20px 18px' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Delete "{list.name}"?</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 20px' }}>All {totalCount} item{totalCount !== 1 ? 's' : ''} will be removed. This cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setDeletingId(null)}
                        style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { onDeleteList(deletingId); setDeletingId(null) }}
                        style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  Delete list
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
