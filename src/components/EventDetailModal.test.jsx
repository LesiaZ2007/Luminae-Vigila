/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventDetailModal, { normalizeEvent } from './EventDetailModal'

const CATEGORIES = [
  { id: 'class',    label: 'Class',    color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
]

/** A stored own event (ISO strings), as the search results and agenda pass it. */
function ownEvent(over = {}) {
  return {
    id: 'e1',
    title: 'Physics 101',
    start: '2026-08-19T14:00:00',
    end:   '2026-08-19T15:15:00',
    allDay: false,
    extendedProps: { category: 'class', location: 'Room 204, Tech Hall', notes: 'Bring the lab book' },
    ...over,
  }
}

afterEach(cleanup)

describe('normalizeEvent', () => {
  it('reads a FullCalendar EventApi, where start is a Date', () => {
    const n = normalizeEvent({
      id: 'x', title: 'Lecture',
      start: new Date('2026-08-19T14:00:00Z'),
      end:   new Date('2026-08-19T15:00:00Z'),
      extendedProps: { location: 'Hall A' },
    })
    expect(n.start).toBeInstanceOf(Date)
    expect(n.location).toBe('Hall A')
    expect(n.source).toBe('local')
  })

  it('reads a stored event, where start is an ISO string', () => {
    const n = normalizeEvent(ownEvent())
    expect(n.start).toBeInstanceOf(Date)
    expect(n.title).toBe('Physics 101')
  })

  it('pulls an all-day end back off the exclusive next midnight', () => {
    // FullCalendar stores a Monday-only all-day event as ending Tuesday 00:00.
    // Showing that verbatim reads as a two-day event.
    const n = normalizeEvent({ id: 'a', title: 'Holiday', allDay: true, start: '2026-08-19', end: '2026-08-20' })
    expect(n.end.getDate()).toBe(19)
  })

  it('takes the Canvas locationName as a location', () => {
    expect(normalizeEvent({ id: 'c', extendedProps: { locationName: 'Gym' } }).location).toBe('Gym')
  })

  it('strips HTML out of an imported description', () => {
    const n = normalizeEvent({ id: 'g', extendedProps: { description: '<p>Zoom <b>link</b></p>' } })
    expect(n.description).toBe('Zoom link')
  })

  it('returns null for no event', () => {
    expect(normalizeEvent(null)).toBeNull()
  })
})

describe('EventDetailModal', () => {
  it('shows the details rather than an edit form', async () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} onEdit={() => {}} />)

    expect(screen.getByText('Physics 101')).toBeInTheDocument()
    expect(screen.getByText('Room 204, Tech Hall')).toBeInTheDocument()
    expect(screen.getByText('Bring the lab book')).toBeInTheDocument()
    // The point of the change: no title textbox to fill in.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('offers a Google Maps link for a real place', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} />)
    const link = screen.getByRole('link', { name: /google maps/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(link).toHaveAttribute('href', expect.stringContaining('Tech%20Hall'))
  })

  it('keeps the map action beside the address, compact but still fully named', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} />)
    const link = screen.getByRole('link', { name: /open in google maps/i })

    // Shown as "Maps" so it fits on the same line as the address, while the full
    // label stays the accessible name and the tooltip.
    expect(link).toHaveTextContent('Maps')
    expect(link).toHaveAttribute('title', 'Open in Google Maps')

    // Same flex row as the address, rather than stacked underneath it.
    expect(link.parentElement).toBe(screen.getByText('Room 204, Tech Hall').parentElement)
  })

  it('offers a join link, not a map, for an online meeting', () => {
    render(<EventDetailModal
      event={ownEvent({ extendedProps: { category: 'class', location: 'Zoom https://zoom.us/j/9' } })}
      categories={CATEGORIES} onClose={() => {}} />)

    expect(screen.queryByRole('link', { name: /google maps/i })).toBeNull()
    expect(screen.getByRole('link', { name: /join meeting/i })).toHaveAttribute('href', 'https://zoom.us/j/9')
  })

  it('shows no location block at all when there is none', () => {
    render(<EventDetailModal
      event={ownEvent({ extendedProps: { category: 'class' } })}
      categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.queryByText('Where')).toBeNull()
  })

  it('hands the event to onEdit and closes', async () => {
    const onEdit = vi.fn(), onClose = vi.fn()
    const ev = ownEvent()
    render(<EventDetailModal event={ev} categories={CATEGORIES} onEdit={onEdit} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledWith(ev)
    expect(onClose).toHaveBeenCalled()
  })

  it('requires a second press to delete', async () => {
    const onDelete = vi.fn()
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onDelete={onDelete} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledWith('e1', undefined, false)
  })

  it('gives a read-only source no Edit or Delete button', () => {
    render(<EventDetailModal
      event={{ id: 'g1', title: 'Standup', start: '2026-08-19T09:00:00',
               extendedProps: { source: 'google', location: 'Room 3' } }}
      categories={CATEGORIES} onEdit={() => {}} onDelete={() => {}} onClose={() => {}} />)

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.getByText('Google Calendar')).toBeInTheDocument()
    // Still worth a map — imported events are the ones that usually have a location.
    expect(screen.getByRole('link', { name: /google maps/i })).toBeInTheDocument()
  })

  it('links a Canvas event back to Canvas', () => {
    render(<EventDetailModal
      event={{ id: 'c1', title: 'Quiz', start: '2026-08-19T09:00:00',
               extendedProps: { source: 'canvas-ics', htmlUrl: 'https://canvas.test/q/1' } }}
      categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.getByRole('link', { name: /open in canvas/i })).toHaveAttribute('href', 'https://canvas.test/q/1')
  })

  it('offers Unhide for a hidden event and Hide for a visible one', async () => {
    const onUnhide = vi.fn()
    const { unmount } = render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} hidden
                                                onHide={() => {}} onUnhide={onUnhide} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /unhide/i }))
    expect(onUnhide).toHaveBeenCalledWith('e1')
    unmount()

    const onHide = vi.fn()
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES}
                             onHide={onHide} onUnhide={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }))
    expect(onHide).toHaveBeenCalledWith('e1')
  })

  it('describes a repeating event as repeating', () => {
    render(<EventDetailModal
      event={ownEvent({ extendedProps: {
        category: 'class', recurrenceGroupId: 'g1',
        seriesRecurrence: { type: 'custom', days: [1, 3], until: '2026-12-10' },
      } })}
      categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.getByText(/Weekly on Mon, Wed/)).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    // The close is deferred so the exit animation can run.
    await new Promise(r => setTimeout(r, 220))
    expect(onClose).toHaveBeenCalled()
  })
})

