'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import Confetti from '@/components/Confetti'

const SEARCH_TYPES = [
  { id: 'all',    label: 'All'    },
  { id: 'events', label: 'Events' },
  { id: 'tasks',  label: 'Tasks'  },
  { id: 'canvas', label: 'Canvas' },
]

const STATUS_OPTIONS = [
  { id: 'all',      label: 'All'      },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done',     label: 'Done'     },
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86_400_000)
}

function ResultGroup({ title, items, onSelect, onToggleTodo }) {
  if (!items.length) return null
  return (
    <div style={{ borderRadius: 16, background: 'var(--surface)', padding: 16, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{items.length}</div>
      </div>
      <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
        {items.map(item => {
          const isTodo    = item.kind === 'todo'
          const isHidden  = !!item.hidden
          const completed = Boolean(item.item?.completed || (item.item?.completedDates && item.item.completedDates.length > 0))
          const dueDays   = isTodo ? daysUntil(item.item?.dueDate) : null
          const showDueBadge = isTodo && !completed && dueDays >= 1 && dueDays <= 6

          return (
            <div key={`${item.kind}-${item.item?.id || item.label}`}
                 role="button" tabIndex={0}
                 onClick={() => onSelect(item)}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item) } }}
                 style={{ textAlign: 'left', width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(147,197,253,.1)', background: 'rgba(255,255,255,.03)', color: 'var(--text)', cursor: 'pointer', transition: 'background .15s', opacity: isHidden ? 0.45 : 1 }}
                 onMouseEnter={e => e.currentTarget.style.background = 'rgba(147,197,253,.08)'}
                 onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {isTodo && (
                    <button type="button"
                            onClick={e => { e.stopPropagation(); onToggleTodo?.(item.item?.id, item.item?.priority, e) }}
                            style={{
                              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                              border: `2px solid ${completed ? 'var(--blue)' : 'var(--border)'}`,
                              background: completed ? 'var(--blue)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', transition: 'all .2s',
                            }}>
                      {completed && (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  )}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.tagColor || 'rgba(147,197,253,.7)', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: completed ? 'line-through' : 'none', opacity: completed ? 0.5 : 1 }}>
                    {item.label}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {isHidden && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(147,197,253,.5)', background: 'rgba(147,197,253,.08)', borderRadius: 999, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      hidden
                    </span>
                  )}
                  {showDueBadge && (
                    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,.15)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                      in {dueDays}d
                    </span>
                  )}
                  {item.tagLabel && (
                    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: item.tagColor || 'var(--text-3)', background: 'rgba(255,255,255,.05)', borderRadius: 999, padding: '3px 7px', whiteSpace: 'nowrap' }}>
                      {item.tagLabel}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: '0.76rem', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: isTodo ? 26 : 0 }}>
                {item.subtitle}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SearchPanel({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  status,
  onStatusChange,
  results,
  onSelect,
  onToggleTodo,
  isMobile,
}) {
  const [confetti, setConfetti] = useState(null)

  function handleToggleTodo(id, priority, e) {
    if (e) {
      const r = e.currentTarget.getBoundingClientRect()
      setConfetti({ key: Date.now(), priority, x: r.left + r.width / 2, y: r.top + r.height / 2 })
      setTimeout(() => setConfetti(null), 2000)
    }
    onToggleTodo?.(id)
  }

  const allEvents  = [...results.events, ...results.googleEvents]
  const hasEvents  = allEvents.length > 0
  const hasTasks   = results.todos.length > 0
  const hasCanvas  = results.canvasAssignments.length > 0
  const total      = allEvents.length + results.canvasAssignments.length + results.todos.length
  const hasQuery   = query.trim().length > 0
  // Tasks on left, Events on right when both exist on desktop
  const showSplit  = hasEvents && hasTasks && !isMobile

  const shouldRenderResults = total > 0 || hasQuery

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Search input + scope filters */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, background: 'var(--surface)', padding: '10px 14px', border: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search events, tasks, and Canvas…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.92rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          {SEARCH_TYPES.map(opt => (
            <button key={opt.id} onClick={() => onScopeChange(opt.id)}
                    style={{ borderRadius: 999, border: '1px solid', borderColor: scope === opt.id ? 'var(--blue)' : 'rgba(255,255,255,.08)', background: scope === opt.id ? 'var(--blue-bg)' : 'transparent', color: scope === opt.id ? 'var(--blue-text)' : 'var(--text-2)', padding: '7px 12px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {STATUS_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => onStatusChange(opt.id)}
                  style={{ borderRadius: 999, border: '1px solid', borderColor: status === opt.id ? 'var(--blue)' : 'rgba(255,255,255,.08)', background: status === opt.id ? 'var(--blue-bg)' : 'transparent', color: status === opt.id ? 'var(--blue-text)' : 'var(--text-2)', padding: '7px 12px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {!shouldRenderResults ? (
        <div style={{ padding: 24, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Type to search, or browse upcoming events and tasks above.
        </div>
      ) : total === 0 ? (
        <div style={{ padding: 24, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          No results found. Try a different term or a broader filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Canvas always first, full-width */}
          {hasCanvas && (
            <ResultGroup
              title="Canvas"
              items={results.canvasAssignments.slice(0, 5)}
              onSelect={onSelect}
            />
          )}

          {/* Tasks (left) + Events (right) — split on desktop, stacked on mobile */}
          {showSplit ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
              <ResultGroup title="Tasks"  items={results.todos} onSelect={onSelect} onToggleTodo={handleToggleTodo} />
              <ResultGroup title="Events" items={allEvents} onSelect={onSelect} onToggleTodo={handleToggleTodo} />
            </div>
          ) : (
            <>
              {hasTasks  && <ResultGroup title="Tasks"  items={results.todos} onSelect={onSelect} onToggleTodo={handleToggleTodo} />}
              {hasEvents && <ResultGroup title="Events" items={allEvents} onSelect={onSelect} onToggleTodo={handleToggleTodo} />}
            </>
          )}
        </div>
      )}

      {confetti && <Confetti key={confetti.key} priority={confetti.priority} x={confetti.x} y={confetti.y} />}
    </div>
  )
}
