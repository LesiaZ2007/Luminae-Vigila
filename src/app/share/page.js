'use client'

/**
 * /share — the Web Share Target landing page.
 *
 * Android hands a share off as a plain GET navigation to this route (see
 * `share_target` in manifest.webmanifest), with title / text / url as query
 * params. We stash the payload in localStorage and bounce to the app, which
 * picks it up and opens a new note containing it.
 *
 * Why localStorage rather than passing it through to `/?title=...`:
 *   • The share text can be long, and URLs have practical length limits.
 *   • Shared text often contains characters that survive a round-trip badly.
 *   • It survives the redirect even if the app cold-starts, which it usually
 *     does — the PWA is normally not already running when you share into it.
 *
 * The key is cleared by the consumer as soon as it's read, so a shared item
 * can't reappear on the next launch.
 */

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { NotebookPen } from 'lucide-react'

export const PENDING_SHARE_KEY = 'lv-pending-share'

function ShareHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const title = params.get('title') ?? ''
    const text  = params.get('text')  ?? ''
    const url   = params.get('url')   ?? ''
    const compose = params.get('compose') === '1'

    // Android is inconsistent about where a shared link lands: some apps put it
    // in `url`, others append it to `text`. Only add it separately when it
    // isn't already part of the text, otherwise every share duplicates it.
    const bodyParts = [text]
    if (url && !text.includes(url)) bodyParts.push(url)
    const body = bodyParts.filter(Boolean).join('\n\n')

    if (title || body || compose) {
      try {
        localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ title, body }))
      } catch {
        // Private mode or a full quota — fall through and just open the app
        // rather than dead-ending on this screen.
      }
    }

    router.replace('/')
  }, [params, router])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', gap: 12, background: 'var(--bg)', color: 'var(--text-3)',
    }}>
      <NotebookPen size={30} style={{ color: 'var(--blue)' }} />
      <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>Saving to a note…</p>
    </div>
  )
}

export default function SharePage() {
  // useSearchParams needs a Suspense boundary — without it the whole route
  // opts into client-side rendering at build time.
  return (
    <Suspense fallback={null}>
      <ShareHandler />
    </Suspense>
  )
}
