'use client'

/**
 * Full-page modal for managing Canvas LMS connection.
 * Handles: connect (token + base URL), disconnect, per-course sync toggles.
 * Mirrors the style of GoogleCalendarSettings.js.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, ExternalLink, BookOpen } from 'lucide-react'
import { COURSE_PALETTE, getCourseColor } from '@/components/CoursesPanel'

// Inline Canvas "C" logo
export function CanvasLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#E8751A"/>
      <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold" fontFamily="serif">C</text>
    </svg>
  )
}

export default function CanvasSettingsModal({ onClose, onSync, onColorsChange }) {
  const [connected,    setConnected]    = useState(false)
  const [baseUrl,      setBaseUrl]      = useState('')
  const [token,        setToken]        = useState('')
  const [inputUrl,     setInputUrl]     = useState('')
  const [inputToken,   setInputToken]   = useState('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [courses,      setCourses]      = useState([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [closing,      setClosing]      = useState(false)
  const [syncing,      setSyncing]      = useState(false)
  const [colorPickerFor, setColorPickerFor] = useState(null) // courseId with open color picker
  const [prefs,        setPrefs]        = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}') }
    catch { return {} }
  })

  function handleClose() { setClosing(true); setTimeout(onClose, 180) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line

  // Persist prefs whenever they change
  useEffect(() => {
    localStorage.setItem('lv-canvas-prefs', JSON.stringify(prefs))
  }, [prefs])

  // Load connection status on mount
  useEffect(() => {
    fetch('/api/canvas/credential')
      .then(r => r.json())
      .then(d => {
        setConnected(d.connected)
        setBaseUrl(d.baseUrl ?? '')
        setInputUrl(d.baseUrl ?? '')
        if (d.connected) {
          setPrefs(p => ({ ...p, connected: true }))
          loadCourses()
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true)
    try {
      const { courses: list, error } = await fetch('/api/canvas/courses').then(r => r.json())
      if (error) { setCourses([]); return }
      setCourses(list ?? [])
      // Seed prefs: new courses default to enabled
      setPrefs(p => {
        const updated = { ...p }
        updated.coursesEnabled = { ...updated.coursesEnabled }
        for (const c of list ?? []) {
          if (updated.coursesEnabled[c.id] === undefined) {
            updated.coursesEnabled[c.id] = true
          }
        }
        return updated
      })
    } catch { setCourses([]) }
    finally { setCoursesLoading(false) }
  }, [])

  function setCourseColor(courseId, color) {
    setPrefs(p => {
      const updated = { ...p, courseColors: { ...(p.courseColors ?? {}), [courseId]: color } }
      localStorage.setItem('lv-canvas-prefs', JSON.stringify(updated))
      onColorsChange?.(updated.courseColors)
      return updated
    })
    setColorPickerFor(null)
  }

  async function handleConnect(e) {
    e.preventDefault()
    if (!inputUrl.trim() || !inputToken.trim()) {
      setSaveError('Both fields are required.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const res  = await fetch('/api/canvas/credential', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: inputToken.trim(), baseUrl: inputUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSaveError(data.error || 'Connection failed.')
        return
      }
      setConnected(true)
      setBaseUrl(inputUrl.trim().replace(/\/+$/, ''))
      setDisplayName(data.displayName)
      setPrefs(p => ({ ...p, connected: true }))
      setInputToken('')
      loadCourses()
      // Trigger a sync
      onSync?.()
    } catch (err) {
      setSaveError(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Canvas? Your synced assignments will be removed from the app.')) return
    try {
      await fetch('/api/canvas/credential', { method: 'DELETE' })
      setConnected(false)
      setCourses([])
      setDisplayName('')
      setPrefs(p => ({ ...p, connected: false, coursesEnabled: {} }))
      localStorage.removeItem('lv-canvas-assignments')
      localStorage.removeItem('lv-canvas-cal-events')
    } catch { /* ignore */ }
  }

  function toggleCourse(courseId, enabled) {
    setPrefs(p => ({
      ...p,
      coursesEnabled: { ...(p.coursesEnabled ?? {}), [courseId]: enabled },
    }))
  }

  async function handleSync() {
    setSyncing(true)
    await onSync?.()
    setSyncing(false)
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 modal-backdrop${closing ? ' modal-closing' : ''}`}
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className={`modal-surface w-full overflow-hidden${closing ? ' modal-closing' : ''}`}
        style={{ maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CanvasLogo size={18} />
            <h2>Canvas LMS</h2>
          </div>
          <button onClick={handleClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">

          {/* ── Connected state ── */}
          {connected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)' }}>
                <span style={{ fontSize: '0.9rem' }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>Connected to Canvas</div>
                  {displayName && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{displayName}</div>}
                  {baseUrl && <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseUrl}</div>}
                </div>
                <button
                  type="button" onClick={handleSync}
                  title="Sync assignments now"
                  style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <RefreshCw size={12} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
                  Sync
                </button>
              </div>

              {/* Courses */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label className="field-label" style={{ marginBottom: 0 }}>Your Courses</label>
                  <button
                    type="button" onClick={loadCourses}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6 }}
                  >
                    <RefreshCw size={11} style={{ animation: coursesLoading ? 'gc-spin 1s linear infinite' : 'none' }} />
                  </button>
                </div>
                {coursesLoading ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', padding: '8px 0' }}>Loading courses…</div>
                ) : courses.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', padding: '8px 0' }}>No active courses found. Are you enrolled as a student?</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {courses.map(course => {
                      const enabled    = prefs.coursesEnabled?.[course.id] !== false
                      const courseColor = getCourseColor(course.id, prefs.courseColors)
                      const pickerOpen = colorPickerFor === course.id
                      return (
                        <div key={course.id} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                            {/* Color swatch button */}
                            <button
                              type="button"
                              onClick={() => setColorPickerFor(pickerOpen ? null : course.id)}
                              title="Pick course color"
                              style={{ width: 18, height: 18, borderRadius: '50%', background: courseColor, border: pickerOpen ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flexShrink: 0, transition: 'border-color .13s' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: enabled ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color .15s' }}>
                                {course.name}
                              </div>
                              {course.courseCode && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{course.courseCode}</div>
                              )}
                            </div>
                            <CourseToggle enabled={enabled} onChange={v => toggleCourse(course.id, v)} />
                          </div>

                          {/* Inline color picker */}
                          {pickerOpen && (
                            <div style={{ padding: '6px 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid var(--border)' }}>
                              {COURSE_PALETTE.map(hex => (
                                <button
                                  key={hex} type="button"
                                  onClick={() => setCourseColor(course.id, hex)}
                                  title={hex}
                                  style={{
                                    width: 22, height: 22, borderRadius: '50%', background: hex,
                                    border: courseColor === hex ? '2px solid var(--text)' : '2px solid transparent',
                                    cursor: 'pointer', transition: 'border-color .13s', padding: 0,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Disconnect */}
              <button
                type="button" onClick={handleDisconnect}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.06)', color: 'var(--red)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all .13s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.5)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,.06)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.3)' }}
              >
                Disconnect Canvas
              </button>
            </>
          ) : (
            /* ── Not connected state ── */
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                Connect your Canvas account to sync assignments, due dates, and course events. Uses a personal access token — no institution approval needed.
              </p>

              {/* How to get a token */}
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)' }}>How to get your token:</strong>
                <ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <li>Log in to Canvas → click your name (top right)</li>
                  <li>Go to <strong>Account → Settings</strong></li>
                  <li>Scroll to <strong>Approved Integrations</strong></li>
                  <li>Click <strong>+ New Access Token</strong>, set a purpose &amp; optional expiry</li>
                  <li>Copy the token — it only shows once!</li>
                </ol>
              </div>

              <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="field-label">
                    Canvas URL{' '}
                    <a
                      href="https://community.canvaslms.com/t5/Canvas-Basics-Guide/What-is-the-URL-for-my-Canvas-instance/ta-p/402312"
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'none', letterSpacing: 0 }}
                    >
                      find yours <ExternalLink size={10} />
                    </a>
                  </label>
                  <input
                    type="url" value={inputUrl} onChange={e => setInputUrl(e.target.value)}
                    placeholder="https://myschool.instructure.com"
                    className="field" autoFocus
                  />
                </div>

                <div>
                  <label className="field-label">Access Token</label>
                  <input
                    type="password" value={inputToken} onChange={e => setInputToken(e.target.value)}
                    placeholder="Paste your token here"
                    className="field"
                  />
                </div>

                {saveError && <p style={{ color: 'var(--red)', fontSize: '0.78rem', margin: 0 }}>{saveError}</p>}

                <button
                  type="submit" disabled={saving}
                  className="btn-primary"
                  style={{ opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Connecting…' : 'Connect Canvas'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CourseToggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      style={{
        width: 34, height: 18, borderRadius: 999, border: 'none',
        cursor: 'pointer',
        background: enabled ? 'rgba(99,179,237,.8)' : 'rgba(255,255,255,.12)',
        position: 'relative', transition: 'background .18s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: enabled ? 17 : 3,
        width: 12, height: 12, borderRadius: '50%',
        background: '#fff', transition: 'left .18s',
        display: 'block',
      }} />
    </button>
  )
}
