'use client'

import { useState, useEffect, useRef } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

/**
 * OfflineIndicator — subtle banner that appears when the browser loses internet
 * connectivity and briefly confirms "Back online" when it reconnects.
 *
 * Uses window online/offline events + navigator.onLine for initial state.
 * Styled to the Luminae Vigila brand; auto-hides after reconnect.
 */
export default function OfflineIndicator({ onReconnect }) {
  const [online,  setOnline]  = useState(true)   // starts optimistic; corrected after mount
  const [phase,   setPhase]   = useState('hidden') // 'hidden' | 'offline' | 'back-online' | 'hiding'
  // Was a plain `{ current: null }` object literal, which is rebuilt on every
  // render — so `clearTimeout(hideTimer.current)` always read null and could
  // never actually cancel anything. A connection that flapped left orphaned
  // timers behind that later fired and stomped the phase back to 'hidden'.
  const hideTimer = useRef(null)

  // Keep the latest onReconnect in a ref so the (empty-dep) listener effect
  // below always calls the current callback, not a stale closure.
  const onReconnectRef = useRef(onReconnect)
  // Assigned in an effect, not during render: React may render without
  // committing, and a render-phase write would publish a callback belonging to
  // a render that never landed.
  useEffect(() => { onReconnectRef.current = onReconnect }, [onReconnect])

  useEffect(() => {
    // Initialise from actual browser state
    setOnline(navigator.onLine)
    if (!navigator.onLine) setPhase('offline')

    function handleOnline() {
      setOnline(true)
      setPhase('back-online')
      // Flush any pending offline edits to the cloud now that we're back online.
      try { onReconnectRef.current?.() } catch {}
      // Show "Back online" for 2 s then slide out
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => {
        setPhase('hiding')
        setTimeout(() => setPhase('hidden'), 300)
      }, 2000)
    }

    function handleOffline() {
      setOnline(false)
      clearTimeout(hideTimer.current)
      setPhase('offline')
    }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'hidden') return null

  const isOffline    = phase === 'offline'
  const isBackOnline = phase === 'back-online'
  const isHiding     = phase === 'hiding'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        // Sit just above the mobile bottom nav (76 px) on mobile; bottom-right on desktop
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0px) + 10px)',
        right: 16,
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 14px',
        borderRadius: 999,
        fontFamily: 'inherit',
        fontSize: '0.76rem',
        fontWeight: 700,
        lineHeight: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        // Colors: offline = amber-ish warn; back-online = green confirm
        background:  isOffline    ? 'rgba(30,20,5,0.88)'  : 'rgba(5,30,15,0.88)',
        color:       isOffline    ? '#fbbf24'              : '#34d399',
        border:      `1px solid ${isOffline ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.35)'}`,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        // Slide in from bottom on enter, fade out on hide
        animation: isHiding
          ? 'lv-offline-out 0.28s cubic-bezier(0.4,0,1,1) forwards'
          : 'lv-offline-in 0.3s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {isOffline
        ? <WifiOff  size={13} strokeWidth={2.5} />
        : <Wifi     size={13} strokeWidth={2.5} />
      }
      <span>
        {isOffline
          ? 'Offline — changes will sync when you reconnect'
          : 'Back online'
        }
      </span>

      {/* Inline keyframes so this component is fully self-contained */}
      <style>{`
        @keyframes lv-offline-in {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes lv-offline-out {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(8px)  scale(0.95); }
        }
      `}</style>
    </div>
  )
}
