'use client'

/**
 * LinkedNotes — the other half of a note's `linkedTo`.
 *
 * Notes could already be attached to a course, event, or task, but nothing
 * read that back: you could file "Chem Lab notes" under AP Bio and then never
 * see it from the course. This renders the reverse view wherever the linked
 * item lives.
 *
 * Props
 * ─────
 *  notes      Note[]                   — all notes (trashed ones are skipped)
 *  targetId   string | string[]        — the course / event / task id. An array when
 *                                        one thing has several ids: a class with linked
 *                                        lab sections is one class, and a note filed
 *                                        against either half belongs to it. New notes
 *                                        are created against the first id given.
 *  onOpenNote (noteId) => void         — jump to the Notes tab with it open
 *  onCreate   () => void               — optional: start a note already linked
 *  compact    bool                     — tighter styling for modal bodies
 */

import { NotebookPen, ChevronRight, Plus } from 'lucide-react'
import { noteDisplayTitle, notePreview, sortNotes } from '@/lib/notes'

export default function LinkedNotes({ notes = [], targetId, onOpenNote, onCreate, compact = false }) {
  const targetIds = (Array.isArray(targetId) ? targetId : [targetId]).filter(Boolean).map(String)
  if (targetIds.length === 0) return null

  const linked = sortNotes(
    notes.filter(n => !n.trashedAt && n.linkedTo?.id != null && targetIds.includes(String(n.linkedTo.id)))
  )

  // Nothing linked and no way to add one — render nothing rather than an
  // empty section that just takes up room.
  if (linked.length === 0 && !onCreate) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
          <NotebookPen size={12} style={{ color: 'var(--blue)' }} />
          Notes{linked.length > 0 ? ` (${linked.length})` : ''}
        </label>
        {onCreate && (
          <button type="button" onClick={onCreate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
            <Plus size={12} /> New note
          </button>
        )}
      </div>

      {linked.length === 0 ? (
        <p style={{ fontSize: '0.74rem', color: 'var(--text-3)', margin: 0 }}>
          No notes linked yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {linked.map(note => {
            const preview = notePreview(note, 60)
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote?.(note.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: compact ? '6px 8px' : '8px 10px', borderRadius: 9,
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .13s, background .13s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = note.color; e.currentTarget.style.background = 'var(--surface)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)' }}
              >
                <span style={{ width: 3, alignSelf: 'stretch', minHeight: 20, borderRadius: 2, background: note.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {noteDisplayTitle(note)}
                  </span>
                  {preview && (
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview}
                    </span>
                  )}
                </span>
                <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
