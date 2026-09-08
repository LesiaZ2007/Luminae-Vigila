/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import BuildInfo, { agoLabel } from './BuildInfo'

afterEach(cleanup)

const NOW = Date.parse('2026-09-08T12:00:00.000Z')
const agoMs = ms => NOW - ms

describe('agoLabel', () => {
  /* The poll runs on a scale of minutes, so a count of seconds would claim a
     precision the thing being described does not have. */
  it('rounds anything under a minute to "just now"', () => {
    expect(agoLabel(agoMs(0), NOW)).toBe('just now')
    expect(agoLabel(agoMs(45_000), NOW)).toBe('just now')
  })

  it('counts minutes', () => {
    expect(agoLabel(agoMs(2 * 60_000), NOW)).toBe('2 min ago')
    expect(agoLabel(agoMs(59 * 60_000), NOW)).toBe('59 min ago')
  })

  it('counts hours, then days', () => {
    expect(agoLabel(agoMs(3 * 3_600_000), NOW)).toBe('3 hr ago')
    expect(agoLabel(agoMs(50 * 3_600_000), NOW)).toBe('2 d ago')
  })

  it('says "not yet" when nothing has synced', () => {
    expect(agoLabel(null, NOW)).toBe('not yet')
  })

  /* A clock that disagrees between devices — or a sync recorded a moment in the
     future — must not render "-1 min ago". */
  it('never goes negative', () => {
    expect(agoLabel(NOW + 5_000, NOW)).toBe('just now')
  })
})

describe('BuildInfo', () => {
  it('reports how long ago the last sync was when signed in', () => {
    render(<BuildInfo lastSyncedAt={Date.now() - 5 * 60_000} signedIn />)
    expect(screen.getByText(/Synced 5 min ago/)).toBeInTheDocument()
  })

  /* Signed out there is nothing to sync, so claiming a sync state would be noise —
     but the build marker still matters, since "which code is this device on" is the
     question it exists to answer. */
  it('leaves the sync half out when signed out', () => {
    const { container } = render(<BuildInfo lastSyncedAt={null} signedIn={false} />)
    expect(container.textContent).not.toMatch(/Synced/)
  })

  it('says so rather than lying when a signed-in device has not synced yet', () => {
    render(<BuildInfo lastSyncedAt={null} signedIn />)
    expect(screen.getByText(/Synced not yet/)).toBeInTheDocument()
  })
})
