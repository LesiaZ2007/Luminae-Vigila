'use client'

import { Search } from 'lucide-react'

const SEARCH_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'events', label: 'Events' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'canvas', label: 'Canvas' },
]

const STATUS_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Done' },
]

function ResultGroup({ title, items, onSelect, onToggleTodo }) {
  if (!items.length) return null
  return (
    <div style={{ borderRadius: 16, background: 'var(--surface)', padding: 16, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{items.length}</div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map(item => {
          const isTodo = item.kind === 'todo'
          const completed = Boolean(item.item?.completed || (item.item?.completedDates && item.item.completedDates.length > 0))
          return (
            <div key={`${item.kind}-${item.item?.id || item.label}`}
                 role="button" tabIndex={0}
                 onClick={() => onSelect(item)}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item) } }}
                 style={{ textAlign: 'left', width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(147,197,253,.1)', background: 'rgba(255,255,255,.03)', color: 'var(--text)', cursor: 'pointer', transition: 'background .15s' }}
                 onMouseEnter={e => e.currentTarget.style.background = 'rgba(147,197,253,.08)'}
                 onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {isTodo && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onToggleTodo(item.item?.id) }}
                            style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid rgba(147,197,253,.5)', background: completed ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: completed ? '#fff' : 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                      ✓
                    </button>
                  )}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.tagColor || 'rgba(147,197,253,.7)', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.tagLabel && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: item.tagColor || 'var(--text-3)', background: 'rgba(255,255,255,.05)', borderRadius: 999, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      {item.tagLabel}
                    </span>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{item.source}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
  const total = results.events.length + results.googleEvents.length + results.canvasAssignments.length + results.todos.length
  const hasQuery = query.trim().length > 0
  const shouldRenderResults = total > 0 || hasQuery

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, background: 'var(--surface)', padding: '10px 14px', border: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-3)' }} />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search events, tasks, and Canvas..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.92rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          {SEARCH_TYPES.map(opt => (
            <button key={opt.id} onClick={() => onScopeChange(opt.id)}
                    style={{ borderRadius: 999, border: '1px solid', borderColor: scope === opt.id ? 'var(--blue)' : 'rgba(255,255,255,.08)', background: scope === opt.id ? 'var(--blue-bg)' : 'transparent', color: scope === opt.id ? 'var(--blue-text)' : 'var(--text-2)', padding: '8px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {STATUS_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => onStatusChange(opt.id)}
                  style={{ borderRadius: 999, border: '1px solid', borderColor: status === opt.id ? 'var(--blue)' : 'rgba(255,255,255,.08)', background: status === opt.id ? 'var(--blue-bg)' : 'transparent', color: status === opt.id ? 'var(--blue-text)' : 'var(--text-2)', padding: '8px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {!shouldRenderResults ? (
        <div style={{ padding: 24, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.92rem', lineHeight: 1.6 }}>
          Type keywords to search across your events, tasks, and Canvas assignments.
        </div>
      ) : total === 0 ? (
        <div style={{ padding: 24, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '0.92rem', lineHeight: 1.6 }}>
          No results found. Try a different term or a broader filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <ResultGroup title="Events" items={[...results.events, ...results.googleEvents]} onSelect={onSelect} />
          <ResultGroup title="Tasks" items={results.todos} onSelect={onSelect} onToggleTodo={onToggleTodo} />
          <ResultGroup title="Canvas" items={results.canvasAssignments} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}
