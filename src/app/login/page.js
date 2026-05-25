'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [email,     setEmail]     = useState('')
  const [status,    setStatus]    = useState('idle') // idle | sending | sent | error
  const [errorMsg,  setErrorMsg]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/auth/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        throw new Error(error || 'Something went wrong. Please try again.')
      }
      setStatus('sent')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--sidebar, #1e2d4a)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    }}>
      {/* Decorative background blobs */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.12), transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(147,197,253,.07), transparent)', pointerEvents: 'none' }} />

      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.10)',
        borderRadius: 20,
        padding: '40px 36px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 48px rgba(0,0,0,.35)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <CrowIcon size={28} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <span style={{ color: '#fff' }}>luminae</span>
            <span style={{ color: '#93c5fd', marginLeft: 4 }}>Vigila</span>
          </span>
        </div>

        {status === 'sent' ? (
          /* ── Success state ── */
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 16 }}>📬</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
              Check your email
            </h2>
            <p style={{ color: 'rgba(147,197,253,.75)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 24px' }}>
              We sent a sign-in link to <strong style={{ color: '#fff' }}>{email}</strong>.
              Click the link in the email to sign in — it expires in 15 minutes.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail('') }}
              style={{ background: 'none', border: 'none', color: 'rgba(147,197,253,.6)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Email form ── */
          <>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
              Sign in
            </h1>
            <p style={{ color: 'rgba(147,197,253,.65)', fontSize: '0.88rem', margin: '0 0 28px', lineHeight: 1.5 }}>
              Enter your email and we'll send you a magic link — no password needed.
            </p>

            <form onSubmit={handleSubmit}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(147,197,253,.7)', marginBottom: 7, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,.15)',
                  background: 'rgba(255,255,255,.06)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e  => e.target.style.borderColor = 'rgba(147,197,253,.5)'}
                onBlur={e   => e.target.style.borderColor = 'rgba(255,255,255,.15)'}
              />

              {status === 'error' && (
                <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: '8px 0 0' }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                style={{
                  width: '100%',
                  marginTop: 16,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: status === 'sending' ? 'rgba(59,130,246,.5)' : '#3b82f6',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: status === 'sending' ? 'default' : 'pointer',
                  transition: 'filter .15s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={e => { if (status !== 'sending') e.currentTarget.style.filter = 'brightness(1.1)' }}
                onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function CrowIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill="white" d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}
