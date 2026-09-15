/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

/* The panel's `todayStr` was `new Date().toISOString().slice(0, 10)`, which converts
   to UTC first. Tests run with TZ=America/New_York (see vitest.config.js), so from
   8pm onward that string is *tomorrow* — and it is the single value the headings, the
   row badges and the Today chip all compare against. Tomorrow's work showed up under
   "Today" and today's fell into "Overdue", every evening. */
describe('TodoPanel — headings use the local date, not the UTC one', () => {
  // 10:49pm in New York on the 14th, which is already 02:49 on the 15th in UTC.
  const LATE_EVENING = new Date('2026-09-15T02:49:00Z')

  const DUE_TODAY    = { id: 'a', title: 'Chem problem set', dueDate: '2026-09-14' }
  const DUE_TOMORROW = { id: 'b', title: 'Essay outline',    dueDate: '2026-09-15' }
  const DUE_FRIDAY   = { id: 'c', title: 'Lab report',       dueDate: '2026-09-18' }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(LATE_EVENING)
  })
  afterEach(() => vi.useRealTimers())

  /** Task titles under one heading, or null when the heading isn't there at all.
   *  "Today" and "Upcoming" are also filter chips, so the heading is the match that
   *  isn't inside a button — and the query has to be the non-throwing one, since an
   *  absent heading is a result here rather than a failure. */
  function tasksUnder(label) {
    const heading = screen.queryAllByText(label).find(el => !el.closest('button'))
    if (!heading) return null
    const list = heading.closest('div').parentElement.querySelector('ul')
    return [...list.querySelectorAll('li')].map(li => li.textContent)
  }

  it('keeps tomorrow out of Today', () => {
    renderPanel({ todos: [DUE_TODAY, DUE_TOMORROW] })

    expect(tasksUnder('Today').join(' ')).toContain('Chem problem set')
    expect(tasksUnder('Today').join(' ')).not.toContain('Essay outline')
  })

  it('files tomorrow under Upcoming', () => {
    renderPanel({ todos: [DUE_TODAY, DUE_TOMORROW] })

    expect(tasksUnder('Upcoming').join(' ')).toContain('Essay outline')
  })

  // The other half of the same off-by-one: with today reading as the 15th, work due
  // on the 14th was already in the past.
  it('does not call today\'s work overdue', () => {
    renderPanel({ todos: [DUE_TODAY] })

    expect(tasksUnder('Overdue')).toBeNull()
  })

  it('still puts the back half of the week under This Week', () => {
    renderPanel({ todos: [DUE_TODAY, DUE_TOMORROW, DUE_FRIDAY] })

    expect(tasksUnder('This Week').join(' ')).toContain('Lab report')
    expect(tasksUnder('Upcoming').join(' ')).not.toContain('Lab report')
  })
})
