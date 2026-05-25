'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'

const COLOR_PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]

/* ──────────────────────────────────────────────────────────
   Main modal
────────────────────────────────────────────────────────── */
export default function GoogleCalendarSettings({ onClose, onSync }) {
  const [accounts,    setAccounts]   = useState([])
  const [calendars,   setCalendars]  = useState({})   // { accountId: cal[] | null }
  const [expanded,    setExpanded]   = useState({})   // { accountId: bool }
  const [loading,     setLoading]    = useState(true)
  const [connecting,  setConnecting] = useState(false)
  const [syncing,     setSyncing]    = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const popupPollRef = useRef(null)

  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lv-google-prefs') ?? '{}') }
    catch { return {} }
  })

  // Persist prefs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('lv-google-prefs', JSON.stringify(prefs))
  }, [prefs])

  /* ── Load accounts from server ── */
  const loadAccounts = useCallback(async () => {
    try {
      const res  = await fetch('/api/google/accounts')
      const data = await res.json()
      setAccounts(data.accounts ?? [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  /* ── Load calendars for each account ── */
  useEffect(() => {
    for (const acc of accounts) {
      // null = pending, [] = loaded (empty), array = loaded
      if (calendars[acc.id] !== undefined) continue

      setCalendars(prev => ({ ...prev, [acc.id]: null })) // mark as loading

      fetch(`/api/google/calendars?accountId=${acc.id}`)
        .then(r => r.json())
        .then(({ calendars: cals, error }) => {
          const list = error ? [] : (cals ?? [])
          setCalendars(prev => ({ ...prev, [acc.id]: list }))

          // Seed prefs with calendar color/summary metadata.
          // For known calendars: only update the summary; preserve the
          // user's enabled toggle and any custom colour they've set.
          // For brand-new calendars: seed with API defaults.
          setPrefs(p => {
            const accPref  = p[acc.id] ?? { enabled: true, calendars: {} }
            const calMap   = { ...accPref.calendars }
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

          // Auto-expand the first account
          setExpanded(prev => {
            if (Object.keys(prev).length === 0) return { [acc.id]: true }
            return { ...prev, [acc.id]: prev[acc.id] ?? false }
          })
        })
        .catch(() => setCalendars(prev => ({ ...prev, [acc.id]: [] })))
    }
  }, [accounts])  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Helpers ── */
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
              : { enabled: true, color, summary: calId },
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

  /* ── Add account (popup flow) ── */
  async function handleAddAccount() {
    setConnecting(true)
    try {
      const res  = await fetch('/api/google/auth')
      const data = await res.json()

      if (data.error === 'not_configured') {
        setNotConfigured(true)
        setConnecting(false)
        return
      }

      const popup = window.open(
        data.url,
        'google-auth',
        'width=520,height=660,menubar=no,toolbar=no,location=yes,scrollbars=yes',
      )

      function cleanup() {
        window.removeEventListener('message', onMsg)
        clearInterval(pollInterval)
        popupPollRef.current = null
      }

      function onMsg(e) {
        if (e.data?.type === 'gc_connected') {
          cleanup()
          setConnecting(false)
          loadAccounts()
        } else if (e.data?.type === 'gc_error') {
          cleanup()
          setConnecting(false)
          alert('Could not connect: ' + e.data.error)
        }
      }

      window.addEventListener('message', onMsg)
      const pollInterval = setInterval(() => {
        if (popup?.closed) { cleanup(); setConnecting(false); loadAccounts() }
      }, 600)
      popupPollRef.current = pollInterval
    } catch {
      setConnecting(false)
    }
  }

  /* ── Disconnect account ── */
  async function handleDisconnect(accountId) {
    if (!confirm('Disconnect this Google account?\nIts events will no longer appear in your calendar.')) return
    await fetch(`/api/google/accounts?id=${accountId}`, { method: 'DELETE' })
    setAccounts(prev => prev.filter(a => a.id !== accountId))
    setPrefs(p    => { const n = { ...p }; delete n[accountId]; return n })
    setCalendars(p => { const n = { ...p }; delete n[accountId]; return n })
    setExpanded(p  => { const n = { ...p }; delete n[accountId]; return n })
    onSync?.()
  }

  /* ── Manual sync ── */
  async function handleSync() {
    setSyncing(true)
    await onSync?.()
    setTimeout(() => setSyncing(false), 1000)
  }

  /* ── Render ── */
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 460,
        boxShadow: 'var(--shadow-modal)', border: '1px solid var(--border)',
        animation: 'modal-in .32s cubic-bezier(.22,1,.36,1)',
        display: 'flex', flexDirection: 'column', maxHeight: '88vh',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10 }}>
          <GoogleLogo size={22} />
          <h2 style={{ margin: 0, fontSize: '0.97rem', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
            Google Calendar
          </h2>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing || accounts.length === 0}
            title="Sync now"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
              cursor: accounts.length && !syncing ? 'pointer' : 'default',
              color: 'var(--text-2)', padding: '4px 8px', borderRadius: 8,
              fontSize: '0.77rem', fontWeight: 600, opacity: accounts.length ? 1 : 0.35,
            }}
          >
            <RefreshCw size={13} style={{ animation: syncing ? 'gc-spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4, borderRadius: 6, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', overflowY: 'auto', flex: 1 }}>

          {/* Not-configured warning */}
          {notConfigured && (
            <div style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', marginBottom: 14 }}>
              <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: '0.79rem', color: 'var(--text)', lineHeight: 1.55 }}>
                <strong>Google OAuth not configured.</strong><br />
                Add these to your <code style={{ fontSize: '0.75rem' }}>.env.local</code>:<br />
                <code style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>GOOGLE_CLIENT_ID</code><br />
                <code style={{ fontSize: '0.74rem', color: 'var(--text-2)' }}>GOOGLE_CLIENT_SECRET</code><br />
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank" rel="noreferrer"
                  style={{ color: 'var(--blue)', textDecoration: 'underline', marginTop: 4, display: 'inline-block' }}
                >
                  Open Google Cloud Console →
                </a>
              </div>
            </div>
          )}

          {/* Add account button */}
          <button
            onClick={handleAddAccount}
            disabled={connecting}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 14px', borderRadius: 10,
              border: '1.5px dashed var(--border)',
              background: 'transparent',
              cursor: connecting ? 'default' : 'pointer',
              color: 'var(--blue)', fontFamily: 'inherit', fontWeight: 600,
              fontSize: '0.84rem', marginBottom: 14, transition: 'border-color .15s, opacity .15s',
              opacity: connecting ? 0.65 : 1,
            }}
            onMouseEnter={e => { if (!connecting) e.currentTarget.style.borderColor = 'var(--blue)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Plus size={15} />
            {connecting ? 'Opening Google sign-in…' : 'Add Google Account'}
          </button>

          {/* Account list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-2)', fontSize: '0.84rem' }}>
              Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-2)', fontSize: '0.82rem', lineHeight: 1.65 }}>
              No Google accounts connected yet.<br />Click above to add one.
            </div>
          ) : accounts.map(acc => (
            <AccountRow
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
              onDisconnect={() => handleDisconnect(acc.id)}
            />
          ))}
        </div>

        {/* Footer */}
        {accounts.length > 0 && (
          <div style={{ padding: '10px 20px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: '0.71rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              Google Calendar events are read-only. Edit them in Google Calendar.
              Events sync automatically on load and every 5 minutes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────
   Account row
────────────────────────────────────────────────────────── */
function AccountRow({ acc, cals, expanded, onToggleExpand, accountEnabled, onToggleAccount, isCalendarEnabled, calendarColor, onToggleCalendar, onCalendarColor, onDisconnect }) {
  return (
    <div style={{ marginBottom: 10, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>

      {/* Account header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 13px', background: 'var(--surface2)', gap: 8 }}>
        <button
          onClick={onToggleExpand}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2, display: 'flex', flexShrink: 0 }}
        >
          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </button>

        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {acc.email}
        </span>

        <Toggle enabled={accountEnabled} onChange={onToggleAccount} />

        <button
          onClick={onDisconnect}
          title="Disconnect account"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '2px 4px', marginLeft: 2, display: 'flex', borderRadius: 5, transition: 'color .13s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Calendar list */}
      {expanded && (
        <div style={{ padding: cals?.length ? '4px 13px 10px' : '10px 13px' }}>
          {cals === null || cals === undefined ? (
            <div style={{ color: 'var(--text-2)', fontSize: '0.78rem', padding: '6px 0' }}>
              Loading calendars…
            </div>
          ) : cals.length === 0 ? (
            <div style={{ color: 'var(--text-2)', fontSize: '0.78rem', padding: '6px 0' }}>
              No calendars found.
            </div>
          ) : cals.map((cal, i) => (
            <div
              key={cal.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0',
                borderBottom: i < cals.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ flex: 1, fontSize: '0.79rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cal.summary}
                {cal.primary && (
                  <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-2)', fontWeight: 600 }}>
                    primary
                  </span>
                )}
              </span>
              <ColorSwatches
                value={calendarColor(cal)}
                disabled={!accountEnabled}
                onChange={color => onCalendarColor(cal.id, color)}
              />
              <Toggle
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

/* ──────────────────────────────────────────────────────────
   Toggle switch
────────────────────────────────────────────────────────── */
function ColorSwatches({ value, onChange, disabled = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, width: 92, flexShrink: 0, opacity: disabled ? 0.38 : 1 }}>
      {COLOR_PRESETS.slice(0, 10).map(color => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          title={color}
          style={{
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: color,
            border: value?.toLowerCase() === color.toLowerCase() ? '2.5px solid var(--text)' : '2px solid transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            transition: 'transform .1s',
          }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'scale(1.2)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        />
      ))}
    </div>
  )
}

function Toggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: 34, height: 19, borderRadius: 999, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: (enabled && !disabled) ? 'var(--blue)' : 'var(--border)',
        position: 'relative', transition: 'background .18s', flexShrink: 0,
        opacity: disabled ? 0.38 : 1, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2.5,
        left: enabled ? 17 : 2.5,
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left .18s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        display: 'block',
      }} />
    </button>
  )
}

/* ──────────────────────────────────────────────────────────
   Google logo (four-colour 'G')
────────────────────────────────────────────────────────── */
export function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
