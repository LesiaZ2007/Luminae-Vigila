/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventModal from './EventModal'

const CATEGORIES = [
  { id: 'class',    label: 'Class',    color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
]

afterEach(cleanup)

function renderModal(props = {}) {
  return render(
    <EventModal
      categories={CATEGORIES}
      onCategoriesChange={() => {}}
      onSave={() => {}}
      onClose={() => {}}
      {...props}
    />,
  )
}

/** An existing own event in the FullCalendar-ish shape the modal is handed. */
function existing(over = {}) {
  return {
    id: 'e1',
    title: 'Physics 101',
    start: new Date('2026-08-19T14:00:00'),
    end:   new Date('2026-08-19T15:15:00'),
    allDay: false,
    backgroundColor: '#3a6fa8',
    extendedProps: { category: 'class' },
    ...over,
  }
}

function swatch(hex) {
  return screen.getByRole('button', { name: new RegExp(`Color this event ${hex}`, 'i') })
}

/* The colour row used to be gated on `isEdit && onRecolor`, so a new event had no
   colour control at all — and the calendar's right-click recolor, the only other way
   to reach one, is disabled on touch. */
describe('EventModal — colour on create', () => {
  it('offers the colour row when creating, not only when editing', () => {
    renderModal()
    expect(swatch('#ef4444')).toBeTruthy()
  })

  it('starts on the category colour and follows the category until told otherwise', async () => {
    renderModal()
    expect(swatch('#3a6fa8').getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: /Personal/ }))

    expect(swatch('#10b981').getAttribute('aria-pressed')).toBe('true')
    expect(swatch('#3a6fa8').getAttribute('aria-pressed')).toBe('false')
  })

  it('saves the picked colour on a brand-new event', async () => {
    const onSave = vi.fn()
    renderModal({ onSave })

    await userEvent.type(screen.getByPlaceholderText(/CS101 Lecture/i), 'Lab')
    await userEvent.click(swatch('#8b5cf6'))
    await userEvent.click(screen.getByRole('button', { name: /add event|save/i }))

    expect(onSave).toHaveBeenCalled()
    expect(onSave.mock.calls[0][0].color).toBe('#8b5cf6')
  })

  it('stops following the category once a colour is picked', async () => {
    renderModal()
    await userEvent.click(swatch('#ec4899'))
    await userEvent.click(screen.getByRole('button', { name: /Personal/ }))

    expect(swatch('#ec4899').getAttribute('aria-pressed')).toBe('true')
  })

  it('hands the colour back to the category on request', async () => {
    renderModal()
    await userEvent.click(swatch('#ec4899'))
    await userEvent.click(screen.getByRole('button', { name: /use category color/i }))

    expect(swatch('#3a6fa8').getAttribute('aria-pressed')).toBe('true')
    // The reset only makes sense while a pick is in force.
    expect(screen.queryByRole('button', { name: /use category color/i })).toBeNull()
  })
})

describe('EventModal — colour on edit', () => {
  /* An untouched event stores its category's colour. Seeding the picker with it as a
     deliberate pick would freeze the colour the next time the category changed. */
  it('treats a stored colour equal to the category as no pick at all', async () => {
    renderModal({ event: existing() })
    expect(screen.queryByRole('button', { name: /use category color/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Personal/ }))
    expect(swatch('#10b981').getAttribute('aria-pressed')).toBe('true')
  })

  it('treats a stored colour that differs from the category as a real pick', () => {
    renderModal({ event: existing({ backgroundColor: '#f59e0b' }) })
    expect(swatch('#f59e0b').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /use category color/i })).toBeTruthy()
  })

  it('opens on an eventPrefs override, which is what is actually on screen', () => {
    renderModal({ event: existing(), colorOverride: '#14b8a6' })
    expect(swatch('#14b8a6').getAttribute('aria-pressed')).toBe('true')
  })

  /* The override wins over the stored colour at render time, so leaving a stale one in
     place would make the save look like it did nothing. */
  it('clears a stale override on save so the new colour is the one that shows', async () => {
    const onSave = vi.fn()
    const onRecolor = vi.fn()
    renderModal({ event: existing(), colorOverride: '#14b8a6', onSave, onRecolor })

    await userEvent.click(swatch('#6366f1'))
    await userEvent.click(screen.getByRole('button', { name: /save|update/i }))

    expect(onRecolor).toHaveBeenCalledWith('e1', null)
    expect(onSave.mock.calls[0][0].color).toBe('#6366f1')
  })

  it('leaves the override alone when there was none to clear', async () => {
    const onRecolor = vi.fn()
    renderModal({ event: existing(), onRecolor, onSave: () => {} })

    await userEvent.click(swatch('#6366f1'))
    await userEvent.click(screen.getByRole('button', { name: /save|update/i }))

    expect(onRecolor).not.toHaveBeenCalled()
  })
})
