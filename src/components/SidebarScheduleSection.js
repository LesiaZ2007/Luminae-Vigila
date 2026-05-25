'use client'

/**
 * Standalone class schedule section for the sidebar.
 * Independent of Canvas connectivity — works with or without a Canvas token.
 *
 * Props: { canvasClasses, onAddClass, onEditClass }
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, CalendarDays, Plus } from 'lucide-react'

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

export default function SidebarScheduleSection({ canvasClasses = [], onAddClass, onEditClass }) {
  const [expanded, setExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-sidebar-schedule-expanded') ?? 'false') } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('lv-sidebar-schedule-expanded', JSON.stringify(expanded)) } catch {}
  }, [expanded])

  const activeClasses = canvasClasses.filter(c => c.enabled !== false).length

  return (
    <div style={{ margin: '0 10px 8px', flexShrink: 0 }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 7, color: 'rgba(147,197,253,.55)', textAlign: 'left', fontFamily: 'inherit' }}
        >
          {expanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          <CalendarDays size={12} />
          <span style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Schedule
            {activeClasses > 0 && (
              <span style={{ marginLeft: 5, fontSize: '0.6rem', opacity: 0.55 }}>· {activeClasses}</span>
            )}
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

      {expanded && (
        <div style={{ paddingLeft: 14, marginTop: 2 }}>
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
  )
}
