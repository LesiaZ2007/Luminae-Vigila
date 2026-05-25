'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, RefreshCw, EyeOff } from 'lucide-react'
import TimePicker  from '@/components/TimePicker'
import Select      from '@/components/Select'
import DatePicker  from '@/components/DatePicker'

const REMINDER_OPTIONS = [
  { label: 'No reminder',   ms: 0 },
  { label: '15 min before', ms: 15 * 60_000 },
  { label: '30 min before', ms: 30 * 60_000 },
  { label: '1 hr before',   ms: 60 * 60_000 },
  { label: '2 hrs before',  ms: 2 * 60 * 60_000 },
  { label: '1 day before',  ms: 24 * 60 * 60_000 },
  { label: 'Custom time…',  ms: -1 },
]

const DAYS = ['S','M','T','W','T','F','S']

function toHHMM(date) {
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
}

function initState(event, initialDate, categories) {
  if (event) {
    const s    = event.start instanceof Date ? event.start : new Date(event.start || Date.now())
    const eRaw = event.end instanceof Date
      ? event.end
      : (event.end ? new Date(event.end) : new Date(s.getTime() + 3600_000))
    const aDay = event.allDay || false
    // FullCalendar stores allDay end as exclusive next-day; show inclusive
    const eDisplay = aDay ? new Date(eRaw.getTime() - 86400_000) : eRaw
    return {
      title:     event.title || '',
      category:  event.extendedProps?.category || categories[0].id,
      allDay:    aDay,
      date:      s.toISOString().slice(0, 10),
      endDate:   aDay ? eDisplay.toISOString().slice(0, 10) : '',
      startTime: aDay ? '09:00' : toHHMM(s),
      endTime:   aDay ? '10:00' : toHHMM(eRaw),
      reminderMs: event.reminder?.ms ?? 0,
      repeats:   false,
      repeatType: 'weekly',
      repeatDays: [s.getDay()],
      repeatUntil: '',
      notes: event.extendedProps?.notes || '',
    }
  }

  const base   = initialDate || new Date().toISOString()
  const d      = new Date(base)
  const hasTime = base.length > 10
  return {
    title: '', category: categories[0].id, allDay: false,
    date:    d.toISOString().slice(0, 10),
    endDate: '',
    startTime: hasTime ? toHHMM(d) : '09:00',
    endTime:   hasTime ? toHHMM(new Date(d.getTime() + 3600_000)) : '10:00',
    reminderMs: 0,
    repeats:    false,
    repeatType: 'weekly',
    repeatDays: [d.getDay()],
    repeatUntil: '',
    notes: '',
  }
}

