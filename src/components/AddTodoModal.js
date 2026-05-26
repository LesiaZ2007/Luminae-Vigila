'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Link2, BookOpen, RefreshCw, Plus, Trash2, GripVertical } from 'lucide-react'
import Select     from '@/components/Select'
import DatePicker from '@/components/DatePicker'

const REMINDER_OPTIONS = [
  { label: 'No reminder',  ms: 0 },
  { label: '1 day before', ms: 24 * 60 * 60_000 },
  { label: '2 days before',ms: 2 * 24 * 60 * 60_000 },
  { label: '1 week before',ms: 7 * 24 * 60 * 60_000 },
]

const PRIORITY = [
  { id: 'low',    label: 'Low',    color: '#94a3b8' },
  { id: 'medium', label: 'Medium', color: '#f59e0b' },
  { id: 'high',   label: 'High',   color: '#ef4444' },
]

export default function AddTodoModal({ events, canvasClasses = [], todoCategories, onAdd, onEdit, onEditCanvas, onClose, editTodo, initialDate }) {
  const isEdit   = !!editTodo
  const isCanvas = !!(editTodo?.canvasId)

  const [title,         setTitle]         = useState(editTodo?.title || '')
  const [category,      setCategory]      = useState(editTodo?.category || todoCategories[0]?.id || '')
  const [dueDate,       setDueDate]       = useState(editTodo?.dueDate || initialDate || '')
  const [priority,      setPriority]      = useState(editTodo?.priority || 'medium')
  const [notes,         setNotes]         = useState(editTodo?.notes || '')
  const [reminderMs,    setReminderMs]    = useState(editTodo?.reminder?.ms || 0)
  const [linkedEventId, setLinkedEventId] = useState(editTodo?.linkedEventId || '')
  const [showDoBefore,  setShowDoBefore]  = useState(!!editTodo?.linkedEventId)
  const [linkedClassId, setLinkedClassId] = useState(editTodo?.linkedClassId  || '')
  const [showClassLink, setShowClassLink] = useState(!!editTodo?.linkedClassId)
  const [repeats,       setRepeats]       = useState(!!editTodo?.recurrence)
  const [repeatType,    setRepeatType]    = useState(editTodo?.recurrence?.type || 'weekly')
  const [repeatDays,    setRepeatDays]    = useState(editTodo?.recurrence?.days || [new Date().getDay()])
  const [repeatUntil,   setRepeatUntil]   = useState(editTodo?.recurrence?.until || '')
  const [subtasks,      setSubtasks]      = useState(editTodo?.subtasks ?? [])
  const [newSubtask,    setNewSubtask]    = useState('')
  const [editingIdx,    setEditingIdx]    = useState(-1)
  const [editingVal,    setEditingVal]    = useState('')
  const [dragOverIdx,   setDragOverIdx]   = useState(-1)
  const [error,         setError]         = useState('')
  const [closing,       setClosing]       = useState(false)
  const subtaskInputRef = useRef(null)
  const dragIdxRef      = useRef(null)

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const upcomingEvents = events
    .filter(e => !e.allDay && new Date(e.start) >= new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 25)

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setError('Please enter a task title.'); return }
    if (showDoBefore && !linkedEventId) { setError('Please select an event to link to.'); return }
    const opt = REMINDER_OPTIONS.find(r => r.ms === Number(reminderMs))
    const payload = {
      title:         title.trim(),
      category,
      dueDate:       dueDate || null,
      priority,
      notes:         notes.trim() || null,
      reminder:      Number(reminderMs) > 0 ? { ms: Number(reminderMs), label: opt?.label || '' } : null,
      linkedEventId: showDoBefore ? linkedEventId : null,
      linkedClassId: showClassLink ? linkedClassId : null,
      recurrence:    (!isCanvas && repeats) ? {
        type:  repeatType,
        days:  repeatType === 'custom' ? repeatDays : [],
        until: repeatUntil || null,
      } : null,
      subtasks:      subtasks.length > 0 ? subtasks : [],
    }
    if (isCanvas) {
      // Canvas assignments: call onEditCanvas with local-override fields only
      onEditCanvas?.({ ...editTodo, ...payload })
    } else if (isEdit) {
      onEdit({ ...editTodo, ...payload })
    } else {
      onAdd(payload)
    }
    handleClose()
  }

  function chipStyle(active, color) {
    return {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '6px 14px', borderRadius: '999px',
      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all 0.13s',
      border: active ? `1.5px solid ${color}` : '1.5px solid transparent',
      background: active ? color + '22' : 'var(--surface2)',
      color: active ? color : 'var(--text-2)',
    }
  }

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
         style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
         onClick={handleClose}>
      <div className={`modal-surface w-full max-w-sm overflow-hidden${closing ? ' modal-closing' : ''}`}
           onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{isCanvas ? 'Canvas Assignment' : isEdit ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={handleClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* Canvas assignment description (read-only) */}
          {isCanvas && editTodo?.description && (() => {
            const plain = editTodo.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (!plain) return null
            return (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-2)', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(232,117,26,.8)', marginBottom: 4 }}>Assignment Details</div>
                {plain.length > 300 ? plain.slice(0, 300) + '…' : plain}
                {editTodo.htmlUrl && (
                  <a href={editTodo.htmlUrl} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, color: '#E8751A', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none' }}>
                    Open in Canvas →
                  </a>
                )}
              </div>
            )
          })()}

          {/* Title */}
          <div>
            <label className="field-label">{isCanvas ? 'Assignment' : 'Task'}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="e.g. Read chapter 4" autoFocus={!isCanvas} readOnly={isCanvas} className="field"
                   style={isCanvas ? { color: 'var(--text-2)', cursor: 'default' } : {}} />
          </div>

          {/* Category — hidden for canvas assignments */}
          {!isCanvas && todoCategories.length > 0 && (
            <div>
              <label className="field-label">Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {todoCategories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCategory(cat.id)}
                          style={chipStyle(category === cat.id, cat.color)}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color }} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="field-label">Priority</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {PRIORITY.map(p => (
                <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                        style={{ ...chipStyle(priority === p.id, p.color), flex: 1, justifyContent: 'center' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date — read-only for canvas (comes from Canvas API) */}
          <div>
            <label className="field-label">
              Due Date{' '}
              {!isCanvas && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span>}
              {isCanvas  && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgba(232,117,26,.7)' }}>· from Canvas</span>}
            </label>
            {isCanvas
              ? <input type="text" readOnly value={dueDate ? new Date(dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No due date'} className="field" style={{ color: 'var(--text-2)', cursor: 'default' }} />
              : <DatePicker value={dueDate} onChange={setDueDate} />
            }
          </div>

          {/* Repeat — hidden for canvas assignments */}
          {!isCanvas && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: repeats ? 12 : 0 }}>
              <button type="button" className="toggle" data-on={String(repeats)} onClick={() => setRepeats(v => !v)}>
                <div className="toggle-thumb" />
              </button>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={13} style={{ color: repeats ? 'var(--blue)' : 'var(--text-3)' }} /> Repeats
              </span>
            </div>
            {repeats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 2 }}>
                {/* Type buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'custom', label: 'Custom' }].map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => setRepeatType(id)} style={{
                      flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600,
                      background: repeatType === id ? 'var(--blue)' : 'var(--surface2)',
                      color:      repeatType === id ? '#fff'        : 'var(--text-2)',
                      transition: 'all .13s',
                    }}>{label}</button>
                  ))}
                </div>
                {/* Day picker for custom */}
                {repeatType === 'custom' && (
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <button key={i} type="button"
                        onClick={() => setRepeatDays(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])}
                        style={{
                          flex: 1, aspectRatio: '1', borderRadius: '50%', border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: '0.73rem', fontWeight: 700,
                          background: repeatDays.includes(i) ? 'var(--blue)' : 'var(--surface2)',
                          color:      repeatDays.includes(i) ? '#fff'        : 'var(--text-2)',
                          transition: 'all .13s',
                        }}>{d}</button>
                    ))}
                  </div>
                )}
                {/* Until */}
                <div>
                  <label className="field-label">Repeat until <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>
                  <DatePicker value={repeatUntil} onChange={setRepeatUntil} min={dueDate || ''} />
                </div>
              </div>
            )}
          </div>}

          {/* Reminder */}
          <div>
            <label className="field-label">Reminder</label>
            <Select value={reminderMs} onChange={v => setReminderMs(Number(v))}
                    options={REMINDER_OPTIONS.map(r => ({ value: r.ms, label: r.label }))} />
          </div>

          {/* Do before */}
          <div>
            <button type="button" onClick={() => { setShowDoBefore(v => !v); setLinkedEventId('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: showDoBefore ? 'var(--blue)' : 'var(--text-3)', transition: 'color .15s', padding: 0 }}>
              <Link2 size={14} />
              {showDoBefore ? 'Linked to event' : 'Due before an event'}
            </button>
            {showDoBefore && (
              <div style={{ marginTop: 8 }}>
                {upcomingEvents.length === 0
                  ? <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>No upcoming events yet — add events to the calendar first.</p>
                  : <Select
                      value={linkedEventId}
                      placeholder="— Select an event —"
                      onChange={id => {
                        setLinkedEventId(id)
                        if (id) {
                          const ev = upcomingEvents.find(x => x.id === id)
                          if (ev) setDueDate(new Date(ev.start).toISOString().slice(0, 10))
                        }
                      }}
                      options={upcomingEvents.map(ev => ({
                        value: ev.id,
                        label: `${ev.title} · ${new Date(ev.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
                      }))}
                    />
                }
              </div>
            )}
          </div>

          {/* Link to class (only shown when class schedule has entries) */}
          {canvasClasses.length > 0 && (
            <div>
              <button type="button"
                      onClick={() => { setShowClassLink(v => !v); if (showClassLink) setLinkedClassId('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, color: showClassLink ? 'var(--blue)' : 'var(--text-3)', transition: 'color .15s', padding: 0 }}>
                <BookOpen size={14} />
                {showClassLink ? 'Linked to class' : 'Link to a class'}
              </button>
              {showClassLink && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {canvasClasses.filter(c => c.enabled !== false).map(cls => (
                      <button key={cls.id} type="button"
                              onClick={() => setLinkedClassId(cls.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 999,
                                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit', transition: 'all .13s',
                                border: linkedClassId === cls.id ? `1.5px solid ${cls.color}` : '1.5px solid transparent',
                                background: linkedClassId === cls.id ? cls.color + '22' : 'var(--surface2)',
                                color: linkedClassId === cls.id ? cls.color : 'var(--text-2)',
                              }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cls.color, flexShrink: 0 }} />
                        {cls.courseName}
                      </button>
                    ))}
                  </div>
                  {showClassLink && !linkedClassId && (
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-3)' }}>Select a class above.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="field-label">Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Any extra details..." rows={2} className="field" />
          </div>

          {/* Subtasks — hidden for canvas assignments */}
          {!isCanvas && (
            <div>
              <label className="field-label">Subtasks <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>

              {subtasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {subtasks.map((st, i) => (
                    <div
                      key={st.id}
                      draggable
                      onDragStart={e => { dragIdxRef.current = i; e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(i) }}
                      onDrop={e => {
                        e.preventDefault()
                        const from = dragIdxRef.current
                        if (from == null || from === i) { setDragOverIdx(-1); return }
                        setSubtasks(p => {
                          const next = [...p]
                          const [moved] = next.splice(from, 1)
                          next.splice(i, 0, moved)
                          return next
                        })
                        dragIdxRef.current = null; setDragOverIdx(-1)
                      }}
                      onDragEnd={() => { dragIdxRef.current = null; setDragOverIdx(-1) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '7px 10px', borderRadius: 9,
                        background: dragOverIdx === i ? 'var(--blue-bg)' : 'var(--surface2)',
                        border: dragOverIdx === i ? '1px solid var(--blue)' : '1px solid var(--border)',
                        transition: 'background .1s, border-color .1s',
                      }}
                    >
                      {/* Drag handle */}
                      <span style={{ color: 'var(--text-3)', cursor: 'grab', display: 'flex', flexShrink: 0, touchAction: 'none' }}>
                        <GripVertical size={13} />
                      </span>

                      {/* Check / uncheck */}
                      <button type="button"
                              onClick={() => setSubtasks(p => p.map((s, j) => j === i ? { ...s, completed: !s.completed } : s))}
                              style={{
                                flexShrink: 0, width: 17, height: 17, borderRadius: '50%',
                                border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: st.completed ? 'var(--blue)' : 'var(--text-3)', transition: 'color .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--blue)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = st.completed ? 'var(--blue)' : 'var(--text-3)' }}>
                        {st.completed
                          ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>}
                      </button>

                      {/* Title — click to edit inline */}
                      {editingIdx === i ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingVal}
                          onChange={e => setEditingVal(e.target.value)}
                          onBlur={() => {
                            if (editingVal.trim())
                              setSubtasks(p => p.map((s, j) => j === i ? { ...s, title: editingVal.trim() } : s))
                            setEditingIdx(-1)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') { setEditingIdx(-1) }
                          }}
                          style={{
                            flex: 1, fontSize: '0.82rem', border: 'none', outline: 'none',
                            background: 'transparent', color: 'var(--text)', fontFamily: 'inherit',
                            padding: 0,
                          }}
                        />
                      ) : (
                        <span
                          title="Click to edit"
                          onClick={() => { setEditingIdx(i); setEditingVal(st.title) }}
                          style={{
                            flex: 1, fontSize: '0.82rem', cursor: 'text',
                            color: st.completed ? 'var(--text-3)' : 'var(--text)',
                            textDecoration: st.completed ? 'line-through' : 'none',
                          }}>
                          {st.title}
                        </span>
                      )}

                      {/* Delete */}
                      <button type="button"
                              onClick={() => setSubtasks(p => p.filter((_, j) => j !== i))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 7 }}>
                <input
                  ref={subtaskInputRef}
                  type="text"
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const t = newSubtask.trim()
                      if (t && subtasks.length < 20) {
                        setSubtasks(p => [...p, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: t, completed: false }])
                        setNewSubtask('')
                      }
                    }
                  }}
                  placeholder="Add a step…"
                  className="field"
                  style={{ flex: 1, padding: '7px 10px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = newSubtask.trim()
                    if (t && subtasks.length < 20) {
                      setSubtasks(p => [...p, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: t, completed: false }])
                      setNewSubtask('')
                      subtaskInputRef.current?.focus()
                    }
                  }}
                  style={{
                    padding: '7px 12px', borderRadius: 9, border: 'none',
                    background: 'var(--blue)', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              {subtasks.length >= 20 && (
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>Maximum 20 subtasks reached.</p>
              )}
            </div>
          )}

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button type="button" onClick={handleClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>{isCanvas ? 'Save' : isEdit ? 'Save Changes' : 'Add Task'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
