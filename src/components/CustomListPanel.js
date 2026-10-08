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
  Plus, MoreHorizontal, Trash2, X, Pencil, Check,
  ShoppingCart, Package, ListChecks, NotebookPen, Backpack, Gift,
  Wrench, Lightbulb, Plane, Heart, Star, BookOpen, Dumbbell, Utensils,
  Calendar, StickyNote,
} from 'lucide-react'
import Confetti from '@/components/Confetti'
import {
  makeItem, makeSubtask, visibleItems,
  addListItem, patchItem, deleteListItem, clearCheckedItems, reorderListItems,
  addListSubtask, patchSubtask, deleteListSubtask,
} from '@/lib/customLists'
import DatePicker from '@/components/DatePicker'
import Dialog, { ConfirmDialog } from '@/components/Dialog'
import useDragReorder from '@/lib/useDragReorder'
import { nextSortOrder } from '@/lib/reorder'
import { TaskCheckbox, ReorderHandle, rowActionStyle } from '@/components/TaskRowParts'
import { useSwipeActions, SwipeBackgrounds } from '@/components/SwipeActions'

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

// The list modals' own panel: narrower and more tightly padded than the form modals.
const LIST_PANEL = { width: 'min(420px,100%)', borderRadius: 18, padding: '24px 24px 20px' }

// ── New-list creation modal ────────────────────────────────────────────────
export function NewListModal({ onClose, onCreate }) {
  return (
    <Dialog label="New custom list" onClose={onClose} panelStyle={LIST_PANEL}>
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
    </Dialog>
  )
}

