/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import useDragReorder from './useDragReorder'

/** Minimal DataTransfer — jsdom ships none. */
function dt() { return { effectAllowed: null, dropEffect: null, setData: vi.fn(), getData: vi.fn() } }

const MILK  = { id: 'milk',  text: 'Milk'  }
const EGGS  = { id: 'eggs',  text: 'Eggs'  }
const BREAD = { id: 'bread', text: 'Bread' }

/** A bare list driven by the hook, controlled from outside like the real panels. */
function List({ items, onCommit, groupOf, enabled }) {
  const drag = useDragReorder({ items, onCommit, groupOf, enabled })
  return (
    <ul data-testid="list" {...drag.listProps}>
      {drag.orderedItems.map(item => (
        <li key={item.id} data-testid={item.id} data-dragging={drag.draggingId === item.id ? 'yes' : 'no'}
            {...drag.rowProps(item.id)}>
          {drag.enabled && <button {...drag.handleProps(item.id)} aria-label={`Reorder ${item.text}`} />}
          <span>{item.text}</span>
        </li>
      ))}
      <li data-testid="gap" />
    </ul>
  )
}

/** Applies each commit, the way page.js does, so the list actually reorders. */
function Stateful({ initial, onCommit, groupOf }) {
  const [items, setItems] = useState(initial)
  return <List items={items} groupOf={groupOf} onCommit={next => { onCommit?.(next); setItems(next) }} />
}

function shown() {
  return [...screen.getByTestId('list').querySelectorAll('li span')].map(s => s.textContent)
}
function dimmed() {
  return [...document.querySelectorAll('[data-dragging="yes"]')].map(li => li.dataset.testid)
}
function row(id) { return screen.getByTestId(id) }
function grip(text) { return screen.getByRole('button', { name: `Reorder ${text}` }) }

