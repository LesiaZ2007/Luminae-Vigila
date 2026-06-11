'use client'

/**
 * StudyPlanModal — shown after saving an exam event.
 * Offers to auto-schedule spaced study sessions before the exam.
 *
 * Algorithm:
 *  - For N sessions, place them at evenly-spaced days before the exam
 *    (e.g. 3 sessions → 5, 3, 1 days out; 2 → 3, 1; 5 → 9,7,5,3,1; etc.)
 *  - Each session lands in the 16:00–21:00 window on its target day.
 *  - Overlap is checked against existing events + class schedule; the
 *    least-conflicting slot in that window is chosen (first free slot, or
 *    the one with fewest overlaps as fallback).
 *  - Sessions created before today are skipped silently.
 */

import { useState } from 'react'
import { X, BookOpen, Sparkles } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return a YYYY-MM-DD string for a date shifted by `days` days. */
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Today's YYYY-MM-DD (local time). */
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/**
 * For `count` sessions spread before `examDateStr`, return an array of
 * target date strings (ascending chronological order), skipping days ≤ today.
 *
 * Spacing formula: place sessions at days [1, 3, 5, 7, … (2n-1)] before the exam,
 * capped at one session per day, most-recent-first then reversed to ascending.
 */
function computeSessionDates(examDateStr, count) {
  const today = todayStr()
  const results = []
  for (let i = 0; i < count; i++) {
    // day offsets: 1, 3, 5, 7, ... (odd numbers, closest first)
    const daysOut = 1 + i * 2
    const date = shiftDate(examDateStr, -daysOut)
    if (date > today) results.unshift(date) // build in ascending order
  }
  return results
}

/**
 * Find a start time (HH:MM) in the 16:00–21:00 window on `dateStr`
 * that minimises overlaps with existing events and class meetings.
 * `sessionMinutes` is the desired session length.
 * Returns the best HH:MM slot.
 */
function findBestSlot(dateStr, sessionMinutes, existingEvents, canvasClasses) {
  const candidates = []
  for (let h = 16; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const endH = Math.floor((h * 60 + m + sessionMinutes) / 60)
      const endM = (h * 60 + m + sessionMinutes) % 60
      if (endH > 21) continue // session must end by 21:00
      candidates.push({
        start: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
        end:   `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`,
      })
    }
  }
  if (candidates.length === 0) return '16:00'

  function countOverlaps(slotStart, slotEnd) {
    const sStart = new Date(`${dateStr}T${slotStart}:00`)
    const sEnd   = new Date(`${dateStr}T${slotEnd}:00`)
    let n = 0

    for (const ev of existingEvents) {
      if (ev.allDay || !ev.start) continue
      const evS = new Date(ev.start)
      const evE = ev.end ? new Date(ev.end) : new Date(evS.getTime() + 3600_000)
      const evDate = `${evS.getFullYear()}-${String(evS.getMonth()+1).padStart(2,'0')}-${String(evS.getDate()).padStart(2,'0')}`
      if (evDate !== dateStr) continue
      if (sStart < evE && sEnd > evS) n++
    }

    const dow = new Date(dateStr + 'T12:00:00').getDay()
    for (const cls of canvasClasses) {
      if (cls.enabled === false) continue
      if (!cls.days?.includes(dow)) continue
      if (!cls.startTime || !cls.endTime) continue
      const clsS = new Date(`${dateStr}T${cls.startTime}:00`)
      const clsE = new Date(`${dateStr}T${cls.endTime}:00`)
      if (sStart < clsE && sEnd > clsS) n++
    }

    return n
  }

  let best = candidates[0]
  let bestConflicts = Infinity

  for (const c of candidates) {
    const n = countOverlaps(c.start, c.end)
    if (n < bestConflicts) {
      bestConflicts = n
      best = c
      if (n === 0) break // perfect slot found
    }
  }

  return best.start
}

// ── component ─────────────────────────────────────────────────────────────────

