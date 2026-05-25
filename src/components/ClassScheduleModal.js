'use client'

/**
 * Add / edit a single class schedule entry.
 * Class schedule entries generate recurring calendar events (one per class day)
 * throughout the semester — independently of Canvas API connection.
 */

import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import TimePicker from '@/components/TimePicker'
import Select     from '@/components/Select'

const DAY_LABELS  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const COLOR_PRESETS = [
  '#3a6fa8','#3b82f6','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#a78bfa',
]

export default function ClassScheduleModal({ editClass, onSave, onDelete, onClose }) {
  const isEdit = !!editClass

  const [courseName,     setCourseName]     = useState(editClass?.courseName     || '')
  const [section,        setSection]        = useState(editClass?.section         || '')
  const [professor,      setProfessor]      = useState(editClass?.professor       || '')
  const [location,       setLocation]       = useState(editClass?.location        || '')
  const [days,           setDays]           = useState(editClass?.days            || [1, 3, 5]) // MWF default
  const [startTime,      setStartTime]      = useState(editClass?.startTime       || '09:00')
  const [endTime,        setEndTime]        = useState(editClass?.endTime         || '09:50')
  const [semesterStart,  setSemesterStart]  = useState(editClass?.semesterStart   || '')
  const [semesterEnd,    setSemesterEnd]    = useState(editClass?.semesterEnd     || '')
  const [color,          setColor]          = useState(editClass?.color           || '#3a6fa8')
  const [canvasCourseId, setCanvasCourseId] = useState(editClass?.canvasCourseId  ?? null)
  const [canvasCourses,  setCanvasCourses]  = useState([])   // [{id, name, courseCode}]
  const [error,          setError]          = useState('')
  const [closing,        setClosing]        = useState(false)
  const [showColorPick,  setShowColorPick]  = useState(false)

  // Fetch available Canvas courses (only if Canvas is connected)
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
      if (!prefs.connected) return
    } catch { return }
    fetch('/api/canvas/courses')
      .then(r => r.ok ? r.json() : { courses: [] })
      .then(({ courses }) => setCanvasCourses(courses ?? []))
      .catch(() => {})
  }, [])

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line

  function toggleDay(i) {
    setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort((a, b) => a - b))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!courseName.trim())   { setError('Course name is required.'); return }
    if (days.length === 0)    { setError('Select at least one class day.'); return }
    if (!startTime)           { setError('Start time is required.'); return }
    if (!endTime)             { setError('End time is required.'); return }
    if (!semesterStart)       { setError('Semester start date is required.'); return }
    if (!semesterEnd)         { setError('Semester end date is required.'); return }
    if (semesterEnd <= semesterStart) { setError('Semester end must be after start.'); return }

    const entry = {
      id:             editClass?.id || `cls_${Date.now()}`,
      courseName:     courseName.trim(),
      section:        section.trim()   || null,
      professor:      professor.trim() || null,
      location:       location.trim()  || null,
      days,
      startTime,
      endTime,
      semesterStart,
      semesterEnd,
      color,
      enabled:        editClass?.enabled !== undefined ? editClass.enabled : true,
      canvasCourseId: canvasCourseId || null,
    }
    onSave(entry)
    handleClose()
  }

  // Build a human-readable days string like "MWF" or "Tue, Thu"
  const daysLabel = days.length > 0
    ? days.length <= 3
      ? days.map(d => 'SMTWTFS'[d]).join('')
      : days.map(d => DAY_NAMES[d]).join(', ')
    : 'No days selected'

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={handleClose}
    >
      <div
        className={`modal-surface w-full max-w-sm overflow-hidden${closing ? ' modal-closing' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Class' : 'Add Class'}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {isEdit && (
              <button
                type="button"
                onClick={() => { onDelete(editClass.id); handleClose() }}
                title="Delete this class"
                style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={handleClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">

          {/* Course name */}
          <div>
            <label className="field-label">Course Name</label>
            <input
              type="text" value={courseName} onChange={e => setCourseName(e.target.value)}
              placeholder="e.g. Introduction to Computer Science"
              autoFocus className="field"
            />
          </div>

          {/* Section + Professor in a row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Section <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>
              <input type="text" value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. 001" className="field" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Professor <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>
              <input type="text" value={professor} onChange={e => setProfessor(e.target.value)} placeholder="e.g. Dr. Smith" className="field" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="field-label">Location <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 204, Tech Hall" className="field" />
          </div>

          {/* Canvas Course link (only shown when Canvas is connected) */}
          {canvasCourses.length > 0 && (
            <div>
              <label className="field-label">
                Canvas Course{' '}
                <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span>
              </label>
              <Select
                value={canvasCourseId ?? ''}
                placeholder="— No Canvas link —"
                onChange={v => setCanvasCourseId(v ? Number(v) : null)}
                options={canvasCourses.map(c => ({
                  value: c.id,
                  label: c.courseCode ? `${c.courseCode} – ${c.name}` : c.name,
                }))}
              />
              {canvasCourseId && (
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  Assignments for this course will show up linked to this class.
                </p>
              )}
            </div>
          )}

          {/* Days of week */}
          <div>
            <label className="field-label">Class Days</label>
            <div style={{ display: 'flex', gap: 5 }}>
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i} type="button"
                  onClick={() => toggleDay(i)}
                  style={{
                    flex: 1, aspectRatio: '1', borderRadius: '50%', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.73rem', fontWeight: 700,
                    background: days.includes(i) ? color : 'var(--surface2)',
                    color:      days.includes(i) ? '#fff' : 'var(--text-2)',
                    transition: 'all .13s',
                    opacity:    days.includes(i) ? 1 : 0.7,
                  }}
                >{d}</button>
              ))}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4, fontWeight: 600 }}>
              {daysLabel}
            </div>
          </div>

          {/* Times */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Start Time</label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">End Time</label>
              <TimePicker value={endTime} onChange={setEndTime} />
            </div>
          </div>

          {/* Semester dates */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Semester Start</label>
              <DatePicker value={semesterStart} onChange={setSemesterStart} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Semester End</label>
              <DatePicker value={semesterEnd} onChange={setSemesterEnd} min={semesterStart} />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="field-label">Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLOR_PRESETS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: c,
                    border: color === c ? '3px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', padding: 0, transition: 'transform .1s, border-color .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={handleClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ flex: 1, background: color }}>
              {isEdit ? 'Save Changes' : 'Add Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