export default function EventModal({ event, initialDate, categories, onSave, onDelete, onHide, onClose }) {
  const isEdit = !!event
  const init   = initState(event, initialDate, categories)

  const [title,       setTitle]       = useState(init.title)
  const [category,    setCategory]    = useState(init.category)
  const [allDay,      setAllDay]      = useState(init.allDay)
  const [date,        setDate]        = useState(init.date)
  const [endDate,     setEndDate]     = useState(init.endDate)
  const [startTime,   setStartTime]   = useState(init.startTime)
  const [endTime,     setEndTime]     = useState(init.endTime)
  const [reminderMs,  setReminderMs]  = useState(init.reminderMs)
  const [repeats,     setRepeats]     = useState(init.repeats)
  const [repeatType,  setRepeatType]  = useState(init.repeatType)
  const [repeatDays,  setRepeatDays]  = useState(init.repeatDays)
  const [repeatUntil, setRepeatUntil] = useState(init.repeatUntil)
  const [notes,        setNotes]        = useState(init.notes)
  const [customReminderAt, setCustomReminderAt] = useState('')
  const [error,         setError]         = useState('')
  const [closing,       setClosing]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const cat = categories.find(c => c.id === category) || categories[0]

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 180)
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggleDay(i) {
    setRepeatDays(prev =>
      prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setError('Please enter a title.'); return }
    if (!allDay && startTime >= endTime) { setError('End time must be after start time.'); return }
    if (repeats && !repeatUntil) { setError('Please set a repeat end date.'); return }
    if (repeats && repeatType === 'custom' && repeatDays.length === 0) {
      setError('Select at least one day.'); return
    }

    const startISO = allDay ? date : `${date}T${startTime}:00`
    // allDay end is exclusive in FullCalendar → add 1 day to the inclusive endDate
    const endISO = allDay
      ? (() => { const d = new Date((endDate || date) + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10) })()
      : `${date}T${endTime}:00`
    const reminderOpt = REMINDER_OPTIONS.find(r => r.ms === reminderMs)
    let reminderObj = null
    if (reminderMs === -1 && customReminderAt) {
      reminderObj = { at: customReminderAt, label: 'Custom reminder', ms: 0 }
    } else if (reminderMs > 0) {
      reminderObj = { ms: reminderMs, label: reminderOpt?.label || '' }
    }

    onSave({
      ...(isEdit ? { id: event.id } : {}),
      title:    title.trim(),
      start:    startISO,
      end:      endISO,
      allDay,
      color:    cat.color,
      extendedProps: { category, notes: notes.trim() || null },
      reminder: reminderObj,
      recurrence: repeats
        ? { type: repeatType, days: repeatType === 'custom' ? repeatDays : [new Date(date).getDay()], until: repeatUntil }
        : null,
    })
    handleClose()
  }

  function handleDelete() {
    setConfirmDelete(true)
  }

  function commitDelete(deleteAll) {
    const groupId = event.extendedProps?.recurrenceGroupId
    onDelete(event.id, groupId, deleteAll)
    handleClose()
  }

  function handleHide() {
    onHide?.(event.id)
    handleClose()
  }

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
         style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
         onClick={handleClose}>
      <div className={`modal-surface w-full max-w-md overflow-hidden${closing ? ' modal-closing' : ''}`}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Event' : 'New Event'}</h2>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {isEdit && (
              <button onClick={handleHide} title="Hide event"
                      style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', transition: 'color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                <EyeOff size={15} />
              </button>
            )}
            {isEdit && (
              <button onClick={handleDelete} title="Delete event"
                      style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', transition: 'color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={handleClose}
                    style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="modal-body">

          {/* Title */}
          <div>
            <label className="field-label">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="e.g. CS101 Lecture" autoFocus className="field" />
          </div>

          {/* Category */}
          <div>
            <label className="field-label">Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categories.map(c => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 14px', borderRadius: '999px',
                          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'inherit', transition: 'all 0.13s',
                          border: category === c.id ? `1.5px solid ${c.color}` : '1.5px solid transparent',
                          background: category === c.id ? c.color + '22' : 'var(--surface2)',
                          color: category === c.id ? c.color : 'var(--text-2)',
                        }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* All day */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" className="toggle" data-on={String(allDay)} onClick={() => setAllDay(v => !v)}>
              <span className="toggle-knob" />
            </button>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)' }}>All day / multi-day</span>
          </div>

          {/* Date */}
          {allDay ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="field-label">Start Date</label>
                <DatePicker value={date} onChange={setDate} />
              </div>
              <div>
                <label className="field-label">End Date</label>
                <DatePicker value={endDate || date} onChange={setEndDate} min={date} />
              </div>
            </div>
          ) : (
            <div>
              <label className="field-label">Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          )}

          {/* Time */}
          {!allDay && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="field-label">Start</label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="field-label">End</label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>
          )}

          {/* Reminder */}
          <div>
            <label className="field-label">Reminder</label>
            <Select value={reminderMs} onChange={v => setReminderMs(Number(v))}
                    options={REMINDER_OPTIONS.map(r => ({ value: r.ms, label: r.label }))} />
            {reminderMs === -1 && (
              <div style={{ marginTop: 8 }}>
                <label className="field-label">Remind me at</label>
                <input type="datetime-local" value={customReminderAt}
                       onChange={e => setCustomReminderAt(e.target.value)} className="field" />
              </div>
            )}
          </div>

          {/* Repeat */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: repeats ? '12px' : 0 }}>
              <button type="button" className="toggle" data-on={String(repeats)} onClick={() => setRepeats(v => !v)}>
                <span className="toggle-knob" />
              </button>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={13} style={{ color: 'var(--text-3)' }} /> Repeats
              </span>
            </div>

            {repeats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Type chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[['daily','Daily'],['weekly','Weekly'],['biweekly','Every 2 wks'],['monthly','Monthly'],['custom','Custom days']].map(([id, lbl]) => (
                    <button key={id} type="button" onClick={() => setRepeatType(id)}
                            style={{
                              padding: '6px 14px', borderRadius: '999px',
                              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'inherit', transition: 'all 0.13s',
                              border: repeatType === id ? `1.5px solid var(--blue)` : '1.5px solid transparent',
                              background: repeatType === id ? 'var(--blue-bg)' : 'var(--surface2)',
                              color: repeatType === id ? 'var(--blue-text)' : 'var(--text-2)',
                            }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Day checkboxes for custom */}
                {repeatType === 'custom' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {DAYS.map((d, i) => (
                      <button key={i} type="button" onClick={() => toggleDay(i)}
                              style={{
                                width: 34, height: 34, borderRadius: '50%',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'inherit', border: 'none', transition: 'all 0.13s',
                                background: repeatDays.includes(i) ? 'var(--blue)' : 'var(--surface2)',
                                color: repeatDays.includes(i) ? '#fff' : 'var(--text-2)',
                              }}>
                        {d}
                      </button>
                    ))}
                  </div>
                )}

                {/* Until */}
                <div>
                  <label className="field-label">Repeat until</label>
                  <DatePicker value={repeatUntil} onChange={setRepeatUntil} min={date} />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Any details, location, links…" rows={2} className="field" />
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          {/* Delete confirmation panel */}
          {confirmDelete && (
            <div style={{
              borderRadius: 12, border: '1px solid var(--red, #ef4444)',
              background: 'rgba(239,68,68,0.07)', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                {event?.extendedProps?.recurrenceGroupId
                  ? 'Delete recurring event'
                  : `Delete "${title}"?`}
              </p>
              {event?.extendedProps?.recurrenceGroupId && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-2)' }}>
                  This is part of a repeating series. Which events should be deleted?
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {event?.extendedProps?.recurrenceGroupId ? (<>
                  <button type="button" onClick={() => commitDelete(false)}
                          style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    This event only
                  </button>
                  <button type="button" onClick={() => commitDelete(true)}
                          style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    All in series
                  </button>
                </>) : (
                  <button type="button" onClick={() => commitDelete(false)}
                          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setConfirmDelete(false)}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!confirmDelete && (
            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
              <button type="button" onClick={handleClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, background: cat.color }}>
                {isEdit ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
