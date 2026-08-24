'use client'

/**
 * Add / edit a single class schedule entry.
 * Class schedule entries generate recurring calendar events (one per class day)
 * throughout the semester — independently of Canvas API connection.
 */

import { useState, useEffect, useMemo } from 'react'
import { X, Trash2, MapPin, CalendarX, CalendarPlus } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import TimePicker from '@/components/TimePicker'
import Select     from '@/components/Select'
import { describeLocation } from '@/lib/maps'
import { getExceptions, isDateStr } from '@/lib/classInstances'

const DAY_LABELS  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const COLOR_PRESETS = [
  '#3a6fa8','#3b82f6','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#a78bfa',
]

/** Shared style for the small inline Restore / Remove actions. */
const linkBtn = {
  background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
  color: 'var(--blue)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700,
}

/** "Mon, Aug 25" — enough to recognise a date without the year's noise. */
function longDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

/** 24h "14:00" as "2:00 PM". */
function fmt12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  if (!Number.isInteger(h)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

export default function ClassScheduleModal({
  editClass, onSave, onDelete, onClose,
  // One-off exceptions, applied immediately rather than on Save: they are edits to the
  // stored class, not to this form's draft, and mixing the two would mean a cancelled
  // holiday vanished if you closed the form without saving.
  onRestoreMeeting, onRemoveMeeting, onAddMeeting,
}) {
  const isEdit = !!editClass

  const [courseName,     setCourseName]     = useState(editClass?.courseName     || '')
  const [section,        setSection]        = useState(editClass?.section         || '')
  const [professor,      setProfessor]      = useState(editClass?.professor       || '')
  const [location,       setLocation]       = useState(editClass?.location        || '')
  const locationDesc = useMemo(() => describeLocation(location), [location])

  const { cancelled: cancelledDates, added: addedMeetings } = getExceptions(editClass)
  const [extraDate,  setExtraDate]  = useState('')
  const [extraStart, setExtraStart] = useState('14:00')
  const [extraEnd,   setExtraEnd]   = useState('15:00')
  const [extraError, setExtraError] = useState('')

  function handleAddExtra() {
    if (!isDateStr(extraDate))     { setExtraError('Pick a date for the extra meeting.'); return }
    if (extraStart >= extraEnd)    { setExtraError('End time must be after the start time.'); return }
    setExtraError('')
    onAddMeeting?.(editClass.id, { date: extraDate, startTime: extraStart, endTime: extraEnd })
    setExtraDate('')
  }
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

          {/* Location — with a shortcut to the map, so a room you have not walked to
              yet can be checked without leaving the form. Only shown for somewhere
              actually mappable (see lib/maps.js). */}
          <div>
            <label className="field-label">Location <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 204, Tech Hall" className="field" style={{ flex: 1 }} />
              {locationDesc.kind === 'place' && (
                <a href={locationDesc.url} target="_blank" rel="noopener noreferrer"
                   title="Open in Google Maps"
                   style={{
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     padding: '0 12px', borderRadius: 10, flexShrink: 0,
                     border: '1.5px solid var(--border)', background: 'var(--input-bg)',
                     color: 'var(--blue)', transition: 'border-color .13s',
                   }}
                   onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                   onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <MapPin size={15} />
                </a>
              )}
            </div>
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


          {/* One-off exceptions — only for a class that already exists, since they are
              keyed to it. A new class has no dates to make exceptions to yet. */}
          {isEdit && (
            <div>
              <label className="field-label">This term&apos;s exceptions <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>

              {cancelledDates.length === 0 && addedMeetings.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.5 }}>
                  No changes to the usual schedule. Cancel a single class by tapping it on the calendar; add a one-off meeting below.
                </p>
              )}

              {cancelledDates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {cancelledDates.map(d => (
                    <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <CalendarX size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-2)' }}>{longDate(d)} — cancelled</span>
                      <button type="button" onClick={() => onRestoreMeeting?.(editClass.id, d)}
                              style={linkBtn}>Restore</button>
                    </div>
                  ))}
                </div>
              )}

              {addedMeetings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {addedMeetings.map(a => (
                    <div key={a.date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <CalendarPlus size={13} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-2)' }}>
                        {longDate(a.date)} — added, {fmt12(a.startTime)}–{fmt12(a.endTime)}
                      </span>
                      <button type="button" onClick={() => onRemoveMeeting?.(editClass.id, a.date)}
                              style={linkBtn}>Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add a one-off */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                  <DatePicker value={extraDate} onChange={setExtraDate} min={semesterStart} />
                </div>
                <div style={{ flex: '0 0 auto' }}><TimePicker value={extraStart} onChange={setExtraStart} /></div>
                <div style={{ flex: '0 0 auto' }}><TimePicker value={extraEnd}   onChange={setExtraEnd} /></div>
                <button type="button" onClick={handleAddExtra}
                        style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700 }}>
                  Add meeting
                </button>
              </div>
              {extraError && (
                <p style={{ fontSize: '0.75rem', color: 'var(--red)', margin: '6px 0 0' }}>{extraError}</p>
              )}
            </div>
          )}

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