export default function StudyPlanModal({
  examEvent,          // the saved exam event object
  existingEvents,     // all current events (for overlap checks)
  canvasClasses,      // class schedule entries
  onConfirm,          // (sessions: Event[]) => void
  onDismiss,          // () => void
}) {
  const [sessions,      setSessions]      = useState(3)
  const [sessionLength, setSessionLength] = useState(60) // minutes
  const [closing,       setClosing]       = useState(false)

  const examTitle = examEvent?.title || 'Exam'
  const examDate  = examEvent?.start
    ? (examEvent.start.length > 10 ? examEvent.start.slice(0, 10) : examEvent.start)
    : null

  function dismiss() {
    setClosing(true)
    setTimeout(onDismiss, 180)
  }

  function generate() {
    if (!examDate) { dismiss(); return }

    const dates = computeSessionDates(examDate, sessions)
    const created = dates.map((date, i) => {
      const startTime = findBestSlot(date, sessionLength, existingEvents, canvasClasses)
      const startDt   = new Date(`${date}T${startTime}:00`)
      const endDt     = new Date(startDt.getTime() + sessionLength * 60_000)
      const endTime   = `${String(endDt.getHours()).padStart(2,'0')}:${String(endDt.getMinutes()).padStart(2,'0')}`
      return {
        id:    `sp-${examEvent.id}-${i}-${Date.now()}`,
        title: `Study: ${examTitle}`,
        start: `${date}T${startTime}:00`,
        end:   `${date}T${endTime}:00`,
        allDay: false,
        color: '#3a6fa8',  // 'class' category color — calm blue
        extendedProps: {
          category:    'class',
          studyPlanOf: examEvent.id,
          notes:       `Auto-generated study session for "${examTitle}"`,
        },
        reminder: null,
        recurrence: null,
      }
    })

    setClosing(true)
    setTimeout(() => onConfirm(created), 180)
  }

  // Preview the target dates
  const previewDates = examDate ? computeSessionDates(examDate, sessions) : []

  return (
    <div
      className={`fixed inset-0 flex items-end sm:items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
      onClick={dismiss}
    >
      <div
        className={`modal-surface w-full max-w-sm overflow-hidden${closing ? ' modal-closing' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={14} style={{ color: 'var(--blue)' }} />
            </div>
            <h2 style={{ fontSize: '0.95rem' }}>Generate study plan?</h2>
          </div>
          <button onClick={dismiss}
                  style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ gap: 16 }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            Auto-schedule spaced study sessions before <strong style={{ color: 'var(--text)' }}>{examTitle}</strong>.
          </p>

          {/* Sessions count */}
          <div>
            <label className="field-label">Number of sessions</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6].map(n => (
                <button key={n} type="button" onClick={() => setSessions(n)}
                        style={{
                          width: 40, height: 36, borderRadius: 8,
                          border: sessions === n ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                          background: sessions === n ? 'var(--blue-bg)' : 'var(--surface2)',
                          color: sessions === n ? 'var(--blue-text)' : 'var(--text-2)',
                          fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 700,
                          cursor: 'pointer', transition: 'all .13s',
                        }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Session length */}
          <div>
            <label className="field-label">Session length</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[30,45,60,90,120].map(m => (
                <button key={m} type="button" onClick={() => setSessionLength(m)}
                        style={{
                          padding: '6px 12px', borderRadius: 8,
                          border: sessionLength === m ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                          background: sessionLength === m ? 'var(--blue-bg)' : 'var(--surface2)',
                          color: sessionLength === m ? 'var(--blue-text)' : 'var(--text-2)',
                          fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
                          cursor: 'pointer', transition: 'all .13s',
                        }}>
                  {m < 60 ? `${m}m` : m === 60 ? '1h' : `${m/60}h`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewDates.length > 0 ? (
            <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 2 }}>
                Scheduled on
              </div>
              {previewDates.map((d, i) => {
                const dateObj = new Date(d + 'T12:00:00')
                const label   = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                const daysOut = Math.round((new Date(examDate + 'T12:00:00') - dateObj) / 86_400_000)
                return (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginLeft: 'auto' }}>{daysOut} day{daysOut !== 1 ? 's' : ''} before</span>
                  </div>
                )
              })}
              {computeSessionDates(examDate, sessions).length < sessions && (
                <div style={{ fontSize: '0.72rem', color: 'var(--amber)', marginTop: 4 }}>
                  Some sessions skipped — they fall before today.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--amber)', textAlign: 'center', padding: '8px 0' }}>
              No sessions available — exam may be too soon or already passed.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 2 }}>
            <button type="button" onClick={dismiss} className="btn-ghost" style={{ flex: 1 }}>
              Skip
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={previewDates.length === 0}
              className="btn-primary"
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: previewDates.length === 0 ? 0.5 : 1,
                cursor: previewDates.length === 0 ? 'default' : 'pointer',
              }}
            >
              <Sparkles size={13} /> Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
