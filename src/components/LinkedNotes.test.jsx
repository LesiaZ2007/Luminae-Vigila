/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LinkedNotes from './LinkedNotes'

const note = (over = {}) => ({
  id: 'n1', title: 'Chem Lab', html: '<p>titration</p>', color: '#3a6fa8',
  tags: [], linkedTo: null, trashedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('LinkedNotes', () => {
  it('shows only notes linked to this target', () => {
    render(
      <LinkedNotes
        notes={[
          note({ id: 'a', title: 'Mine',      linkedTo: { type: 'course', id: 'c1' } }),
          note({ id: 'b', title: 'Elsewhere', linkedTo: { type: 'course', id: 'c2' } }),
          note({ id: 'c', title: 'Unlinked' }),
        ]}
        targetId="c1"
        onOpenNote={vi.fn()}
      />
    )
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument()
    expect(screen.queryByText('Unlinked')).not.toBeInTheDocument()
  })

  it('hides trashed notes, so a deleted note stops showing on its course', () => {
    render(
      <LinkedNotes
        notes={[note({ title: 'Deleted', linkedTo: { type: 'course', id: 'c1' }, trashedAt: '2026-02-01T00:00:00.000Z' })]}
        targetId="c1"
        onOpenNote={vi.fn()}
      />
    )
    expect(screen.queryByText('Deleted')).not.toBeInTheDocument()
  })

  it('opens the note it was given, not just the first one', async () => {
    const onOpenNote = vi.fn()
    render(
      <LinkedNotes
        notes={[
          note({ id: 'a', title: 'First',  linkedTo: { type: 'course', id: 'c1' }, updatedAt: '2026-01-02T00:00:00.000Z' }),
          note({ id: 'b', title: 'Second', linkedTo: { type: 'course', id: 'c1' }, updatedAt: '2026-01-01T00:00:00.000Z' }),
        ]}
        targetId="c1"
        onOpenNote={onOpenNote}
      />
    )
    await userEvent.click(screen.getByText('Second'))
    expect(onOpenNote).toHaveBeenCalledWith('b')
  })

  it('renders nothing when there is nothing linked and no way to add one', () => {
    const { container } = render(<LinkedNotes notes={[note()]} targetId="c1" onOpenNote={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still offers to create when nothing is linked yet', () => {
    render(<LinkedNotes notes={[]} targetId="c1" onOpenNote={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByText('No notes linked yet.')).toBeInTheDocument()
    expect(screen.getByText('New note')).toBeInTheDocument()
  })

  it('renders nothing without a target, rather than listing every note', () => {
    const { container } = render(
      <LinkedNotes notes={[note({ linkedTo: { type: 'course', id: 'c1' } })]} targetId={null} onOpenNote={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('falls back to the first body line when a note has no title', () => {
    render(
      <LinkedNotes
        notes={[note({ title: '', html: '<p>Derived heading</p><p>rest</p>', linkedTo: { type: 'course', id: 'c1' } })]}
        targetId="c1"
        onOpenNote={vi.fn()}
      />
    )
    expect(screen.getByText('Derived heading')).toBeInTheDocument()
  })
})
