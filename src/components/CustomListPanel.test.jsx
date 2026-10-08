/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomListPanel from './CustomListPanel'
import { visibleItems } from '@/lib/customLists'

const STAMP = '2026-10-01T12:00:00.000Z'

function item(id, text, sortOrder, extra = {}) {
  return { id, text, checked: false, dueDate: null, note: null, sortOrder, subtasks: [], updatedAt: STAMP, ...extra }
}

const GROCERIES = {
  id: 'cl1', name: 'Groceries', icon: 'ShoppingCart', color: '#10b981',
  createdAt: STAMP, updatedAt: STAMP,
  items: [item('milk', 'Milk', 0), item('eggs', 'Eggs', 1), item('bread', 'Bread', 2)],
}

function renderList({ list = GROCERIES, ...props } = {}) {
  const ui = extra => (
    <CustomListPanel
      lists={[extra?.list ?? list]}
      activeListId={list.id}
      onSelectList={() => {}}
      onCreateList={() => {}}
      onUpdateList={() => {}}
      onDeleteList={() => {}}
      {...props}
    />
  )
  const result = render(ui())
  return { ...result, rerenderList: next => result.rerender(ui({ list: next })) }
}

/** Minimal DataTransfer — jsdom ships none. */
function dt() { return { effectAllowed: null, dropEffect: null, setData: vi.fn(), getData: vi.fn() } }

function row(text) { return screen.getByText(text).closest('li') }
function shown() {
  return [...document.querySelectorAll('ul li')].map(li => li.querySelector('span').textContent)
}
/** The list's items as onUpdateList received them, in display order. */
function savedOrder(list) {
  return visibleItems(list).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(i => i.text)
}

describe('CustomListPanel — reordering', () => {
  it('saves the dragged order', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList })

    fireEvent.dragStart(row('Bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('Milk'), { dataTransfer: dt() })
    fireEvent.drop(row('Milk'), { dataTransfer: dt() })

    expect(onUpdateList).toHaveBeenCalledTimes(1)
    expect(savedOrder(onUpdateList.mock.calls[0][0])).toEqual(['Bread', 'Milk', 'Eggs'])
  })

  /* With no dragend handler, a drag let go off a row left the list drawing its
     drag-time snapshot — an item added afterwards did not appear until some later
     drag happened to finish on a row. */
  it('drops the preview when a drag ends without a drop, and keeps showing new items', () => {
    const onUpdateList = vi.fn()
    const { rerenderList } = renderList({ onUpdateList })

    fireEvent.dragStart(row('Bread'), { dataTransfer: dt() })
    fireEvent.dragOver(row('Milk'), { dataTransfer: dt() })
    fireEvent.dragEnd(row('Bread'), { dataTransfer: dt() })

    expect(onUpdateList).not.toHaveBeenCalled()
    expect(shown()).toEqual(['Milk', 'Eggs', 'Bread'])
    expect(row('Bread').style.opacity).toBe('1')

    rerenderList({ ...GROCERIES, items: [...GROCERIES.items, item('jam', 'Jam', 3)] })
    expect(shown()).toEqual(['Milk', 'Eggs', 'Bread', 'Jam'])
  })

  it('moves an item with the arrow keys on its grip', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList })

    const grip = screen.getByRole('button', { name: 'Reorder Eggs' })
    act(() => grip.focus())
    fireEvent.keyDown(grip, { key: 'ArrowUp' })

    expect(savedOrder(onUpdateList.mock.calls[0][0])).toEqual(['Eggs', 'Milk', 'Bread'])
  })

  // Reordering keeps tombstones — dropping them would let a deleted item come back.
  it('carries deleted items through a reorder', () => {
    const onUpdateList = vi.fn()
    const gone = item('old', 'Old', 5, { deletedAt: STAMP })
    renderList({ list: { ...GROCERIES, items: [...GROCERIES.items, gone] }, onUpdateList })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Eggs' }), { key: 'ArrowDown' })

    expect(onUpdateList.mock.calls[0][0].items.find(i => i.id === 'old')).toEqual(gone)
  })

  it('has no grip or drag on touch, where a sideways drag is a swipe', () => {
    renderList({ isMobile: true })
    expect(screen.queryByRole('button', { name: /^Reorder/ })).toBeNull()
    expect(row('Milk')).not.toHaveAttribute('draggable')
  })
})

