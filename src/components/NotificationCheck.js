'use client'

/**
 * NotificationCheck — "why didn't I get a notification?"
 *
 * Push fails silently by design: every layer reports success and nothing
 * appears. There are five places it can break and no way to tell them apart from
 * the outside, so this walks the chain and reports the first thing that is
 * actually wrong:
 *
 *   1. browser support        — checked locally
 *   2. permission granted     — checked locally, and offered as a button since
 *                               the prompt is ignored outside a user gesture
 *   3. VAPID keys configured  — /api/push/status
 *   4. subscription recorded  — /api/push/status
 *   5. delivery works         — /api/push/test, which actually sends one
 *
 * Step 5 is the important one: if the test arrives but reminders don't, the
 * fault is the scheduler rather than anything on the device.
 */
import { useState } from 'react'
import { BellRing, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { pushSupported, pushPermission, enablePush } from '@/lib/pushClient'

export default function NotificationCheck({ signedIn }) {
  const [state, setState] = useState('idle') // idle | running | done
  const [report, setReport] = useState(null)

  async function run() {
    setState('running')
    setReport(null)

    if (!pushSupported()) {
      setReport({ level: 'bad', lines: ['This browser cannot receive push notifications. On iPhone or iPad you must add the app to your home screen first — Safari does not deliver push to a normal tab.'] })
      setState('done'); return
    }

    const perm = pushPermission()
    if (perm === 'denied') {
      setReport({ level: 'bad', lines: ['Notifications are blocked for this site. Browser settings can re-allow them — the app cannot prompt again once denied.'] })
      setState('done'); return
    }
    if (perm !== 'granted') {
      // Called straight from the click, which is the only context in which the
      // permission prompt is honoured.
      const result = await enablePush()
      if (result !== 'granted') {
        setReport({ level: 'bad', lines: ['Permission was not granted, so nothing can be delivered to this device.'] })
        setState('done'); return
      }
    }

    try {
      const status = await fetch('/api/push/status').then(r => r.json())
      if (status.problems?.length) {
        setReport({ level: 'warn', lines: status.problems })
        setState('done'); return
      }

      const test = await fetch('/api/push/test', { method: 'POST' }).then(r => r.json())
      if (test.ok) {
        setReport({ level: 'good', lines: [`Test notification sent to ${test.sent} device${test.sent !== 1 ? 's' : ''}. If it does not appear within a few seconds, check the operating system's notification settings for this app.`] })
      } else {
        setReport({
          level: 'bad',
          lines: [test.error, ...(test.results ?? []).filter(r => !r.ok).map(r => `${r.host}: ${r.error}`)].filter(Boolean),
        })
      }
    } catch {
      setReport({ level: 'bad', lines: ['Could not reach the server. Check your connection and try again.'] })
    }
    setState('done')
  }

  if (!signedIn) {
    return <p style={S.note}>Sign in to check notification delivery.</p>
  }

  const Icon = report?.level === 'good' ? CheckCircle2 : report?.level === 'warn' ? AlertTriangle : XCircle
  const tone = report?.level === 'good' ? 'var(--green)' : report?.level === 'warn' ? 'var(--amber)' : 'var(--red)'

  return (
    <div>
      <button onClick={run} disabled={state === 'running'} style={{ ...S.btn, opacity: state === 'running' ? 0.6 : 1 }}>
        {state === 'running'
          ? <><Loader2 size={13} style={{ animation: 'gc-spin 1s linear infinite' }} /> Checking…</>
          : <><BellRing size={13} /> Test notifications</>}
      </button>

      {report && (
        <div style={{ ...S.report, borderColor: tone }} role="status">
          <Icon size={13} color={tone} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={S.lines}>
            {report.lines.map((line, i) => <p key={i} style={S.line}>{line}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  btn: {
    display: 'flex', alignItems: 'center', gap: 7, width: '100%',
    padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
  },
  report: {
    display: 'flex', gap: 7, marginTop: 7, padding: '8px 9px',
    border: '1px solid', borderRadius: 9, background: 'var(--surface2)',
  },
  lines: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  line:  { margin: 0, fontSize: '0.68rem', lineHeight: 1.45, color: 'var(--text-2)', overflowWrap: 'anywhere' },
  note:  { margin: 0, fontSize: '0.68rem', color: 'var(--text-3)' },
}
