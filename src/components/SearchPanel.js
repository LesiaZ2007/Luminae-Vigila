'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Clock, Calendar } from 'lucide-react'
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

const HISTORY_KEY = 'lv-search-history'
const MAX_HISTORY = 5

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86_400_000)
}

function matchesDateRange(itemDate, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  if (!itemDate) return false
  const d = itemDate.slice(0, 10)
  if (dateFrom && d < dateFrom) return false
  if (dateTo   && d > dateTo)   return false
  return true
}

function ResultGroup({ title, items, onSelect, onToggleTodo, focusedIndex, startIndex }) {
  if (!items.length) return null
  return (
    <div style={{ borderRadius: 16, background: 'var(--surface)', padding: 16, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{items.length}</div>
      </div>
      <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
        {items.map((item, localIdx) => {
          const globalIdx = startIndex + localIdx
          const isFocused = focusedIndex === globalIdx
          const isTodo    = item.kind === 'todo'
          const isHidden  = !!item.hidden
          const completed = Boolean(item.item?.completed || (item.item?.completedDates && item.item.completedDates.length > 0))
          const dueDays   = isTodo ? daysUntil(item.item?.dueDate) : null
          const showDueBadge = isTodo && !completed && dueDays >= 1 && dueDays <= 6

          return (
            <div key={`${item.kind}-${item.item?.id || item.label}`}
                 data-result-index={globalIdx}
                 role="button" tabIndex={0}
                 onClick={() => onSelect(item)}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item) } }}
                 style={{
                   textAlign: 'left', width: '100%', padding: '11px 13px', borderRadius: 12,
                   border: isFocused ? '1px solid rgba(147,197,253,.4)' : '1px solid rgba(147,197,253,.1)',
                   background: isFocused ? 'rgba(147,197,253,.12)' : 'rgba(255,255,255,.03)',
                   color: 'var(--text)', cursor: 'pointer', transition: 'background .15s', opacity: isHidden ? 0.45 : 1,
                   outline: isFocused ? '2px solid rgba(147,197,253,.25)' : 'none',
                 }}
                 onMouseEnter={e => { if (!isFocused) e.currentTarget.style.background = 'rgba(147,197,253,.08)' }}
                 onMouseLeave={e => { if (!isFocused) e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}>
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
  const [confetti,      setConfetti]      = useState(null)
  const [inputFocused,  setInputFocused]  = useState(false)
  const [focusedIndex,  setFocusedIndex]  = useState(-1)
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [showDates,     setShowDates]     = useState(false)
  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
    catch { return [] }
  })
  const inputRef    = useRef(null)
  const resultsRef  = useRef(null)

  // Reset focused index when query changes
  useEffect(() => { setFocusedIndex(-1) }, [query])

  // Save to history helper
  const saveToHistory = useCallback((q) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setSearchHistory(prev => {
      const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, MAX_HISTORY)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }, [])

  function handleSelect(item) {
    saveToHistory(query)
    onSelect(item)
  }

  function clearHistory() {
    setSearchHistory([])
    try { localStorage.removeItem(HISTORY_KEY) } catch (_) {}
  }

  function handleToggleTodo(id, priority, e) {
    if (e) {
      const r = e.currentTarget.getBoundingClientRect()
      setConfetti({ key: Date.now(), priority, x: r.left + r.width / 2, y: r.top + r.height / 2 })
      setTimeout(() => setConfetti(null), 2000)
    }
    onToggleTodo?.(id)
  }

  // Apply date range filter on top of the results already filtered by scope/status
  const allEvents  = [...results.events, ...results.googleEvents].filter(item =>
    matchesDateRange(item.item?.start || item.item?.dueAt, dateFrom, dateTo)
  )
  const filteredTodos  = results.todos.filter(item =>
    matchesDateRange(item.item?.dueDate, dateFrom, dateTo)
  )
  const filteredCanvas = results.canvasAssignments.filter(item =>
    matchesDateRange(item.item?.dueAt?.slice(0, 10), dateFrom, dateTo)
  )

  const hasEvents  = allEvents.length > 0
  const hasTasks   = filteredTodos.length > 0
  const hasCanvas  = filteredCanvas.length > 0
  const total      = allEvents.length + filteredCanvas.length + filteredTodos.length
  const hasQuery   = query.trim().length > 0
  const showSplit  = hasEvents && hasTasks && !isMobile

  const shouldRenderResults = total > 0 || hasQuery

  // Build flat result list for keyboard navigation (canvas → tasks → events)
  const flatResults = [...filteredCanvas, ...filteredTodos, ...allEvents]
  const canvasStart = 0
  const todosStart  = filteredCanvas.length
  const eventsStart = filteredCanvas.length + filteredTodos.length

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !resultsRef.current) return
    const el = resultsRef.current.querySelector(`[data-result-index="${focusedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedIndex])

  const showRecentHistory = inputFocused && !hasQuery && searchHistory.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Search input */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 16, background: 'var(--surface)', padding: '10px 14px', border: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              setInputFocused(false)
              if (query.trim()) saveToHistory(query)
            }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setFocusedIndex(i => Math.min(i + 1, flatResults.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setFocusedIndex(i => Math.max(i - 1, -1))
                if (focusedIndex <= 0) inputRef.current?.focus()
              } else if (e.key === 'Enter' && focusedIndex >= 0 && flatResults[focusedIndex]) {
                e.preventDefault()
                handleSelect(flatResults[focusedIndex])
              }
            }}
            placeholder="Search events, tasks, and Canvas…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.92rem' }}
          />
          {query && (
            <button onClick={() => onQueryChange('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center' }}>
              <X size={14} />
            </button>
          )}
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

      {/* Status filters + date range toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: showDates ? 10 : 18 }}>
        {STATUS_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => onStatusChange(opt.id)}
                  style={{ borderRadius: 999, border: '1px solid', borderColor: status === opt.id ? 'var(--blue)' : 'rgba(255,255,255,.08)', background: status === opt.id ? 'var(--blue-bg)' : 'transparent', color: status === opt.id ? 'var(--blue-text)' : 'var(--text-2)', padding: '7px 12px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit' }}>
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => { setShowDates(v => !v); if (showDates) { setDateFrom(''); setDateTo('') } }}
          style={{
            marginLeft: 'auto', borderRadius: 999, border: '1px solid',
            borderColor: (showDates || dateFrom || dateTo) ? 'var(--blue)' : 'rgba(255,255,255,.08)',
            background: (showDates || dateFrom || dateTo) ? 'var(--blue-bg)' : 'transparent',
            color: (showDates || dateFrom || dateTo) ? 'var(--blue-text)' : 'var(--text-2)',
            padding: '7px 12px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
          <Calendar size={12} />
          Date range
        </button>
      </div>

      {/* Date range inputs */}
      {showDates && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              style={{
                padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit',
                fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              style={{
                padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit',
                fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
              }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ alignSelf: 'flex-end', marginBottom: 1, padding: '7px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: '0.76rem', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Recent search history (shown when focused + empty query) */}
      {showRecentHistory && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Clock size={11} />
              Recent
            </div>
            <button
              onClick={clearHistory}
              style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px' }}>
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {searchHistory.map(entry => (
              <button
                key={entry}
                onMouseDown={e => { e.preventDefault(); onQueryChange(entry) }}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background .13s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--blue-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div ref={resultsRef}>
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
                items={filteredCanvas.slice(0, 5)}
                onSelect={handleSelect}
                focusedIndex={focusedIndex}
                startIndex={canvasStart}
              />
            )}

            {/* Tasks (left) + Events (right) — split on desktop, stacked on mobile */}
            {showSplit ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                <ResultGroup title="Tasks"  items={filteredTodos} onSelect={handleSelect} onToggleTodo={handleToggleTodo} focusedIndex={focusedIndex} startIndex={todosStart} />
                <ResultGroup title="Events" items={allEvents}     onSelect={handleSelect} onToggleTodo={handleToggleTodo} focusedIndex={focusedIndex} startIndex={eventsStart} />
              </div>
            ) : (
              <>
                {hasTasks  && <ResultGroup title="Tasks"  items={filteredTodos} onSelect={handleSelect} onToggleTodo={handleToggleTodo} focusedIndex={focusedIndex} startIndex={todosStart} />}
                {hasEvents && <ResultGroup title="Events" items={allEvents}     onSelect={handleSelect} onToggleTodo={handleToggleTodo} focusedIndex={focusedIndex} startIndex={eventsStart} />}
              </>
            )}
          </div>
        )}
      </div>

      {confetti && <Confetti key={confetti.key} priority={confetti.priority} x={confetti.x} y={confetti.y} />}
    </div>
  )
}
