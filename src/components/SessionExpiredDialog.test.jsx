/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SessionExpiredDialog from './SessionExpiredDialog'

afterEach(cleanup)

describe('SessionExpiredDialog', () => {
  it('explains what stopped and that local work is safe', () => {
    render(<SessionExpiredDialog onDismiss={() => {}} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/signed out/i)).toBeInTheDocument()
    expect(screen.getByText(/won’t reach your other devices/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing is lost/)).toBeInTheDocument()
  })

  /* Straight to Google and back to the app — /login would only be a second page with
     the same button on it. */
  it('signs in directly and returns to the app', () => {
    render(<SessionExpiredDialog onDismiss={() => {}} />)
    const link = screen.getByRole('link', { name: /Sign in again/ })
    expect(link.getAttribute('href')).toBe('/api/auth/google?next=/')
    expect(document.activeElement).toBe(link)
  })

  it('"Not now" dismisses', () => {
    const onDismiss = vi.fn()
    render(<SessionExpiredDialog onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  /* The silence is the bug this reports, so a stray Escape or backdrop tap must not be
     enough to bring it back. */
  it('does not dismiss on Escape or a click outside', () => {
    const onDismiss = vi.fn()
    const { container } = render(<SessionExpiredDialog onDismiss={onDismiss} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(container.firstChild)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