// ── Edit-list modal ────────────────────────────────────────────────────────
function EditListModal({ list, onClose, onSave }) {
  return (
    <Dialog label="Edit list" onClose={onClose} panelStyle={LIST_PANEL}>
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
    </Dialog>
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
      <TaskCheckbox
        checked={subtask.checked}
        label={subtask.checked ? 'Mark subtask not done' : 'Mark subtask done'}
        checkedColor={accent}
        size={14}
        strokeWidth={2}
        transition="all .18s"
        onClick={() => onToggle(subtask.id)}
      />

      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            /* Escape commits, like clicking away does — see the same fix on the task
               modal's step fields. Every way out of one of these means the same thing. */
            if (e.key === 'Enter' || e.key === 'Escape') commit()
          }}
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
  dragRow, dragHandle, isDragging,
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

  // Touch: right ticks, left deletes. A right swipe on a ticked item just snaps back.
  const swipe = useSwipeActions({
    enabled:       isMobile,
    canSwipeRight: !item.checked,
    onSwipeRight:  () => onToggle(item.id),
    onSwipeLeft:   () => onDelete(item.id),
  })

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

  function commitText() {
    const trimmed = textVal.trim()
    if (trimmed && trimmed !== item.text) onUpdateText(item.id, trimmed)
    else setTextVal(item.text)
    setEditingText(false)
  }

  function commitNote() {
    onUpdateNote(item.id, noteVal.trim() || null)
  }

  const subtasks   = item.subtasks ?? []
  const actionStyle = rowActionStyle(hovered, isMobile, 'list')

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
        /* Not draggable while the text or the note is being edited: a drag started
           inside the field would pick up the whole row instead of selecting text. */
        {...(editingText || showNote ? undefined : dragRow)}
        {...swipe.handlers}
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && setHovered(false)}
        style={{
          position: 'relative',
          borderRadius: 10,
          opacity: isDragging ? 0.4 : 1,
          transition: swipe.committing ? 'opacity 0.22s, transform 0.22s' : undefined,
        }}
      >
        {/* Swipe backgrounds (mobile) — inside their own overflow:hidden wrapper */}
        {isMobile && <SwipeBackgrounds dx={swipe.dx} look="list" />}

        {/* Main row */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 6px',
          borderRadius: 10,
          background: hovered ? 'var(--surface2)' : 'transparent',
          transition: swipe.committing ? 'transform 0.22s' : 'background .15s',
          transform: swipe.transform,
        }}>
          {/* Drag handle (desktop — touch swipes instead) */}
          {dragHandle && (
            <ReorderHandle handle={dragHandle} label={item.text} hovered={hovered} look="list" />
          )}

          <TaskCheckbox
            checked={item.checked}
            label={item.checked ? 'Mark not done' : 'Mark done'}
            checkedColor={accent}
            marginTop={3}
            transition="all .18s"
            onClick={e => { e.stopPropagation(); onToggle(item.id) }}
          />

          {/* Text + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingText ? (
              <input
                autoFocus
                value={textVal}
                onChange={e => setTextVal(e.target.value)}
                onBlur={commitText}
                onKeyDown={e => {
                  // Escape keeps the rename, same as blurring — see the subtask row above.
                  if (e.key === 'Enter' || e.key === 'Escape') commitText()
                }}
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

          {/* Row actions — always visible (dimmed until hover) rather than
              hover-only, so add-subtask and delete are discoverable without
              hunting, and reachable on touch where there is no hover at all. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); onAddSubtask(item.id) }}
              title="Add subtask"
              aria-label="Add subtask"
              style={actionStyle}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              <Plus size={14} />
            </button>

            <button
              ref={menuBtnRef}
              onClick={openMenu}
              title="More"
              aria-label="More options"
              style={{ ...actionStyle, opacity: menuOpen ? 1 : actionStyle.opacity }}
            >
              <MoreHorizontal size={14} />
            </button>

            <button
              onClick={e => { e.stopPropagation(); onDelete(item.id) }}
              title="Delete item"
              aria-label="Delete item"
              style={actionStyle}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              <Trash2 size={13} />
            </button>
          </div>
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

  /* visibleItems, not list.items: a deleted item is now a tombstone that stays in
     the array so the delete can sync, and it must not be rendered or counted. */
  const live = visibleItems(list)

  const sorted = live.slice().sort((a, b) => {
    if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
    if (a.sortOrder != null) return -1
    if (b.sortOrder != null) return 1
    return 0
  })

  // Touch reorders nothing — a horizontal drag there is a swipe.
  const drag = useDragReorder({
    items: sorted,
    enabled: !isMobile,
    onCommit: ordered => onUpdateList(reorderListItems(list, ordered)),
  })
  const items = drag.orderedItems

  const totalCount   = live.length
  const checkedCount = live.filter(i => i.checked).length
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

  /* Every one of these goes through a helper in lib/customLists rather than
     splicing `list.items` here. An item is a merge unit now — it carries its own
     `updatedAt`, and deleting one leaves a tombstone — and the helpers are what
     keep that bookkeeping in one place instead of repeated across nine handlers,
     where a single missed stamp would silently lose the edit on another device. */

  function addItem() {
    const text = newText.trim()
    if (!text) return
    /* One past the highest, not the count: after a reorder and a few deletions the
       count can be a value a live item still holds, and the new item landed in the
       middle of the list instead of at the bottom. */
    onUpdateList(addListItem(list, { ...makeItem(text), sortOrder: nextSortOrder(live) }))
    setNewText('')
  }

  function toggleItem(id) {
    const item = (list.items ?? []).find(i => i.id === id)
    onUpdateList(patchItem(list, id, { checked: !item?.checked }))
  }

  function deleteItem(id) {
    onUpdateList(deleteListItem(list, id))
  }

  function updateText(id, text) {
    onUpdateList(patchItem(list, id, { text }))
  }

  function updateNote(id, note) {
    onUpdateList(patchItem(list, id, { note }))
  }

  function updateDue(id, dueDate) {
    onUpdateList(patchItem(list, id, { dueDate }))
  }

  function clearChecked() {
    onUpdateList(clearCheckedItems(list))
  }

  // Subtask handlers. A subtask is not a merge unit — it lives inside its item's
  // blob, so these stamp the item and need no tombstone of their own.
  function addSubtask(itemId) {
    const text = window.prompt('New subtask:')?.trim()
    if (!text) return
    onUpdateList(addListSubtask(list, itemId, makeSubtask(text)))
  }

  function toggleSubtask(itemId, subtaskId) {
    const item = (list.items ?? []).find(i => i.id === itemId)
    const st   = (item?.subtasks ?? []).find(s => s.id === subtaskId)
    onUpdateList(patchSubtask(list, itemId, subtaskId, { checked: !st?.checked }))
  }

  function deleteSubtask(itemId, subtaskId) {
    onUpdateList(deleteListSubtask(list, itemId, subtaskId))
  }

  function updateSubtaskText(itemId, subtaskId, text) {
    onUpdateList(patchSubtask(list, itemId, subtaskId, { text }))
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
          // The whole list takes the drop, so letting go in a gap still lands the item.
          <ul {...drag.listProps} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                dragRow={drag.rowProps(item.id)}
                dragHandle={drag.enabled ? drag.handleProps(item.id) : undefined}
                isDragging={drag.draggingId === item.id}
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
        <ConfirmDialog
          title={`Delete “${list.name}”?`}
          message={`All ${totalCount} item${totalCount !== 1 ? 's' : ''} will be removed. This cannot be undone.`}
          confirmLabel="Delete list"
          destructive
          onConfirm={() => { onDeleteList(list.id); setShowDeleteConfirm(false) }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
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

  // Per-list completion for tab strikethrough. Tombstoned items are not on the
  // list any more, so they must not decide whether it reads as finished.
  function listIsComplete(list) {
    const items = visibleItems(list)
    return items.length > 0 && items.every(i => i.checked)
  }

  function confirmDeleteTab(e, id) {
    e.stopPropagation()
    setDeletingId(id)
  }

  /* Slide the selected tab to the middle of the strip.
     The strip is narrow in the calendar sidebar, so a list picked from the far
     end would otherwise sit half off-screen. scrollTo on the strip itself
     (rather than scrollIntoView) keeps the scrolling contained — scrollIntoView
     also walks up and nudges ancestor scroll containers. */
  const tabStripRef = useRef(null)
  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip) return
    const id  = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(activeListId)) : activeListId
    const tab = strip.querySelector(`[data-tab-id="${id}"]`)
    if (!tab) return

    const target = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2
    const max    = strip.scrollWidth - strip.clientWidth
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    strip.scrollTo({
      left: Math.max(0, Math.min(target, max)),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [activeListId, lists.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
      {/* ── Switcher tabs ── */}
      <div ref={tabStripRef} className="lv-tab-strip" style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: fullPage ? '10px 24px 0' : '8px 12px 0',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {/* My Tasks tab */}
        <button
          data-tab-id="my-tasks"
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
            <div key={list.id} data-tab-id={list.id}
                 style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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

      {/* Tab × delete confirm dialog. A list that vanished meanwhile (deleted on
          another device, say) simply has no confirm to show — this used to clear
          deletingId during render, which React warns about and can loop on. */}
      {deletingId && (() => {
        const list = lists.find(l => l.id === deletingId)
        if (!list) return null
        const totalCount = visibleItems(list).length
        return (
          <ConfirmDialog
            title={`Delete “${list.name}”?`}
            message={`All ${totalCount} item${totalCount !== 1 ? 's' : ''} will be removed. This cannot be undone.`}
            confirmLabel="Delete list"
            destructive
            onConfirm={() => { onDeleteList(list.id); setDeletingId(null) }}
            onCancel={() => setDeletingId(null)}
          />
        )
      })()}
    </div>
  )
}
