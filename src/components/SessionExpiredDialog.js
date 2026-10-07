'use client'

import { useEffect, useRef } from 'react'
import { CloudOff } from 'lucide-react'
import { GoogleLogo } from '@/components/GoogleCalendarSettings'

/**
 * Shown when this device was signed in and no longer is — see lib/sessionExpiry.
 *
 * Deliberately harder to dismiss than the app's other modals: no backdrop click, no
 * Escape. The failure it reports is one that otherwise hides perfectly — the app keeps
 * working, nothing looks wrong, and the edits just never leave the device — so a
 * dialog that vanishes on a stray click would bring back exactly the silence it exists
 * to end. "Not now" is still there, because the app is local-first and signing in has
 * never been required to use it; it asks again on the next load.
 *
 * Signing in goes straight to Google and back here rather than via /login, which
 * would only add a page with the same button on it.
 */
export default function SessionExpiredDialog({ onDismiss }) {
  const signInRef = useRef(null)
  useEffect(() => { signInRef.current?.focus() }, [])

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 modal-backdrop"
         style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', zIndex: 60 }}>
      <div className="modal-surface w-full max-w-sm overflow-hidden"
           role="alertdialog" aria-modal="true"
           aria-labelledby="session-expired-title" aria-describedby="session-expired-body">

        <div className="modal-header">
          <h2 id="session-expired-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudOff size={16} style={{ color: 'var(--text-3)' }} /> You’ve been signed out
          </h2>
        </div>

        <div className="modal-body">
          <div id="session-expired-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
              Sign-ins last 30 days, and this device’s has run out. Until you sign in
              again, changes made here won’t reach your other devices, and theirs won’t
              reach this one.
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.55 }}>
              Nothing is lost. Everything you’ve done on this device is still saved here,
              and it uploads as soon as you’re back.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onDismiss}
                    style={{ flex: 1, padding: '9px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              Not now
            </button>
            <a ref={signInRef} href="/api/auth/google?next=/"
               style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px', borderRadius: 9, border: 'none', background: 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
              <span style={{ display: 'flex', padding: 2, borderRadius: '50%', background: '#fff' }}><GoogleLogo size={12} /></span>
              Sign in again
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
