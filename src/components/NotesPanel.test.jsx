/**
 * @vitest-environment jsdom
 *
 * Covers the list pane: filtering, tags, and the keyboard accessibility that
 * was previously missing. The editor pane is Tiptap, which needs a real layout
 * engine — NoteEditor is deliberately not rendered here.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotesPanel from './NotesPanel'

vi.mock('./NoteEditor', () => ({
  default: ({ note }) => <div data-testid="editor">{note?.id}</div>,
}))

const note = (over = {}) => ({
  id: 'n1', title: 'Chem Lab', html: '<p>titration endpoint</p>', color: '#3a6fa8',
  starred: false, pinned: false, tags: [], linkedTo: null, reminder: null,
  trashedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const noop = {
  onSelect: vi.fn(), onCreate: vi.fn(), onUpdate: vi.fn(),
  onTrash: vi.fn(), onRestore: vi.fn(), onPurge: vi.fn(),
}

describe('NotesPanel list', () => {
  it('lists live notes and hides trashed ones', () => {
    render(<NotesPanel {...noop} notes={[
      note({ id: 'a', title: 'Visible' }),
      note({ id: 'b', title: 'Gone', trashedAt: '2026-02-01T00:00:00.000Z' }),
    ]} />)
    expect(screen.getByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('Gone')).not.toBeInTheDocument()
  })

  it('searches title, body, and tags', async () => {
    render(<NotesPanel {...noop} notes={[
      note({ id: 'a', title: 'Chem',    html: '<p>titration</p>' }),
      note({ id: 'b', title: 'History', html: '<p>ww2</p>', tags: ['essay'] }),
    ]} />)
    const box = screen.getByPlaceholderText('Search notes…')

    await userEvent.type(box, 'titration')      // body match
    expect(screen.getByText('Chem')).toBeInTheDocument()
    expect(screen.queryByText('History')).not.toBeInTheDocument()

    await userEvent.clear(box)
    await userEvent.type(box, 'essay')          // tag match
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.queryByText('Chem')).not.toBeInTheDocument()
  })

  it('shows a note\'s tags on its row', () => {
    render(<NotesPanel {...noop} notes={[note({ tags: ['bio', 'lab'] })]} />)
    // Tag chips appear both as filters and on the row, hence getAllByText
    expect(screen.getAllByText('bio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('lab').length).toBeGreaterThan(0)
  })

  it('filters to starred only', async () => {
    render(<NotesPanel {...noop} notes={[
      note({ id: 'a', title: 'Starred', starred: true }),
      note({ id: 'b', title: 'Plain' }),
    ]} />)
    await userEvent.click(screen.getByText('Starred', { selector: 'button' }))
    expect(screen.getByText('Starred', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText('Plain')).not.toBeInTheDocument()
  })

  it('only offers the Trash filter when something is in it', () => {
    const { rerender } = render(<NotesPanel {...noop} notes={[note()]} />)
    expect(screen.queryByText(/Trash/)).not.toBeInTheDocument()
    rerender(<NotesPanel {...noop} notes={[note({ trashedAt: '2026-02-01T00:00:00.000Z' })]} />)
    expect(screen.getByText('Trash (1)')).toBeInTheDocument()
  })

  it('opens a note by click', async () => {
    const onSelect = vi.fn()
    render(<NotesPanel {...noop} onSelect={onSelect} notes={[note({ id: 'abc' })]} />)
    await userEvent.click(screen.getByText('Chem Lab'))
    expect(onSelect).toHaveBeenCalledWith('abc')
  })

  it('opens a note from the keyboard — the a11y fix', async () => {
    const onSelect = vi.fn()
    render(<NotesPanel {...noop} onSelect={onSelect} notes={[note({ id: 'abc' })]} />)

    const row = screen.getByRole('button', { name: /Open note: Chem Lab/ })
    row.focus()
    expect(row).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('abc')

    onSelect.mockClear()
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledWith('abc')
  })

  it('does not present trashed rows as buttons — they cannot be opened', async () => {
    render(<NotesPanel {...noop} notes={[note({ title: 'Dead', trashedAt: '2026-02-01T00:00:00.000Z' })]} />)
    await userEvent.click(screen.getByText('Trash (1)'))
    expect(screen.getByText('Dead')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open note: Dead/ })).not.toBeInTheDocument()
  })

  it('toggles star without opening the note', async () => {
    const onUpdate = vi.fn()
    const onSelect = vi.fn()
    render(<NotesPanel {...noop} onUpdate={onUpdate} onSelect={onSelect} notes={[note({ id: 'abc' })]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Star' }))
    expect(onUpdate).toHaveBeenCalledWith('abc', { starred: true })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('prompts to write the first note when there are none', () => {
    render(<NotesPanel {...noop} notes={[]} />)
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
    expect(screen.getByText('Write your first note')).toBeInTheDocument()
  })
})
