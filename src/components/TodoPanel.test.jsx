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

/* A deleted subtask stays in the array as a tombstone so the deletion can sync.
   Every read here has to filter those out — the panel would otherwise show a
   deleted step in the checklist and count it in the progress chip. */
describe('TodoPanel — tombstoned subtasks', () => {
  const TASK = {
    id: 't1', title: 'Essay', category: 'academic', dueDate: '2026-09-10',
    subtasks: [
      { id: 's1', title: 'Outline',  completed: true,  updatedAt: '2026-09-01T10:00:00.000Z' },
      { id: 's2', title: 'Draft',    completed: false, updatedAt: '2026-09-01T10:00:00.000Z' },
      { id: 's3', title: 'Bibliography', completed: false,
        updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: '2026-09-02T10:00:00.000Z' },
    ],
  }

  it('counts only the live subtasks in the progress chip', () => {
    renderPanel({ todos: [TASK] })
    // Two live steps, one of them done — not 1/3.
    expect(screen.getByRole('button', { name: /1\/2 steps/ })).toBeTruthy()
  })

  it('leaves the deleted subtask out of the checklist', async () => {
    const user = userEvent.setup()
    renderPanel({ todos: [TASK] })

    await user.click(screen.getByRole('button', { name: /1\/2 steps/ }))

    expect(screen.getByText('Outline')).toBeTruthy()
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.queryByText('Bibliography')).toBeNull()
  })

  it('shows no chip at all when every subtask is deleted', () => {
    renderPanel({ todos: [{ ...TASK, subtasks: [TASK.subtasks[2]] }] })
    expect(screen.queryByRole('button', { name: /steps/ })).toBeNull()
  })
})
