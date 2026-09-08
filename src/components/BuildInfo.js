'use client'

/**
 * BuildInfo — which code this device is running, and when it last heard from the cloud.
 *
 * Both halves exist for the same reason: when two devices disagree, nothing in the UI
 * could tell you *why*. A sync bug, a device still running last week's bundle, and a
 * device that simply hasn't polled yet all look identical — a task in the wrong state
 * — and there was no way to tell them apart without opening a terminal.
 *
 * So: the commit this bundle was built from (`APP_COMMIT_SHA`, inlined at build time
 * by next.config.mjs), and how long ago the last successful pull was.
 */

import { useEffect, useState } from 'react'

const SHA      = process.env.APP_COMMIT_SHA || ''
const BUILT_AT = process.env.APP_BUILT_AT   || ''

/**
 * How long ago, in words, at the coarseness that is actually useful here.
 *
 * Seconds are rounded to "just now": the poll interval is minutes, so a number of
 * seconds implies a precision the thing being described does not have.
 */
export function agoLabel(then, now = Date.now()) {
  if (!then) return 'not yet'
  const secs = Math.max(0, Math.round((now - then) / 1000))
  if (secs < 60)    return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60)    return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24)   return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

export default function BuildInfo({ lastSyncedAt, signedIn }) {
  /* Re-render on a timer so "just now" becomes "2 min ago" without needing an
     unrelated state change to happen to repaint it. A minute is as precise as the
     label gets, so a minute is how often it needs to tick. */
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const parts = []
  if (signedIn) parts.push(`Synced ${agoLabel(lastSyncedAt)}`)
  if (SHA)      parts.push(`build ${SHA}`)
  if (parts.length === 0) return null

  return (
    <div
      title={BUILT_AT ? `Built ${new Date(BUILT_AT).toLocaleString()}` : undefined}
      style={{
        margin: '8px 12px 0',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: 'rgba(147,197,253,.35)',
        letterSpacing: '0.02em',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
