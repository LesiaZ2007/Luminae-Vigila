'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

const PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]

export default function CategoryManager({ categories, onChange, onClose }) {
  const [cats,     setCats]    = useState(categories)
  const [newName,  setNewName] = useState('')
  const [newColor, setNewColor]= useState(PRESETS[0])
  const [error,    setError]   = useState('')

  function addCat() {
    if (!newName.trim()) { setError('Enter a name.'); return }
    if (cats.some(c => c.label.toLowerCase() === newName.trim().toLowerCase())) { setError('Already exists.'); return }
    const id = newName.trim().toLowerCase().replace(/\s+/g,'-') + '-' + Date.now()
    setCats(p => [...p, { id, label: newName.trim(), color: newColor }])
    setNewName('')
    setError('')
  }

  function updateColor(id, color) { setCats(p => p.map(c => c.id === id ? { ...c, color } : c)) }
  function removeCat(id)          { setCats(p => p.filter(c => c.id !== id)) }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4"
         style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}>
      <div className="modal-surface w-full max-w-sm overflow-hidden">

        <div className="modal-header">
          <h2>Manage Categories</h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Existing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cats.map(cat => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px' }}>
                {/* Color swatches */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', width: 120, flexShrink: 0 }}>
                  {PRESETS.map(c => (
                    <button key={c} type="button" onClick={() => updateColor(cat.id, c)}
                            style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: cat.color === c ? '2.5px solid var(--text)' : '2px solid transparent', cursor: 'pointer', transition: 'transform .1s' }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  ))}
                </div>
                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: cat.color }}>{cat.label}</span>
                <button onClick={() => removeCat(cat.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, transition: 'color .15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add new */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p className="field-label" style={{ marginBottom: 10 }}>Add New Category</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: 10 }}>
              {PRESETS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newColor === c ? '2.5px solid var(--text)' : '2px solid transparent', cursor: 'pointer', transition: 'transform .1s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                     placeholder="Category name" className="field"
                     onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCat())} />
              <button type="button" onClick={addCat} className="btn-primary" style={{ background: newColor, flexShrink: 0 }}>
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