describe('useDragReorder — dragging', () => {
  it('commits the new order on drop', () => {
    const onCommit = vi.fn()
    render(<List items={[MILK, EGGS, BREAD]} onCommit={onCommit} />)

    fireEvent.dragStart(row('bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    expect(shown()).toEqual(['Bread', 'Milk', 'Eggs'])     // the live preview
    fireEvent.drop(row('milk'), { dataTransfer: dt() })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0].map(i => i.id)).toEqual(['bread', 'milk', 'eggs'])
    expect(dimmed()).toEqual([])
  })

  // Firefox will not start a drag without data, and `move` is what the cursor shows.
  it('sets the drag data and effect', () => {
    render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    const data = dt()
    fireEvent.dragStart(row('milk'), { dataTransfer: data })
    expect(data.setData).toHaveBeenCalledWith('application/x-lv-reorder', 'milk')
    expect(data.effectAllowed).toBe('move')
  })

  /* Text fields and other apps insert a drag's text/plain on drop, so carrying the id
     that way typed it into the "Add an item…" box when a row overshot onto it. */
  it('carries nothing a text field would insert', () => {
    render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    const data = dt()
    fireEvent.dragStart(row('milk'), { dataTransfer: data })
    const types = data.setData.mock.calls.map(([type]) => type)
    expect(types).not.toContain('text/plain')
    expect(types).not.toContain('text/html')
    expect(types).not.toContain('text/uri-list')
  })

  it('dims the dragged row while the drag is live', () => {
    render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    fireEvent.dragStart(row('milk'), { dataTransfer: dt() })
    expect(dimmed()).toEqual(['milk'])
  })

  /* The bug: with no dragend handler, a drag let go anywhere but on a row — a gap, a
     heading, off the list, Escape — left its preview in place for good. The row
     stayed dimmed and the list kept drawing its drag-time snapshot, so nothing new
     showed until some later drag finished on a row. */
  it('resets on dragend without a drop, and shows new items afterwards', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<List items={[MILK, EGGS, BREAD]} onCommit={onCommit} />)

    fireEvent.dragStart(row('bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    fireEvent.dragEnd(row('bread'), { dataTransfer: dt() })

    expect(onCommit).not.toHaveBeenCalled()
    expect(shown()).toEqual(['Milk', 'Eggs', 'Bread'])
    expect(dimmed()).toEqual([])

    const JAM = { id: 'jam', text: 'Jam' }
    rerender(<List items={[MILK, { ...EGGS, text: 'Eggs (dozen)' }, BREAD, JAM]} onCommit={onCommit} />)
    expect(shown()).toEqual(['Milk', 'Eggs (dozen)', 'Bread', 'Jam'])
  })

  it('shows edits that land in the middle of a drag', () => {
    const { rerender } = render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    fireEvent.dragStart(row('eggs'), { dataTransfer: dt() })
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    rerender(<List items={[{ ...MILK, text: 'Oat milk' }, EGGS]} onCommit={vi.fn()} />)
    expect(shown()).toEqual(['Eggs', 'Oat milk'])
  })

  // If the dragged row is deleted mid-drag its dragend may never arrive.
  it('drops the preview once the dragged row is gone', () => {
    const { rerender } = render(<List items={[MILK, EGGS, BREAD]} onCommit={vi.fn()} />)
    fireEvent.dragStart(row('bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    rerender(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    expect(shown()).toEqual(['Milk', 'Eggs'])
    expect(dimmed()).toEqual([])
  })

  // Letting go in the gap between two rows lands the item where the preview had it.
  it('commits a drop on the list itself, between rows', () => {
    const onCommit = vi.fn()
    render(<List items={[MILK, EGGS, BREAD]} onCommit={onCommit} />)
    fireEvent.dragStart(row('bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('eggs'), { dataTransfer: dt() })
    fireEvent.drop(row('gap'), { dataTransfer: dt() })
    expect(onCommit.mock.calls[0][0].map(i => i.id)).toEqual(['milk', 'bread', 'eggs'])
  })

  it('commits nothing for a drop that changed nothing', () => {
    const onCommit = vi.fn()
    render(<List items={[MILK, EGGS]} onCommit={onCommit} />)
    fireEvent.dragStart(row('milk'), { dataTransfer: dt() })
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    fireEvent.drop(row('milk'), { dataTransfer: dt() })
    expect(onCommit).not.toHaveBeenCalled()
    expect(dimmed()).toEqual([])
  })

  // Only drags this list started count — a file dragged in from the desktop is not one.
  it('ignores drags it did not start', () => {
    const onCommit = vi.fn()
    render(<List items={[MILK, EGGS]} onCommit={onCommit} />)
    const over = fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    fireEvent.drop(row('milk'), { dataTransfer: dt() })
    expect(over).toBe(true) // not preventDefault-ed, so not offered as a drop target
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('swaps back when dragged back over the row it just passed', () => {
    render(<List items={[MILK, EGGS, BREAD]} onCommit={vi.fn()} />)
    fireEvent.dragStart(row('milk'), { dataTransfer: dt() })
    fireEvent.dragOver(row('eggs'), { dataTransfer: dt() })
    expect(shown()).toEqual(['Eggs', 'Milk', 'Bread'])
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    fireEvent.dragOver(row('eggs'), { dataTransfer: dt() })
    expect(shown()).toEqual(['Milk', 'Eggs', 'Bread'])
  })

  it('keeps a move inside its group', () => {
    const group = { milk: 'a', eggs: 'b', bread: 'a' }
    render(<List items={[MILK, EGGS, BREAD]} onCommit={vi.fn()} groupOf={i => group[i.id]} />)
    fireEvent.dragStart(row('bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('eggs'), { dataTransfer: dt() })
    expect(shown()).toEqual(['Milk', 'Eggs', 'Bread'])
    fireEvent.dragOver(row('milk'), { dataTransfer: dt() })
    expect(shown()).toEqual(['Bread', 'Milk', 'Eggs'])
  })

  // The grip used to start the "drag" on pointer-down, so a plain press dimmed the row.
  it('leaves nothing dimmed when the grip is only pressed', () => {
    render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    fireEvent.pointerDown(grip('Milk'))
    fireEvent.mouseDown(grip('Milk'))
    fireEvent.pointerUp(grip('Milk'))
    fireEvent.click(grip('Milk'))
    expect(dimmed()).toEqual([])
  })

  it('shows changed items as they are when nothing is being dragged', () => {
    const { rerender } = render(<List items={[MILK, EGGS]} onCommit={vi.fn()} />)
    rerender(<List items={[EGGS, MILK, BREAD]} onCommit={vi.fn()} />)
    expect(shown()).toEqual(['Eggs', 'Milk', 'Bread'])
  })

  it('does nothing at all when disabled', () => {
    render(<List items={[MILK, EGGS]} onCommit={vi.fn()} enabled={false} />)
    expect(row('milk')).not.toHaveAttribute('draggable')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('useDragReorder — keyboard', () => {
  it('moves a row down with ↓ on its grip, and saves straight away', () => {
    const onCommit = vi.fn()
    render(<Stateful initial={[MILK, EGGS, BREAD]} onCommit={onCommit} />)

    act(() => grip('Milk').focus())
    const notCancelled = fireEvent.keyDown(grip('Milk'), { key: 'ArrowDown' })

    expect(notCancelled).toBe(false) // preventDefault: the arrow must not scroll the page
    expect(onCommit.mock.calls[0][0].map(i => i.id)).toEqual(['eggs', 'milk', 'bread'])
    expect(shown()).toEqual(['Eggs', 'Milk', 'Bread'])
  })

  /* In a browser, moving a focused node drops its focus, and a row moved down is the
     node React moves — so without putting it back, the second press went nowhere.
     jsdom keeps focus across a move, so the commit drops it here by hand. */
  it('keeps focus on the moved row\'s grip', () => {
    const dropFocus = () => document.activeElement?.blur()
    render(<Stateful initial={[MILK, EGGS, BREAD]} onCommit={dropFocus} />)
    act(() => grip('Milk').focus())
    fireEvent.keyDown(grip('Milk'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(grip('Milk'))
    fireEvent.keyDown(grip('Milk'), { key: 'ArrowDown' })
    expect(shown()).toEqual(['Eggs', 'Bread', 'Milk'])
    expect(document.activeElement).toBe(grip('Milk'))
  })

  it('moves a row up with ↑', () => {
    render(<Stateful initial={[MILK, EGGS, BREAD]} />)
    act(() => grip('Bread').focus())
    fireEvent.keyDown(grip('Bread'), { key: 'ArrowUp' })
    expect(shown()).toEqual(['Milk', 'Bread', 'Eggs'])
    expect(document.activeElement).toBe(grip('Bread'))
  })

  it('does nothing past either end', () => {
    const onCommit = vi.fn()
    render(<Stateful initial={[MILK, EGGS]} onCommit={onCommit} />)
    fireEvent.keyDown(grip('Milk'), { key: 'ArrowUp' })
    fireEvent.keyDown(grip('Eggs'), { key: 'ArrowDown' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('steps over rows in another group', () => {
    const group = { milk: 'a', eggs: 'b', bread: 'a' }
    const onCommit = vi.fn()
    render(<Stateful initial={[MILK, EGGS, BREAD]} onCommit={onCommit} groupOf={i => group[i.id]} />)
    fireEvent.keyDown(grip('Milk'), { key: 'ArrowDown' })
    expect(onCommit.mock.calls[0][0].map(i => i.id)).toEqual(['eggs', 'bread', 'milk'])
  })

  it('leaves other keys alone', () => {
    const onCommit = vi.fn()
    render(<Stateful initial={[MILK, EGGS]} onCommit={onCommit} />)
    expect(fireEvent.keyDown(grip('Milk'), { key: 'ArrowLeft' })).toBe(true)
    expect(fireEvent.keyDown(grip('Milk'), { key: 'Tab' })).toBe(true)
    expect(onCommit).not.toHaveBeenCalled()
  })

  // A row that opens its editor on click must not open it from its grip.
  it('keeps a click on the grip from reaching the row', () => {
    const onRowClick = vi.fn()
    render(<div onClick={onRowClick}><List items={[MILK]} onCommit={vi.fn()} /></div>)
    fireEvent.click(grip('Milk'))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
