'use client'

/**
 * AssignmentDetailModal — shows full details for a Canvas assignment.
 *
 * Props:
 *   assignment      — the Canvas assignment object
 *   courseColor     — hex color for the course (optional, defaults to Canvas orange)
 *   onClose         — close callback
 *   onToggleDone    — (id) => void  — mark done/undone
 *   onUpdateNotes   — (id, notes) => void  — save notes
 */

import { useState, useEffect } from 'react'
import { X, ExternalLink, CheckCircle2, Circle, Clock, AlertCircle, FileText, Upload, Link2, Pencil } from 'lucide-react'

const CANVAS_COLOR = '#E8751A'

function fmtDueDate(dueAt) {
  if (!dueAt) return null
  const d    = new Date(dueAt)
  const now  = new Date()
  const diff = d - now
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (diff < 0) return { label: `${date} at ${time}`, overdue: true,  urgent: false }
  if (days === 0) return { label: `Today at ${time}`,   overdue: false, urgent: true  }
  if (days === 1) return { label: `Tomorrow at ${time}`,overdue: false, urgent: true  }
  return { label: `${date} at ${time}`, overdue: false, urgent: false }
}

function submissionTypeLabel(type) {
  const map = {
    online_upload:      'File upload',
    online_text_entry:  'Text entry',
    online_url:         'Website URL',
    media_recording:    'Media recording',
    on_paper:           'On paper',
    none:               'No submission',
    not_graded:         'Not graded',
    external_tool:      'External tool',
    discussion_topic:   'Discussion',
    wiki_page:          'Wiki page',
  }
  return map[type] ?? type
}

export default function AssignmentDetailModal({ assignment: a, courseColor, onClose, onToggleDone, onUpdateNotes }) {
  const [closing,   setClosing]   = useState(false)
  const [notes,     setNotes]     = useState(a?.notes ?? '')
  const [editNotes, setEditNotes] = useState(false)
  const color = courseColor ?? CANVAS_COLOR

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line

  // Sync notes if assignment changes
  useEffect(() => { setNotes(a?.notes ?? '') }, [a?.id]) // eslint-disable-line

  if (!a) return null

  const isDone = a.done || a.submissionState === 'graded' || a.submissionState === 'submitted'
  const due    = fmtDueDate(a.dueAt)

  function saveNotes() {
    setEditNotes(false)
    onUpdateNotes?.(a.id, notes)
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className={`modal-surface${closing ? ' modal-closing' : ''}`}
        style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ gap: 10 }}>
          {/* Course color dot + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.courseName}
            </span>
          </div>
          <button
            onClick={handleClose}
            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Title + done toggle */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <button
              onClick={() => onToggleDone?.(a.id)}
              title={a.done ? 'Mark undone' : 'Mark done'}
              style={{ flexShrink: 0, marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isDone ? color : 'var(--text-3)' }}
            >
              {isDone ? <CheckCircle2 size={20} strokeWidth={2} /> : <Circle size={20} strokeWidth={1.5} />}
            </button>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3, flex: 1 }}>
              {a.title}
            </h2>
          </div>

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {/* Due date */}
            {due && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Due</span>
                <span style={{
                  fontSize: '0.8rem', fontWeight: 600,
                  color: due.overdue ? 'var(--red)' : due.urgent ? 'var(--amber)' : 'var(--text)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {due.overdue && <Clock size={12} />}
                  {due.urgent && !due.overdue && <AlertCircle size={12} />}
                  {due.label}
                </span>
              </div>
            )}

            {/* Points */}
            {a.pointsPossible != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Points</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                  {a.score != null ? `${a.score} / ${a.pointsPossible}` : `— / ${a.pointsPossible}`}
                </span>
              </div>
            )}

            {/* Status */}
            {(a.submissionState || a.done) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: a.submissionState === 'graded' || a.done ? '#10b981' : a.submissionState === 'submitted' ? '#60a5fa' : 'var(--text-2)' }}>
                  {a.done && a.submissionState !== 'graded' && a.submissionState !== 'submitted' ? 'Marked done' : a.submissionState === 'graded' ? 'Graded' : a.submissionState === 'submitted' ? 'Submitted' : ''}
                </span>
              </div>
            )}

            {/* Submission type */}
            {a.submissionTypes?.length > 0 && a.submissionTypes[0] !== 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Upload size={11} />
                  {a.submissionTypes.map(submissionTypeLabel).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          {a.description && a.description.trim() && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={13} style={{ color: 'var(--text-3)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</span>
              </div>
              <div
                style={{
                  fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  maxHeight: 220, overflowY: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: a.description }}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pencil size={12} style={{ color: 'var(--text-3)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Notes</span>
              </div>
              {!editNotes && (
                <button
                  onClick={() => setEditNotes(true)}
                  style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 5 }}
                >
                  {notes ? 'Edit' : '+ Add'}
                </button>
              )}
            </div>
            {editNotes ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  autoFocus
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add private notes about this assignment…"
                  className="field"
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '0.82rem' }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setNotes(a?.notes ?? ''); setEditNotes(false) }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={saveNotes} style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: color, color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit' }}>Save</button>
                </div>
              </div>
            ) : notes ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.5, padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                {notes}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No notes yet.</div>
            )}
          </div>

          {/* Canvas link */}
          {a.htmlUrl && (
            <a
              href={a.htmlUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 16px', borderRadius: 10,
                border: `1px solid ${color}55`,
                background: `${color}11`,
                color: color,
                fontWeight: 700, fontSize: '0.82rem',
                textDecoration: 'none', transition: 'all .13s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.borderColor = color }}
              onMouseLeave={e => { e.currentTarget.style.background = `${color}11`; e.currentTarget.style.borderColor = `${color}55` }}
            >
              <ExternalLink size={13} />
              Open in Canvas
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
