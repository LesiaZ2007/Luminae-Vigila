'use client'

/**
 * Inline Canvas section for the sidebar.
 * Two sub-sections:
 *  1. Canvas API courses (requires connected token) — per-course assignment sync toggles
 *  2. Class Schedule (standalone, no token needed) — list + add/edit class times
 *
 * Props: { onOpenSettings, onSync, syncing, canvasClasses, onAddClass, onEditClass }
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Settings2, RefreshCw, Plus, CalendarDays, BookOpen } from 'lucide-react'
import { CanvasLogo } from '@/components/CanvasSettingsModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${m > 0 ? `:${String(m).padStart(2,'0')}` : ''}${period}`
}

function classDaysLabel(days) {
  if (!days?.length) return ''
  const abbr = 'SMTWTFS'
  if (days.length <= 4) return days.map(d => abbr[d]).join('')
  return days.map(d => DAY_NAMES[d].slice(0, 2)).join(', ')
}

export default function SidebarCanvasSection({ onOpenSettings, onSync, syncing, canvasClasses = [], onAddClass, onEditClass }) {
  const [sectionExpanded,  setSectionExpanded]  = useState(true)
  const [coursesExpanded,  setCoursesExpanded]  = useState(true)
  const [scheduleExpanded, setScheduleExpanded] = useState(true)

  const [connected,  setConnected]  = useState(false)
  const [courses,    setCourses]    = useState([])
  const [prefs,      setPrefs]      = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-canvas-prefs') ?? '{}') }
    catch { return {} }
  })

  // Persist prefs
  useEffect(() => {
    localStorage.setItem('lv-canvas-prefs', JSON.stringify(prefs))
  }, [prefs])

  const loadStatus = useCallback(async () => {
    try {
      const { connected: c, baseUrl } = await fetch('/api/canvas/credential').then(r => r.json())
      setConnected(!!c)
      if (c) loadCourses()
      else   setCourses([])
    } catch {}
  }, []) // eslint-disable-line

  const loadCourses = useCallback(async () => {
    try {
      const { courses: list, error } = await fetch('/api/canvas/courses').then(r => r.json())
      if (error) return
      setCourses(list ?? [])
      setPrefs(p => {
        const updated = { ...p, coursesEnabled: { ...(p.coursesEnabled ?? {}) } }
        for (const c of list ?? []) {
          if (updated.coursesEnabled[c.id] === undefined) updated.coursesEnabled[c.id] = true
        }
        return updated
      })
    } catch {}
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Re-check when settings modal dispatches canvas-credential-changed
  useEffect(() => {
    function onUpdate() { loadStatus() }
    window.addEventListener('canvas-credential-changed', onUpdate)
    return () => window.removeEventListener('canvas-credential-changed', onUpdate)
  }, [loadStatus])

  function toggleCourse(courseId, enabled) {
    setPrefs(p => ({
      ...p,
      coursesEnabled: { ...(p.coursesEnabled ?? {}), [courseId]: enabled },
    }))
    setTimeout(() => onSync?.(), 0)
  }

  const isCourseEnabled = (id) => prefs.coursesEnabled?.[id] !== false

  // How many active (enabled) classes in the schedule
  const activeClasses = canvasClasses.filter(c => c.enabled !== false).length

  return (
    <div style={{ margin: '0 10px 8px', flexShrink: 0 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: sectionExpanded ? 6 : 0 }}>
        <button
          onClick={() => setSectionExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 7, color: 'rgba(230,96,0,.65)', textAlign: 'left', fontFamily: 'inherit' }}
        >
          {sectionExpanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          <CanvasLogo size={12} />
          <span style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Canvas
          </span>
        </button>

        {connected && (
          <button
            onClick={onSync}
            title="Sync Canvas"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(230,96,0,.4)', display: 'flex', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(230,96,0,.8)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(230,96,0,.4)'}
          >
            <RefreshCw size={11} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Manage Canvas connection"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(230,96,0,.4)', display: 'flex', transition: 'color .13s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(230,96,0,.8)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(230,96,0,.4)'}
        >
          <Settings2 size={11} />
        </button>
      </div>

      {sectionExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* ── Canvas API section (courses) ── */}
          <div>
            <button
              onClick={() => setCoursesExpanded(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', borderRadius: 6, color: 'rgba(147,197,253,.45)', fontFamily: 'inherit', textAlign: 'left' }}
            >
              {coursesExpanded ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
              <BookOpen size={9} />
              <span style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Assignments
              </span>
            </button>

            {coursesExpanded && (
              <div style={{ paddingLeft: 12 }}>
                {!connected ? (
                  <button
                    onClick={onOpenSettings}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px', background: 'none', border: '1px dashed rgba(230,96,0,.25)', borderRadius: 8, cursor: 'pointer', color: 'rgba(230,96,0,.45)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, transition: 'all .13s', marginTop: 2 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(230,96,0,.5)'; e.currentTarget.style.color = 'rgba(230,96,0,.8)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(230,96,0,.25)'; e.currentTarget.style.color = 'rgba(230,96,0,.45)' }}
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

          {/* ── Class Schedule section ── */}
          <div style={{ marginTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setScheduleExpanded(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', borderRadius: 6, color: 'rgba(147,197,253,.45)', fontFamily: 'inherit', textAlign: 'left' }}
              >
                {scheduleExpanded ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
                <CalendarDays size={9} />
                <span style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Schedule
                  {activeClasses > 0 && <span style={{ marginLeft: 4, fontSize: '0.6rem', opacity: 0.6 }}>· {activeClasses}</span>}
                </span>
              </button>
              <button
                onClick={onAddClass}
                title="Add class"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(147,197,253,.4)', display: 'flex', transition: 'color .13s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.8)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.4)'}
              >
                <Plus size={11} />
              </button>
            </div>

            {scheduleExpanded && (
              <div style={{ paddingLeft: 12, marginTop: 2 }}>
                {canvasClasses.length === 0 ? (
                  <button
                    onClick={onAddClass}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px', background: 'none', border: '1px dashed rgba(147,197,253,.18)', borderRadius: 8, cursor: 'pointer', color: 'rgba(147,197,253,.38)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, transition: 'all .13s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(147,197,253,.4)'; e.currentTarget.style.color = 'rgba(147,197,253,.7)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(147,197,253,.18)'; e.currentTarget.style.color = 'rgba(147,197,253,.38)' }}
                  >
                    <Plus size={11} /> Add class schedule
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {canvasClasses.map(cls => (
                      <ClassChip key={cls.id} cls={cls} onEdit={() => onEditClass?.(cls)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

function ClassChip({ cls, onEdit }) {
  const [hovered, setHovered] = useState(false)
  const enabled = cls.enabled !== false
  const daysStr = classDaysLabel(cls.days)
  const timeStr = fmtTime(cls.startTime)

  return (
    <div
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 7,
        background: hovered ? 'rgba(255,255,255,.06)' : 'transparent',
        cursor: 'pointer', transition: 'background .13s',
        opacity: enabled ? 1 : 0.4,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cls.color ?? '#3a6fa8', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {cls.courseName}
      </span>
      <span style={{ fontSize: '0.6rem', color: 'rgba(147,197,253,.45)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {daysStr} {timeStr}
      </span>
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
