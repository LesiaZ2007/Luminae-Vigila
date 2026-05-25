'use client'

/**
 * Inline Google Calendar section for the sidebar.
 * Shows connected accounts and individual calendar toggles.
 * Calls onOpenSettings() to open the full GoogleCalendarSettings modal
 * (for adding/removing accounts).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, Settings2, RefreshCw } from 'lucide-react'
import { GoogleLogo } from '@/components/GoogleCalendarSettings'

const COLOR_PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]

export default function SidebarGoogleSection({ onOpenSettings, onSync, syncing }) {
  const [accounts,   setAccounts]   = useState([])    // [{ id, email }]
  const [calendars,  setCalendars]  = useState({})    // { accountId: cal[] | null }
  const [expanded,   setExpanded]   = useState({})    // { accountId: bool }
  const [gcExpanded, setGcExpanded] = useState(true)  // the whole section

  // Read prefs from localStorage, re-render when they change
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-google-prefs') ?? '{}') }
    catch { return {} }
  })

  // Persist prefs
  useEffect(() => {
    localStorage.setItem('lv-google-prefs', JSON.stringify(prefs))
  }, [prefs])

  /* ── Load accounts ── */
  const loadAccounts = useCallback(async () => {
    try {
      const { accounts: accs } = await fetch('/api/google/accounts').then(r => r.json())
      setAccounts(accs ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  // Re-fetch when settings modal closes (parent calls loadAccounts indirectly via onSync)
  // We listen via a custom event so the parent doesn't need extra wiring
  useEffect(() => {
    function onGcUpdate() { loadAccounts() }
    window.addEventListener('gc-accounts-changed', onGcUpdate)
    return () => window.removeEventListener('gc-accounts-changed', onGcUpdate)
  }, [loadAccounts])

  /* ── Load calendars for each account ── */
  useEffect(() => {
    for (const acc of accounts) {
      if (calendars[acc.id] !== undefined) continue
      setCalendars(prev => ({ ...prev, [acc.id]: null })) // null = loading

      fetch(`/api/google/calendars?accountId=${acc.id}`)
        .then(r => r.json())
        .then(({ calendars: cals, error }) => {
          const list = error ? [] : (cals ?? [])
          setCalendars(prev => ({ ...prev, [acc.id]: list }))

          // Seed prefs with color/summary metadata.
          // For known calendars: only update the summary; preserve the
          // user's enabled toggle and any custom colour they've set.
          // For brand-new calendars: seed with API defaults.
          setPrefs(p => {
            const accPref = p[acc.id] ?? { enabled: true, calendars: {} }
            const calMap  = { ...accPref.calendars }
            for (const cal of list) {
              const existing = calMap[cal.id]
              calMap[cal.id] = existing == null ? {
                enabled: true,
                color:   cal.backgroundColor ?? '#4285f4',
                summary: cal.summary,
              } : {
                ...(typeof existing === 'boolean' ? { enabled: existing } : existing),
                summary: cal.summary,   // always refresh the display name
              }
            }
            return { ...p, [acc.id]: { ...accPref, calendars: calMap } }
          })

          // Auto-expand first account
          setExpanded(prev => Object.keys(prev).length === 0 ? { [acc.id]: true } : prev)
        })
        .catch(() => setCalendars(prev => ({ ...prev, [acc.id]: [] })))
    }
  }, [accounts]) // eslint-disable-line

  /* ── Toggle helpers ── */
  function isAccountEnabled(accountId) {
    return prefs[accountId]?.enabled !== false
  }

  function isCalendarEnabled(accountId, calId) {
    if (!isAccountEnabled(accountId)) return false
    const cp = prefs[accountId]?.calendars?.[calId]
    if (cp === undefined) return true
    if (typeof cp === 'boolean') return cp
    return cp.enabled !== false
  }

  function toggleAccount(accountId, enabled) {
    setPrefs(p => ({
      ...p,
      [accountId]: { ...(p[accountId] ?? { calendars: {} }), enabled },
    }))
    setTimeout(() => onSync?.(), 0)
  }

  function toggleCalendar(accountId, calId, enabled) {
    setPrefs(p => {
      const accPref  = p[accountId] ?? { enabled: true, calendars: {} }
      const existing = accPref.calendars?.[calId]
      return {
        ...p,
        [accountId]: {
          ...accPref,
          calendars: {
            ...accPref.calendars,
            [calId]: typeof existing === 'object' && existing !== null
              ? { ...existing, enabled }
              : { enabled, color: '#4285f4', summary: calId },
          },
        },
      }
    })
    setTimeout(() => onSync?.(), 0)
  }

  function setCalendarColor(accountId, calId, color) {
    setPrefs(p => {
      const accPref  = p[accountId] ?? { enabled: true, calendars: {} }
      const existing = accPref.calendars?.[calId]
      return {
        ...p,
        [accountId]: {
          ...accPref,
          calendars: {
            ...accPref.calendars,
            [calId]: typeof existing === 'object' && existing !== null
              ? { ...existing, color }
              : { enabled: true, color: color, summary: calId },
          },
        },
      }
    })
    setTimeout(() => onSync?.(), 0)
  }

  function calendarColor(accountId, cal) {
    const cp = prefs[accountId]?.calendars?.[cal.id]
    return typeof cp === 'object' && cp?.color ? cp.color : (cal.backgroundColor ?? '#4285f4')
  }

  /* ── Nothing to show? ── */
  // Always render the section so users can open settings
  const hasAccounts = accounts.length > 0

  return (
    <div style={{ margin: '0 10px 8px', flexShrink: 0 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: gcExpanded && hasAccounts ? 6 : 0 }}>
        <button
          onClick={() => setGcExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 7, color: 'rgba(147,197,253,.55)', textAlign: 'left', fontFamily: 'inherit' }}
        >
          {gcExpanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          <GoogleLogo size={12} />
          <span style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Google Calendar
          </span>
        </button>

        {/* Sync button */}
        {hasAccounts && (
          <button
            onClick={onSync}
            title="Sync Google Calendar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(147,197,253,.4)', display: 'flex', transition: 'color .13s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.8)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.4)'}
          >
            <RefreshCw size={11} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
          </button>
        )}

        {/* Settings / manage button */}
        <button
          onClick={onOpenSettings}
          title="Manage Google accounts"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, color: 'rgba(147,197,253,.4)', display: 'flex', transition: 'color .13s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(147,197,253,.8)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,.4)'}
        >
          <Settings2 size={11} />
        </button>
      </div>

      {/* Account + calendar list */}
      {gcExpanded && (
        <div style={{ animation: 'gc-panel-in .18s ease' }}>
          {!hasAccounts ? (
            <button
              onClick={onOpenSettings}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px', background: 'none', border: '1px dashed rgba(147,197,253,.2)', borderRadius: 8, cursor: 'pointer', color: 'rgba(147,197,253,.45)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, transition: 'all .13s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(147,197,253,.45)'; e.currentTarget.style.color = 'rgba(147,197,253,.75)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(147,197,253,.2)'; e.currentTarget.style.color = 'rgba(147,197,253,.45)' }}
            >
              + Connect Google account
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {accounts.map(acc => (
                <AccountItem
                  key={acc.id}
                  acc={acc}
                  cals={calendars[acc.id]}
                  expanded={!!expanded[acc.id]}
                  onToggleExpand={() => setExpanded(p => ({ ...p, [acc.id]: !p[acc.id] }))}
                  accountEnabled={isAccountEnabled(acc.id)}
                  onToggleAccount={v => toggleAccount(acc.id, v)}
                  isCalendarEnabled={calId => isCalendarEnabled(acc.id, calId)}
                  calendarColor={cal => calendarColor(acc.id, cal)}
                  onToggleCalendar={(calId, v) => toggleCalendar(acc.id, calId, v)}
                  onCalendarColor={(calId, color) => setCalendarColor(acc.id, calId, color)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Account row ── */
function AccountItem({ acc, cals, expanded, onToggleExpand, accountEnabled, onToggleAccount, isCalendarEnabled, calendarColor, onToggleCalendar, onCalendarColor }) {
  return (
    <div>
      {/* Account row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', borderRadius: 7 }}>
        <button
          onClick={onToggleExpand}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(147,197,253,.4)', padding: '2px 1px', display: 'flex', flexShrink: 0 }}
        >
          {expanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
        </button>
        <span style={{ flex: 1, fontSize: '0.7rem', fontWeight: 600, color: accountEnabled ? 'rgba(255,255,255,.75)' : 'rgba(147,197,253,.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color .15s' }}>
          {acc.email}
        </span>
        <MiniToggle enabled={accountEnabled} onChange={onToggleAccount} />
      </div>

      {/* Calendar list */}
      {expanded && (
        <div style={{ paddingLeft: 14 }}>
          {cals === null ? (
            <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,.35)', padding: '2px 4px' }}>Loading…</div>
          ) : cals.length === 0 ? (
            <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,.35)', padding: '2px 4px' }}>No calendars</div>
          ) : cals.map(cal => (
            <div key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 6 }}>
              <ColorDot value={calendarColor(cal)} disabled={!accountEnabled} onChange={color => onCalendarColor(cal.id, color)} />
              <span style={{ flex: 1, fontSize: '0.68rem', color: accountEnabled ? 'rgba(255,255,255,.65)' : 'rgba(147,197,253,.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, transition: 'color .15s' }}>
                {cal.summary}
              </span>
              <MiniToggle
                enabled={isCalendarEnabled(cal.id)}
                disabled={!accountEnabled}
                onChange={v => onToggleCalendar(cal.id, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Color dot that opens a popover picker ── */
function ColorDot({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        title="Change calendar color"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: value,
          border: '2px solid rgba(255,255,255,.32)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.35 : 1,
          padding: 0,
          transition: 'transform .1s, border-color .1s',
        }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform = 'scale(1.18)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.75)' } }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.32)' }}
      />
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 8,
          boxShadow: 'var(--shadow-modal)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 5,
          zIndex: 200,
          width: 106,
        }}>
          {COLOR_PRESETS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => { onChange(color); setOpen(false) }}
              title={color}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: color,
                border: value?.toLowerCase() === color.toLowerCase()
                  ? '2.5px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer', padding: 0,
                transition: 'transform .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            />
          ))}
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
