/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoPanel from './TodoPanel'

afterEach(cleanup)

const CATEGORIES = [
  { id: 'academic', label: 'Academic', color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#8a6fa8' },
]

/** A class in the shape page.js keeps in `canvasClasses`, so the panel derives a
 *  `class:c1` category chip from it. */
const PHYSICS = {
  id: 'c1', courseName: 'Physics 101', color: '#3a6fa8', enabled: true,
  days: [1, 3, 5], startTime: '09:00', endTime: '09:50',
}

function renderPanel(props = {}) {
  return render(
    <TodoPanel
      todos={[]}
      events={[]}
      todoCategories={CATEGORIES}
      onToggle={() => {}}
      onDelete={() => {}}
      onAddClick={() => {}}
      onEditClick={() => {}}
      onCategoriesChange={() => {}}
      {...props}
    />,
  )
}

/** The chip row sits above the list; scope chip clicks to it so a category name
 *  rendered on a task row can't be picked up instead. */
function chip(name) {
  return screen.getByRole('button', { name })
}

describe('TodoPanel — new task defaults to the filtered category', () => {
  it('passes the single active category to onAddClick', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    renderPanel({ onAddClick, canvasClasses: [PHYSICS] })

    await user.click(chip('Physics 101'))
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(onAddClick).toHaveBeenCalledWith('class:c1')
  })

  it('works for an ordinary category too, not just classes', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    renderPanel({ onAddClick })

    await user.click(chip('Personal'))
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(onAddClick).toHaveBeenCalledWith('personal')
  })

  it('passes null when two chips are active — no one answer', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    renderPanel({ onAddClick })

    await user.click(chip('Academic'))
    await user.click(chip('Personal'))
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(onAddClick).toHaveBeenCalledWith(null)
  })

  it('passes null when nothing is filtered', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    renderPanel({ onAddClick })

    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(onAddClick).toHaveBeenCalledWith(null)
  })
})
