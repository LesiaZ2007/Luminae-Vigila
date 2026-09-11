/**
 * @vitest-environment jsdom
 *
 * Covers the list pane: filtering, tags, and the keyboard accessibility that
 * was previously missing. The editor pane is Tiptap, which needs a real layout
 * engine — NoteEditor is deliberately not rendered here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Grouping and furl state live in localStorage, so each test starts clean.
beforeEach(() => localStorage.clear())

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

// A tag chip reads "chem 2" — the name, then how many notes wear it.
const chip = name => screen.getByRole('button', { name: new RegExp(`^${name} \\d+$`) })

describe('tag filtering', () => {
  const tagged = [
    note({ id: 'a', title: 'Titration',  tags: ['chem'] }),
    note({ id: 'b', title: 'Cell walls', tags: ['bio'] }),
    note({ id: 'c', title: 'Trenches',   tags: ['history'] }),
  ]

  it('counts the notes behind each tag chip', () => {
    render(<NotesPanel {...noop} notes={[...tagged, note({ id: 'd', title: 'Moles', tags: ['chem'] })]} />)
    expect(chip('chem')).toHaveAccessibleName('chem 2')
    expect(chip('bio')).toHaveAccessibleName('bio 1')
  })

  it('filters to one tag', async () => {
    render(<NotesPanel {...noop} notes={tagged} />)
    await userEvent.click(chip('chem'))
    expect(screen.getByText('Titration')).toBeInTheDocument()
    expect(screen.queryByText('Cell walls')).not.toBeInTheDocument()
  })

  it('shows notes from every selected tag, not only those carrying all of them', async () => {
    render(<NotesPanel {...noop} notes={tagged} />)
    await userEvent.click(chip('chem'))
    await userEvent.click(chip('bio'))
    expect(screen.getByText('Titration')).toBeInTheDocument()
    expect(screen.getByText('Cell walls')).toBeInTheDocument()
    expect(screen.queryByText('Trenches')).not.toBeInTheDocument()
  })

  it('deselects a tag when its chip is clicked again', async () => {
    render(<NotesPanel {...noop} notes={tagged} />)
    await userEvent.click(chip('chem'))
    await userEvent.click(chip('chem'))
    expect(screen.getByText('Trenches')).toBeInTheDocument()
  })

  it('clears every selected tag at once', async () => {
    render(<NotesPanel {...noop} notes={tagged} />)
    await userEvent.click(chip('chem'))
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(screen.getByText('Trenches')).toBeInTheDocument()
  })

  it('does not offer to write a first note when a filter is what emptied the list', async () => {
    render(<NotesPanel {...noop} notes={[note({ id: 'a', title: 'Titration', tags: ['chem'] })]} />)
    await userEvent.click(chip('chem'))
    await userEvent.type(screen.getByPlaceholderText('Search notes…'), 'zzz')
    expect(screen.queryByText('Write your first note')).not.toBeInTheDocument()
  })
})

describe('furling in the ordinary list', () => {
  const notes = [
    note({ id: 'a', title: 'Titration',     tags: ['chem'] }),
    note({ id: 'b', title: 'Moles',         tags: ['chem'] }),
    note({ id: 'c', title: 'Cell walls',    tags: ['bio'] }),
    note({ id: 'd', title: 'Loose thought', tags: [] }),
  ]

  const furlChip = name => screen.getByRole('button', { name: `Furl ${name}` })

  it('offers a furl control on every tag chip, without turning on grouping', () => {
    render(<NotesPanel {...noop} notes={notes} />)
    expect(furlChip('chem')).toBeInTheDocument()
    expect(furlChip('bio')).toBeInTheDocument()
  })

  it('collapses a tag into a single row that says how many notes it holds', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))

    expect(screen.queryByText('Titration')).not.toBeInTheDocument()
    expect(screen.queryByText('Moles')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unfurl chem (2 notes)' })).toBeInTheDocument()
    expect(screen.getByText('2 notes')).toBeInTheDocument()
  })

  it('leaves every other note in the list', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))
    expect(screen.getByText('Cell walls')).toBeInTheDocument()
    expect(screen.getByText('Loose thought')).toBeInTheDocument()
  })

  it('unfurls again from the bundle row itself', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))
    await userEvent.click(screen.getByRole('button', { name: 'Unfurl chem (2 notes)' }))
    expect(screen.getByText('Titration')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unfurl chem/ })).not.toBeInTheDocument()
  })

  it('unfurls from the chip too', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))
    await userEvent.click(screen.getByRole('button', { name: 'Unfurl chem' }))
    expect(screen.getByText('Titration')).toBeInTheDocument()
  })

  it('shows the notes anyway while their tag is the active filter', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))
    await userEvent.click(chip('chem'))
    expect(screen.getByText('Titration')).toBeInTheDocument()

    // …and folds them back up once the filter is cleared: the furl is remembered.
    await userEvent.click(chip('chem'))
    expect(screen.queryByText('Titration')).not.toBeInTheDocument()
  })

  it('furls every tag at once, leaving untagged notes in place', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(screen.getByRole('button', { name: /Furl all/ }))
    expect(screen.queryByText('Titration')).not.toBeInTheDocument()
    expect(screen.queryByText('Cell walls')).not.toBeInTheDocument()
    expect(screen.getByText('Loose thought')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Unfurl all/ }))
    expect(screen.getByText('Titration')).toBeInTheDocument()
  })

  it('never furls anything in Trash', async () => {
    render(<NotesPanel {...noop} notes={[
      ...notes,
      note({ id: 'e', title: 'Dead', tags: ['chem'], trashedAt: '2026-02-01T00:00:00.000Z' }),
    ]} />)
    await userEvent.click(furlChip('chem'))
    await userEvent.click(screen.getByText('Trash (1)'))
    expect(screen.getByText('Dead')).toBeInTheDocument()
  })

  it('remembers what was furled across a remount', async () => {
    const { unmount } = render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(furlChip('chem'))
    unmount()

    render(<NotesPanel {...noop} notes={notes} />)
    expect(screen.queryByText('Titration')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unfurl chem (2 notes)' })).toBeInTheDocument()
  })
})

describe('tag groups', () => {
  const notes = [
    note({ id: 'a', title: 'Titration',     tags: ['chem', 'lab'] }),
    note({ id: 'b', title: 'Cell walls',    tags: ['bio'] }),
    note({ id: 'c', title: 'Loose thought', tags: [] }),
  ]

  // Group headers are the only thing in a grouped list carrying aria-expanded
  // — the "Furl all" shortcut and the chip furl buttons don't, so this picks
  // out headers in DOM order without matching on their labels.
  const headerEls   = () => [...document.querySelectorAll('button[aria-expanded]')]
  const headerNames = () => headerEls().map(h => h.textContent.replace(/\d+$/, '').trim())
  const groupBtn    = () => screen.getByRole('button', { name: /Group notes by tag|Show one flat list/ })
  const header      = name => {
    const match = headerEls().find(h =>
      new RegExp(`^(Furl|Unfurl) ${name} \\(`).test(h.getAttribute('aria-label') ?? ''))
    if (!match) throw new Error(`no group header for "${name}"`)
    return match
  }

  it('offers grouping only once a tag exists', () => {
    const { rerender } = render(<NotesPanel {...noop} notes={[note({ tags: [] })]} />)
    expect(screen.queryByRole('button', { name: /Group notes by tag/ })).not.toBeInTheDocument()
    rerender(<NotesPanel {...noop} notes={[note({ tags: ['chem'] })]} />)
    expect(screen.getByRole('button', { name: /Group notes by tag/ })).toBeInTheDocument()
  })

  it('groups notes under each of their tags, untagged last', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())

    expect(headerNames()).toEqual(['bio', 'chem', 'lab', 'Untagged'])
    // The two-tag note is listed under both of its tags — that's the point.
    expect(screen.getAllByText('Titration')).toHaveLength(2)
  })

  it('counts the notes in each group', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())
    expect(header('chem')).toHaveAccessibleName('Furl chem (1 note)')
    expect(header('Untagged')).toHaveAccessibleName('Furl Untagged (1 note)')
  })

  it('furls a group down to its header and unfurls it again', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())

    await userEvent.click(header('bio'))
    expect(screen.queryByText('Cell walls')).not.toBeInTheDocument()
    expect(header('bio')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByText('Titration')).toHaveLength(2) // other groups untouched

    await userEvent.click(header('bio'))
    expect(screen.getByText('Cell walls')).toBeInTheDocument()
  })

  it('furls and unfurls everything at once', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())

    await userEvent.click(screen.getByRole('button', { name: /Furl all/ }))
    expect(screen.queryByText('Titration')).not.toBeInTheDocument()
    expect(screen.queryByText('Loose thought')).not.toBeInTheDocument()
    const headers = headerEls()
    expect(headers).toHaveLength(4)
    expect(headers.every(h => h.getAttribute('aria-expanded') === 'false')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /Unfurl all/ }))
    expect(screen.getByText('Cell walls')).toBeInTheDocument()
  })

  it('remembers grouping and furled groups across a remount', async () => {
    const { unmount } = render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())
    await userEvent.click(header('bio'))
    unmount()

    render(<NotesPanel {...noop} notes={notes} />)
    expect(header('bio')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Cell walls')).not.toBeInTheDocument()
  })

  it('stays flat in Trash, where a furled group would hide what you threw away', async () => {
    render(<NotesPanel {...noop} notes={[
      ...notes,
      note({ id: 'd', title: 'Dead', tags: ['chem'], trashedAt: '2026-02-01T00:00:00.000Z' }),
    ]} />)
    await userEvent.click(groupBtn())
    await userEvent.click(screen.getByText('Trash (1)'))
    expect(headerEls()).toHaveLength(0)
    expect(screen.getByText('Dead')).toBeInTheDocument()
  })

  it('groups whatever the tag filter left behind', async () => {
    render(<NotesPanel {...noop} notes={notes} />)
    await userEvent.click(groupBtn())
    await userEvent.click(chip('chem'))
    expect(headerNames()).toEqual(['chem', 'lab'])
    expect(screen.queryByText('Loose thought')).not.toBeInTheDocument()
  })

  it('opens a note from inside a group', async () => {
    const onSelect = vi.fn()
    render(<NotesPanel {...noop} onSelect={onSelect} notes={notes} />)
    await userEvent.click(groupBtn())
    await userEvent.click(screen.getByRole('button', { name: /Open note: Cell walls/ }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})
