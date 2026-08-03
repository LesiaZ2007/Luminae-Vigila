'use client'

/**
 * CategoryManager — add / rename / recolour / delete categories.
 *
 * Used for both kinds of category:
 *   • Task categories  (todoCategories)  — tag a to-do
 *   • Event categories (eventCategories) — tag a calendar event
 *
 * Both are `{ id, label, color }`, so one editor serves both; `title` and
 * `inUseCount` are all that differ.
 *
 * Edits are staged locally and only handed to `onChange` on Save, so Cancel
 * genuinely discards. Deleting a category that's still applied to items warns
 * first — the items aren't touched, they just fall back to showing the raw id.
 */

import { useState } from 'react'
import { X, Plus, Trash2, Pencil, Check } from 'lucide-react'

const PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]

export default function CategoryManager({
  categories,
  onChange,
  onClose,
  title = 'Manage Categories',
  // (categoryId) => number — how many items still use it. Drives the delete
  // warning. Optional: without it, deletes are silent.
  inUseCount,
}) {
  const [cats,      setCats]      = useState(categories)
  const [newName,   setNewName]   = useState('')
  const [newColor,  setNewColor]  = useState(PRESETS[0])
  const [error,     setError]     = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const nameTaken = (name, exceptId) => cats.some(
    c => c.id !== exceptId && c.label.toLowerCase() === name.trim().toLowerCase()
  )

  function addCat() {
    const name = newName.trim()
    if (!name)              { setError('Enter a name.');   return }
    if (nameTaken(name))    { setError('Already exists.'); return }
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    setCats(p => [...p, { id, label: name, color: newColor }])
    setNewName('')
    setError('')
  }

  function startEdit(cat) {
    setEditingId(cat.id)
    setEditDraft(cat.label)
    setError('')
  }

  function commitEdit() {
    const name = editDraft.trim()
    if (!name)                     { setEditingId(null); return }
    if (nameTaken(name, editingId)) { setError('Already exists.'); return }
    setCats(p => p.map(c => (c.id === editingId ? { ...c, label: name } : c)))
    setEditingId(null)
    setError('')
  }

  function updateColor(id, color) { setCats(p => p.map(c => (c.id === id ? { ...c, color } : c))) }

  function requestRemove(id) {
    // Only stop to confirm when something would visibly lose its label.
    if ((inUseCount?.(id) ?? 0) > 0) setConfirmId(id)
    else removeCat(id)
  }

  function removeCat(id) {
    setCats(p => p.filter(c => c.id !== id))
    setConfirmId(null)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4"
         style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
         onClick={onClose}>
      <div className="modal-surface w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close"
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Existing categories */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cats.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', padding: '10px 0' }}>
                No categories yet — add one below.
              </p>
            )}
            {cats.map(cat => {
              const used = inUseCount?.(cat.id) ?? 0
              return (
                <div key={cat.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', width: 120, flexShrink: 0 }}>
                      {PRESETS.map(c => (
                        <button key={c} type="button" onClick={() => updateColor(cat.id, c)}
                                title={c} aria-label={`Set ${cat.label} to ${c}`}
                                style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: cat.color === c ? '2.5px solid var(--text)' : '2px solid transparent', cursor: 'pointer', transition: 'transform .1s', padding: 0 }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        />
                      ))}
                    </div>

                    {editingId === cat.id ? (
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); setError('') }
                        }}
                        maxLength={32}
                        style={{
                          flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 8,
                          border: '1.5px solid var(--blue)', background: 'var(--surface)',
                          color: 'var(--text)', fontSize: '0.875rem', fontWeight: 600,
                          fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEdit(cat)}
                        title="Double-click to rename"
                        style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', fontWeight: 600, color: cat.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {cat.label}
                      </span>
                    )}

                    <button onClick={() => (editingId === cat.id ? commitEdit() : startEdit(cat))}
                            aria-label={editingId === cat.id ? 'Save name' : `Rename ${cat.label}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s', display: 'flex' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      {editingId === cat.id ? <Check size={14} /> : <Pencil size={13} />}
                    </button>

                    <button onClick={() => requestRemove(cat.id)}
                            aria-label={`Delete ${cat.label}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s', display: 'flex' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Delete confirmation — only when items would be affected */}
                  {confirmId === cat.id && (
                    <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-2)', margin: '0 0 8px' }}>
                        {used} item{used !== 1 ? 's' : ''} still use{used === 1 ? 's' : ''} “{cat.label}”.
                        They won’t be deleted, but they’ll lose this label.
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => setConfirmId(null)}
                                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                          Keep
                        </button>
                        <button type="button" onClick={() => removeCat(cat.id)}
                                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                          Delete anyway
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add new */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p className="field-label" style={{ marginBottom: 10 }}>Add New Category</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: 10 }}>
              {PRESETS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)} aria-label={`Use ${c}`}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newColor === c ? '2.5px solid var(--text)' : '2px solid transparent', cursor: 'pointer', transition: 'transform .1s', padding: 0 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                     placeholder="Category name" className="field" maxLength={32}
                     onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCat())} />
              <button type="button" onClick={addCat} className="btn-primary" aria-label="Add category"
                      style={{ background: newColor, flexShrink: 0 }}>
                <Plus size={14} />
              </button>
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4 }}>{error}</p>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
            <button type="button" onClick={() => { onChange(cats); onClose() }} className="btn-primary" style={{ flex: 1 }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
