'use client'

import { useState, useEffect } from 'react'
import { X, GraduationCap } from 'lucide-react'
import TimePicker from '@/components/TimePicker'
import { EXAM_COLOR } from '@/lib/classInstances'

/**
 * Turn one meeting of a recurring class into an exam block.
 *
 * Everything here is prefilled from the period being replaced, and everything is
 * optional. Most exams sit in the normal slot in the normal room — the common path is
 * to check the title and press the button — but a midterm that runs long or moves to a
 * hall is common enough that retyping the whole thing as a separate event would be the
 * wrong ask.
 *
 * Anything left at its prefilled value is stored as *absent* rather than as a copy, so
 * the exam keeps following the class: move the period to 10:00 next month and an exam
 * that never named a time moves with it. See setExamInstance.
 */
export default function ExamBlockModal({ meeting, defaults = {}, onConfirm, onClose }) {
  const [title,    setTitle]    = useState(defaults.title ?? `${meeting?.courseName || meeting?.title || 'Class'} — Exam`)
  const [start,    setStart]    = useState(defaults.startTime ?? meeting?.startTime ?? '')
  const [end,      setEnd]      = useState(defaults.endTime   ?? meeting?.endTime   ?? '')
  const [location, setLocation] = useState(defaults.location  ?? meeting?.location  ?? '')
  const [note,     setNote]     = useState(defaults.note ?? '')
  const [error,    setError]    = useState('')
  const [closing,  setClosing]  = useState(false)

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e) {
    e.preventDefault()
    if (start && end && start >= end) { setError('End time must be after the start time.'); return }
    setError('')
    /* Unchanged fields are sent as undefined, not as the value they were prefilled
       with. Storing "09:00" because that is what the class happens to run at today
       would silently pin the exam to a time the user never chose. */
    onConfirm({
      title:     title.trim() || undefined,
      startTime: start    && start    !== meeting?.startTime ? start    : undefined,
      endTime:   end      && end      !== meeting?.endTime   ? end      : undefined,
      location:  location.trim() && location.trim() !== meeting?.location ? location.trim() : undefined,
      note:      note.trim() || undefined,
    })
    handleClose()
  }

  const dateLabel = meeting?.dateLabel || ''

  return (
    <div className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
         style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
         onClick={handleClose}>
      <div className={`modal-surface w-full max-w-sm overflow-hidden${closing ? ' modal-closing' : ''}`}
           onClick={e => e.stopPropagation()}>

        <div style={{ height: 4, background: EXAM_COLOR }} />

        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={16} style={{ color: EXAM_COLOR }} /> Make this an exam
          </h2>
          <button onClick={handleClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {dateLabel && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
              Replaces the {meeting?.courseName || 'class'} period on <strong style={{ color: 'var(--text-2)' }}>{dateLabel}</strong>.
              The rest of the term is untouched, and you can turn it back at any time.
            </p>
          )}

          <div>
            <label className="field-label">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="e.g. Midterm 1" autoFocus className="field" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Start</label>
              <TimePicker value={start} onChange={setStart} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">End</label>
              <TimePicker value={end} onChange={setEnd} />
            </div>
          </div>
          <p style={{ margin: '-4px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>
            Left as they are, the exam keeps whatever hours the class period has.
          </p>

          <div>
            <label className="field-label">Room</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                   placeholder="Same as the usual room" className="field" />
          </div>

          <div>
            <label className="field-label">Notes <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-3)' }}>(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                      placeholder="e.g. Chapters 1–5, calculator allowed" className="field" style={{ resize: 'vertical' }} />
          </div>

          {error && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--red)' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleClose}
                    style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
                    style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: EXAM_COLOR, color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
              Make it an exam
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
