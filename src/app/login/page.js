'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const ERROR_MESSAGES = {
  no_code:       'Google sign-in was cancelled. Please try again.',
  access_denied: 'Access was denied. Please try again and allow the requested permissions.',
}

function LoginContent() {
  const params   = useSearchParams()
  const next     = params.get('next') ?? '/'
  const errorKey = params.get('error')
  const errorMsg = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? 'Something went wrong. Please try again.')
    : null

  const loginUrl = `/api/auth/google?next=${encodeURIComponent(next)}`

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
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.12), transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(147,197,253,.07), transparent)', pointerEvents: 'none' }} />

      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.10)',
        borderRadius: 20,
        padding: '44px 36px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 48px rgba(0,0,0,.35)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <CrowIcon size={30} />
          <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <span style={{ color: '#fff' }}>luminae</span>
            <span style={{ color: '#93c5fd', marginLeft: 4 }}>Vigila</span>
          </span>
        </div>

        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
          Welcome back
        </h1>
        <p style={{ color: 'rgba(147,197,253,.65)', fontSize: '0.9rem', margin: '0 0 32px', lineHeight: 1.5 }}>
          Sign in to access your schedule,<br/>calendar, and tasks.
        </p>

        {errorMsg && (
          <div style={{
            background: 'rgba(248,113,113,.12)',
            border: '1px solid rgba(248,113,113,.25)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: 20,
            lineHeight: 1.5,
          }}>
            {errorMsg}
          </div>
        )}

        {/* Google sign-in button */}
        <a
          href={loginUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            width: '100%',
            padding: '13px 20px',
            borderRadius: 12,
            background: '#fff',
            color: '#1f2937',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxSizing: 'border-box',
            boxShadow: '0 2px 8px rgba(0,0,0,.2)',
            transition: 'transform .12s, box-shadow .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.3)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none';             e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.2)' }}>
          <GoogleLogo size={20} />
          Continue with Google
        </a>

        <p style={{ color: 'rgba(147,197,253,.35)', fontSize: '0.75rem', margin: '24px 0 0', lineHeight: 1.5 }}>
          Sign in to sync your data across devices.<br/>
          Google Calendar &amp; Canvas are connected separately.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

function CrowIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 -64 640 640" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path fill="white" d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"/>
    </svg>
  )
}

function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