/* The colour control used to be a bare `<input type="color">`, which handed the job to
   the OS colour wheel — unreadable against the app's own palette and no way to tell
   which of the ten preset colours was in use. */
describe('EventDetailModal — colour', () => {
  afterEach(cleanup)

  it('offers the app palette rather than an OS colour wheel', () => {
    const { container } = render(
      <EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} onRecolor={() => {}} />,
    )
    expect(container.querySelector('input[type="color"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Color this event #10b981/i })).toBeTruthy()
  })

  it('applies a picked colour on the spot — there is no save button here', async () => {
    const onRecolor = vi.fn()
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} onRecolor={onRecolor} />)

    await userEvent.click(screen.getByRole('button', { name: /Color this event #ef4444/i }))

    expect(onRecolor).toHaveBeenCalledWith('e1', '#ef4444')
  })

  it('marks the colour currently in force, override winning over the event', () => {
    render(
      <EventDetailModal event={ownEvent({ color: '#3a6fa8' })} categories={CATEGORIES}
                        colorOverride="#8b5cf6" onClose={() => {}} onRecolor={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Color this event #8b5cf6/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Color this event #3a6fa8/i }).getAttribute('aria-pressed')).toBe('false')
  })

  it('offers to drop an override, and only when there is one', async () => {
    const onRecolor = vi.fn()
    const { rerender } = render(
      <EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} onRecolor={onRecolor} />,
    )
    expect(screen.queryByRole('button', { name: /use original color/i })).toBeNull()

    rerender(
      <EventDetailModal event={ownEvent()} categories={CATEGORIES} colorOverride="#8b5cf6"
                        onClose={() => {}} onRecolor={onRecolor} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /use original color/i }))

    expect(onRecolor).toHaveBeenCalledWith('e1', null)
  })

  it('leaves the whole block out when recolouring is not on offer', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /Color this event/i })).toBeNull()
  })
})

describe('EventDetailModal — exam blocks', () => {
  afterEach(cleanup)

  function classMeeting(over = {}) {
    return ownEvent({
      id: 'canvascls_cls1_3',
      extendedProps: { source: 'canvas-class', classId: 'cls1', courseName: 'Physics 101', location: 'Room 204', ...over },
    })
  }

  it('offers to make a class period an exam', async () => {
    const onMarkExam = vi.fn()
    render(<EventDetailModal event={classMeeting()} categories={CATEGORIES}
                             onMarkExam={onMarkExam} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /make this an exam/i }))
    // The date, not the occurrence id, is what an exception is keyed by.
    expect(onMarkExam).toHaveBeenCalledWith('cls1', '2026-08-19', expect.objectContaining({ classId: 'cls1' }))
  })

  it('offers to undo once the period is already an exam', async () => {
    const onClearExam = vi.fn()
    render(<EventDetailModal event={classMeeting({ isExam: true })} categories={CATEGORIES}
                             onMarkExam={() => {}} onClearExam={onClearExam} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /make this an exam/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /not an exam any more/i }))
    expect(onClearExam).toHaveBeenCalledWith('cls1', '2026-08-19')
  })

  it('says on the card that this period is an exam', () => {
    render(<EventDetailModal event={classMeeting({ isExam: true })} categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.getByText(/not the usual class/i)).toBeTruthy()
  })

  it('leaves the action out for anything that is not a class meeting', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES}
                             onMarkExam={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /make this an exam/i })).toBeNull()
  })
})

describe('EventDetailModal — flagging an event important', () => {
  it('offers the flag for a read-only event too', async () => {
    // The flag lives in eventPrefs, not on the event, so a Google invite or a
    // Canvas due date can be marked even though neither is ours to edit.
    const onToggleImportant = vi.fn()
    render(<EventDetailModal event={ownEvent({ extendedProps: { source: 'google' } })}
                             categories={CATEGORIES} onToggleImportant={onToggleImportant} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /mark important/i }))
    expect(onToggleImportant).toHaveBeenCalledWith('e1')
  })

  it('flips to the undo wording and says so on the card once flagged', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} important
                             onToggleImportant={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /mark important/i })).toBeNull()
    expect(screen.getByRole('button', { name: /not important/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/sits on top of anything it overlaps/i)).toBeTruthy()
  })

  it('stays open after toggling, so the badge can confirm it took', async () => {
    const onClose = vi.fn()
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES}
                             onToggleImportant={() => {}} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /mark important/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves the action out when no handler is given', () => {
    render(<EventDetailModal event={ownEvent()} categories={CATEGORIES} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /important/i })).toBeNull()
  })
})