describe('CustomListPanel — swiping on touch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function swipe(el, dx) {
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(el,  { touches: [{ clientX: 100 + dx / 2, clientY: 101 }] })
    fireEvent.touchMove(el,  { touches: [{ clientX: 100 + dx, clientY: 102 }] })
    fireEvent.touchEnd(el)
    act(() => { vi.advanceTimersByTime(260) })
  }

  it('ticks an item on a swipe right', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList, isMobile: true })

    swipe(row('Eggs'), 90)

    const saved = onUpdateList.mock.calls[0][0]
    expect(saved.items.find(i => i.id === 'eggs').checked).toBe(true)
  })

  it('waits for the row to slide off before acting', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList, isMobile: true })
    const el = row('Eggs')

    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(el,  { touches: [{ clientX: 190, clientY: 100 }] })
    fireEvent.touchEnd(el)
    act(() => { vi.advanceTimersByTime(200) })
    expect(onUpdateList).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(60) })
    expect(onUpdateList).toHaveBeenCalledTimes(1)
  })

  it('deletes on a swipe left — as a tombstone', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList, isMobile: true })

    swipe(row('Milk'), -90)

    expect(onUpdateList.mock.calls[0][0].items.find(i => i.id === 'milk').deletedAt).toBeTruthy()
  })

  it('leaves a ticked item alone on a swipe right', () => {
    const onUpdateList = vi.fn()
    const list = { ...GROCERIES, items: [item('milk', 'Milk', 0, { checked: true })] }
    renderList({ list, onUpdateList, isMobile: true })

    swipe(row('Milk'), 90)

    expect(onUpdateList).not.toHaveBeenCalled()
  })

  // A mostly-vertical move is a scroll, and must not become a swipe.
  it('ignores a vertical drag', () => {
    const onUpdateList = vi.fn()
    renderList({ onUpdateList, isMobile: true })
    const el = row('Milk')

    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(el,  { touches: [{ clientX: 104, clientY: 140 }] })
    fireEvent.touchMove(el,  { touches: [{ clientX: 190, clientY: 160 }] })
    fireEvent.touchEnd(el)
    act(() => { vi.advanceTimersByTime(260) })

    expect(onUpdateList).not.toHaveBeenCalled()
  })
})

describe('CustomListPanel — editing an item', () => {
  it('renames an item inline', async () => {
    const user = userEvent.setup()
    const onUpdateList = vi.fn()
    renderList({ onUpdateList })

    await user.dblClick(screen.getByText('Milk'))
    const field = screen.getByDisplayValue('Milk')
    await user.clear(field)
    await user.type(field, 'Oat milk{Enter}')

    const saved = onUpdateList.mock.calls.at(-1)[0]
    expect(saved.items.find(i => i.id === 'milk').text).toBe('Oat milk')
  })

  // The row is not draggable while its text is being edited, so selecting text in the
  // field by mouse selects text rather than picking up the row.
  it('stops the row dragging while it is being renamed', async () => {
    const user = userEvent.setup()
    renderList()
    expect(row('Milk')).toHaveAttribute('draggable', 'true')

    await user.dblClick(screen.getByText('Milk'))

    expect(screen.getByDisplayValue('Milk').closest('li')).not.toHaveAttribute('draggable')
  })

  it('ticks an item from its checkbox', async () => {
    const user = userEvent.setup()
    const onUpdateList = vi.fn()
    renderList({ onUpdateList })

    await user.click(screen.getAllByRole('button', { name: 'Mark done' })[1])

    expect(onUpdateList.mock.calls[0][0].items.find(i => i.id === 'eggs').checked).toBe(true)
  })

  /* A new item was given the *count* of live items as its sortOrder. After a reorder
     and a couple of deletions the count can be a value a live item still holds, so the
     new item sorted into the middle of the list instead of landing at the bottom. */
  it('adds a new item at the bottom, even after deletions', async () => {
    const user = userEvent.setup()
    const onUpdateList = vi.fn()
    const list = {
      ...GROCERIES,
      items: [
        item('milk', 'Milk', 0, { deletedAt: STAMP }),
        item('eggs', 'Eggs', 1, { deletedAt: STAMP }),
        item('bread', 'Bread', 2),
      ],
    }
    renderList({ list, onUpdateList })

    await user.type(screen.getByPlaceholderText('Add an item…'), 'Jam{Enter}')

    expect(savedOrder(onUpdateList.mock.calls[0][0])).toEqual(['Bread', 'Jam'])
  })
})
