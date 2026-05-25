'use client'

/**
 * Inline Canvas section for the sidebar.
 * Shows Canvas API assignment sync controls (course toggles, connect CTA).
 * Class schedule lives in the separate SidebarScheduleSection component.
 *
 * Props:
 *   onOpenSettings          — open Canvas settings modal
 *   onSync                  — trigger a Canvas API sync
 *   syncing                 — bool
 *   canvasCalPrefs          — { showOnCalendar: bool, coursesEnabled: { [courseId]: bool } }
 *   onToggleCanvasOnCalendar — () => void — flip global show-on-calendar
 *   onToggleCourseOnCalendar — (courseId, enabled) => void — flip one course
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Settings2, RefreshCw, BookOpen, CalendarDays } from 'lucide-react'
import { CanvasLogo } from '@/components/CanvasSettingsModal'

export default function SidebarCanvasSection({
  onOpenSettings,
  onSync,
  syncing,
  canvasCalPrefs,
  onToggleCanvasOnCalendar,
  onToggleCourseOnCalendar,
}) {
  const showOnCalendar = canvasCalPrefs?.showOnCalendar !== false

  const [sectionExpanded, setSectionExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-sidebar-canvas-expanded') ?? 'true') } catch { return true }
  })
  const [coursesExpanded, setCoursesExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-sidebar-canvas-courses-expanded') ?? 'false') } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('lv-sidebar-canvas-expanded', JSON.stringify(sectionExpanded)) } catch {}
  }, [sectionExpanded])
  useEffect(() => {
    try { localStorage.setItem('lv-sidebar-canvas-courses-expanded', JSON.stringify(coursesExpanded)) } catch {}
  }, [coursesExpanded])

  const [connected, setConnected] = useState(false)
  const [courses,   setCourses]   = useState([])
  const [syncPrefs, setSyncPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}') }
    catch { return {} }
  })

  // Persist sync prefs (for API sync filtering only)
  useEffect(() => {
    try {
      const lsPref = JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}')
      localStorage.setItem('lv-canvas-prefs', JSON.stringify({
        ...lsPref,
        coursesEnabled: syncPrefs.coursesEnabled ?? {},
        connected:      syncPrefs.connected,
      }))
    } catch {}
  }, [syncPrefs])

  const loadStatus = useCallback(async () => {
    try {
      const { connected: c } = await fetch('/api/canvas/credential').then(r => r.json())
      setConnected(!!c)
      setSyncPrefs(p => ({ ...p, connected: !!c }))
      if (c) loadCourses()
      else   setCourses([])
    } catch {}
  }, []) // eslint-disable-line

  const loadCourses = useCallback(async () => {
    try {
      const { courses: list, error } = await fetch('/api/canvas/courses').then(r => r.json())
      if (error) return
      setCourses(list ?? [])
      setSyncPrefs(p => {
        const updated = { ...p, coursesEnabled: { ...(p.coursesEnabled ?? {}) } }
        for (const c of list ?? []) {
          if (updated.coursesEnabled[String(c.id)] === undefined) {
            updated.coursesEnabled[String(c.id)] = true
            onToggleCourseOnCalendar?.(c.id, true)
          }
        }
        return updated
      })
    } catch {}
  }, [onToggleCourseOnCalendar])

  useEffect(() => { loadStatus() }, [loadStatus])

  useEffect(() => {
    function onUpdate() { loadStatus() }
    window.addEventListener('canvas-credential-changed', onUpdate)
    return () => window.removeEventListener('canvas-credential-changed', onUpdate)
  }, [loadStatus])

  function toggleCourse(courseId, enabled) {
    setSyncPrefs(p => ({
      ...p,
      coursesEnabled: { ...(p.coursesEnabled ?? {}), [String(courseId)]: enabled },
    }))
    onToggleCourseOnCalendar?.(courseId, enabled)
    setTimeout(() => onSync?.(), 0)
  }

  const isCourseEnabled = (id) => {
    // Use page.js state if available, else fall back to syncPrefs
    if (canvasCalPrefs?.coursesEnabled) return canvasCalPrefs.coursesEnabled[String(id)] !== false
    return syncPrefs.coursesEnabled?.[String(id)] !== false
  }

  return (
    <div style={{ margin: '0 10px 8px', flexShrink: 0 }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: sectionExpanded ? 6 : 0 }}>
        <button
          onClick={() => setSectionExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 7, color: 'rgba(232,117,26,.8)', textAlign: 'left', fontFamily: 'inherit' }}
        >
          {sectionExpanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          <CanvasLogo size={12} />
          <span style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Canvas
          </span>
        </button>

        {/* Show-on-calendar toggle */}
        {connected && (
          <button
            onClick={onToggleCanvasOnCalendar}
            title={showOnCalendar ? 'Hide Canvas from calendar' : 'Show Canvas on calendar'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, display: 'flex', transition: 'color .13s',
              color: showOnCalendar ? 'rgba(232,117,26,.7)' : 'rgba(147,197,253,.25)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = showOnCalendar ? 'rgba(232,117,26,.95)' : 'rgba(147,197,253,.55)'}
            onMouseLeave={e => e.currentTarget.style.color = showOnCalendar ? 'rgba(232,117,26,.7)' : 'rgba(147,197,253,.25)'}
          >
            <CalendarDays size={11} />
          </button>
        )}

        {connected && (
          <button
            onClick={onSync}
            title="Sync Canvas"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(232,117,26,.5)', display: 'flex', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(232,117,26,.9)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,117,26,.5)'}
          >
            <RefreshCw size={11} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Manage Canvas connection"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(232,117,26,.5)', display: 'flex', transition: 'color .13s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(232,117,26,.9)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,117,26,.5)'}
        >
          <Settings2 size={11} />
        </button>
      </div>

      {sectionExpanded && (
        <div>
          <button
            onClick={() => setCoursesExpanded(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', borderRadius: 6, color: 'rgba(147,197,253,.45)', fontFamily: 'inherit', textAlign: 'left' }}
          >
            {coursesExpanded ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
            <BookOpen size={9} />
            <span style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Courses
            </span>
          </button>

          {coursesExpanded && (
            <div style={{ paddingLeft: 12 }}>
              {!connected ? (
                <button
                  onClick={onOpenSettings}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px', background: 'none', border: '1px dashed rgba(232,117,26,.3)', borderRadius: 8, cursor: 'pointer', color: 'rgba(232,117,26,.6)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, transition: 'all .13s', marginTop: 2 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(232,117,26,.6)'; e.currentTarget.style.color = 'rgba(232,117,26,.9)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(232,117,26,.3)'; e.currentTarget.style.color = 'rgba(232,117,26,.6)' }}
                >
                  <CanvasLogo size={11} /> Connect Canvas
                </button>
              ) : courses.length === 0 ? (
                <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,.35)', padding: '2px 4px' }}>No courses found</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
                  {courses.map(course => {
                    const enabled = isCourseEnabled(course.id)
                    return (
                      <div key={course.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 6 }}>
                        <span style={{ flex: 1, fontSize: '0.68rem', color: enabled ? 'rgba(255,255,255,.7)' : 'rgba(147,197,253,.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, transition: 'color .15s' }}>
                          {course.name}
                        </span>
                        <MiniToggle enabled={enabled} onChange={v => toggleCourse(course.id, v)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniToggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: 26, height: 14, borderRadius: 999, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: (enabled && !disabled) ? 'rgba(99,179,237,.8)' : 'rgba(255,255,255,.12)',
        position: 'relative', transition: 'background .18s', flexShrink: 0,
        opacity: disabled ? 0.3 : 1, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: enabled ? 13 : 2,
        width: 10, height: 10, borderRadius: '50%',
        background: '#fff', transition: 'left .18s',
        display: 'block',
      }} />
    </button>
  )
}
