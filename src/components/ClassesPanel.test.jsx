/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClassesPanel from './ClassesPanel'

const DAY = 24 * 60 * 60_000

/* The panel shows what is *ahead* of now, so every fixture below is anchored to a
   fixed clock rather than to whenever the suite happens to run. */
const NOW = new Date('2026-03-02T08:00:00')

beforeAll(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(NOW) })
afterAll(() => { vi.useRealTimers() })
afterEach(cleanup)

function makeClass(over = {}) {
  return {
    id: 'c1', courseName: 'Physics 101', section: '002', professor: 'Dr. Vane',
    location: 'Room 204, Tech Hall', color: '#3a6fa8', enabled: true,
    days: [1, 3, 5], startTime: '09:00', endTime: '09:50',
    semesterStart: '2026-01-12', semesterEnd: '2026-05-08',
    ...over,
  }
}

/** A meeting in the shape page.js's `canvasClassEvents` memo produces. */
function meeting(date, over = {}) {
  return {
    id: `canvascls_c1_${date}`,
    title: 'Physics 101 (002)',
    start: `${date}T09:00:00`,
    end:   `${date}T09:50:00`,
    color: '#3a6fa8',
    extendedProps: { source: 'canvas-class', classId: 'c1', courseName: 'Physics 101' },
    ...over,
  }
}

function renderPanel(props = {}) {
  return render(
    <ClassesPanel
      canvasClasses={[makeClass()]}
      todos={[]}
      canvasClassEvents={[]}
      canvasAssignments={[]}
      notes={[]}
      studySessions={[]}
      {...props}
    />,
  )
}

describe('ClassesPanel — empty state', () => {
  it('invites you to add a class rather than showing an empty list', () => {
    render(<ClassesPanel canvasClasses={[]} onAddClass={vi.fn()} />)
    expect(screen.getByText('No classes yet')).toBeInTheDocument()
  })

  // The whole point of the tab: it is not gated on a Canvas token.
  it('says a Canvas account is optional', () => {
    render(<ClassesPanel canvasClasses={[]} onAddClass={vi.fn()} />)
    expect(screen.getByText(/No Canvas\s+account needed/)).toBeInTheDocument()
  })
})

describe('ClassesPanel — a class card', () => {
  it('renders the class with its meeting pattern and staff', () => {
    renderPanel()
    expect(screen.getByText('Physics 101')).toBeInTheDocument()
    expect(screen.getByText(/MWF · 9:00 AM–9:50 AM/)).toBeInTheDocument()
    expect(screen.getByText('Dr. Vane')).toBeInTheDocument()
  })

  it('links a real room to Google Maps', () => {
    renderPanel()
    const link = screen.getByRole('link', { name: /Room 204, Tech Hall/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
  })

  it('opens the first card so the tab is never a wall of closed rows', () => {
    render(
      <ClassesPanel
        canvasClasses={[makeClass(), makeClass({ id: 'c2', courseName: 'Chem 210' })]}
        todos={[]} canvasClassEvents={[]} canvasAssignments={[]} notes={[]} studySessions={[]}
      />,
    )
    // The open card shows its meeting details; the closed one shows only its summary.
    expect(screen.getByText('Dr. Vane')).toBeInTheDocument()
    expect(screen.getByText('Chem 210')).toBeInTheDocument()
    expect(screen.getAllByText(/MWF · 9:00 AM–9:50 AM/)).toHaveLength(1)
  })

  // Disabled classes are still yours — they keep their notes and history.
  it('lists a disabled class, below the ones you are taking', () => {
    render(
      <ClassesPanel
        canvasClasses={[makeClass({ id: 'c0', courseName: 'Art History', enabled: false }), makeClass()]}
        todos={[]} canvasClassEvents={[]} canvasAssignments={[]} notes={[]} studySessions={[]}
      />,
    )
    expect(screen.getByText('Art History')).toBeInTheDocument()
    // Physics sorts first and is therefore the one that opened.
    expect(screen.getByText('Dr. Vane')).toBeInTheDocument()
  })
})

describe('ClassesPanel — coursework', () => {
  const todos = [
    { id: 't1', title: 'Lab report',  category: 'class:c1', dueDate: '2026-03-04' },
    { id: 't2', title: 'Problem set', category: 'class:c1', dueDate: '2026-03-02' },
    { id: 't3', title: 'Old quiz',    category: 'class:c1', dueDate: '2026-02-01', completed: true },
    { id: 't4', title: 'Buy milk',    category: 'personal', dueDate: '2026-03-03' },
  ]

  it('shows only the tasks filed under this class', () => {
    renderPanel({ todos })
    expect(screen.getByText('Lab report')).toBeInTheDocument()
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
  })

  it('orders open tasks soonest first', () => {
    renderPanel({ todos })
    const titles = screen.getAllByText(/Lab report|Problem set/).map(n => n.textContent)
    expect(titles).toEqual(['Problem set', 'Lab report'])
  })

  it('hides completed tasks behind a count until asked', async () => {
    renderPanel({ todos })
    expect(screen.queryByText('Old quiz')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /1 completed/ }))
    expect(screen.getByText('Old quiz')).toBeInTheDocument()
  })

  it('ticks a task off in place without opening the editor', async () => {
    const onToggleTodo = vi.fn()
    const onTodoClick  = vi.fn()
    renderPanel({ todos, onToggleTodo, onTodoClick })
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[0])
    expect(onToggleTodo).toHaveBeenCalledWith('t2')
    expect(onTodoClick).not.toHaveBeenCalled()
  })

  // The class is the answer to "which class is this for", so a task added from
  // inside the card should arrive already filed under it.
  it('files a new task under the class it was added from', async () => {
    const onAddTask = vi.fn()
    renderPanel({ todos, onAddTask })
    await userEvent.click(screen.getByRole('button', { name: /Add task/ }))
    expect(onAddTask).toHaveBeenCalledWith('class:c1')
  })

  it('says so plainly when a class has nothing outstanding', () => {
    renderPanel()
    expect(screen.getByText('Nothing outstanding for this class.')).toBeInTheDocument()
  })
})

describe('ClassesPanel — meetings and exams', () => {
  const events = [
    meeting('2026-02-27'),                                    // past
    meeting('2026-03-02'),
    meeting('2026-03-04', {
      title: 'Midterm',
      color: '#ef4444',
      extendedProps: { source: 'canvas-class', classId: 'c1', category: 'exam', isExam: true },
    }),
    { ...meeting('2026-03-06'), extendedProps: { classId: 'c9' } },  // another class
  ]

  it('lists what is ahead and drops what has already happened', () => {
    renderPanel({ canvasClassEvents: events })
    expect(screen.getAllByText('Physics 101 (002)')).toHaveLength(1)
  })

  // An exam *is* the period — splitting them into two lists would mean reading
  // both to find out what happens next Tuesday.
  it('keeps exams in the same list as ordinary meetings', () => {
    renderPanel({ canvasClassEvents: events })
    const comingUp = screen.getByText('Coming up').closest('div').parentElement
    expect(within(comingUp).getByText('Midterm')).toBeInTheDocument()
  })

  it('flags the next exam on the header, where it is visible while collapsed', () => {
    renderPanel({ canvasClassEvents: events })
    expect(screen.getByText(/Exam Mar 4/)).toBeInTheDocument()
  })

  it('opens a meeting in the detail view when clicked', async () => {
    const onEventClick = vi.fn()
    renderPanel({ canvasClassEvents: events, onEventClick })
    await userEvent.click(screen.getByText('Midterm'))
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Midterm' }))
  })
})

describe('ClassesPanel — the Canvas link is an enrichment, not a precondition', () => {
  const assignments = [
    { id: 'a1', title: 'Problem set 3', courseId: 42, courseName: 'Physics 101', dueAt: '2026-03-05T23:59:00', score: 45, pointsPossible: 50 },
    { id: 'a2', title: 'Lab 4',         courseId: 42, courseName: 'Physics 101', dueAt: '2026-03-09T23:59:00', pointsPossible: 50 },
    { id: 'a3', title: 'Elsewhere',     courseId: 99, courseName: 'Chem 210',    dueAt: '2026-03-05T23:59:00' },
  ]

  it('shows nothing Canvas-shaped for an unlinked class', () => {
    renderPanel({ canvasAssignments: assignments })
    expect(screen.queryByText('Canvas assignments')).not.toBeInTheDocument()
    expect(screen.queryByText('Problem set 3')).not.toBeInTheDocument()
  })

  it('pulls in the linked course’s assignments, and only those', () => {
    renderPanel({ canvasClasses: [makeClass({ canvasCourseId: 42 })], canvasAssignments: assignments })
    expect(screen.getByText('Problem set 3')).toBeInTheDocument()
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument()
  })

  it('summarises the grade from what has been graded so far', () => {
    renderPanel({ canvasClasses: [makeClass({ canvasCourseId: 42 })], canvasAssignments: assignments })
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText(/1\/2 graded/)).toBeInTheDocument()
  })

  // study_sessions.courseId is a Canvas id, so an unlinked class has nothing to show.
  it('shows study time only for a linked class', () => {
    const sessions = [{ id: 's1', courseId: 42, durationSec: 3600, date: '2026-03-01' }]
    const { unmount } = renderPanel({ canvasClasses: [makeClass({ canvasCourseId: 42 })], studySessions: sessions })
    expect(screen.getByText('1h 0m')).toBeInTheDocument()
    unmount()
    renderPanel({ studySessions: sessions })
    expect(screen.queryByText('1h 0m')).not.toBeInTheDocument()
  })
})

describe('ClassesPanel — reminder rules', () => {
  it('saves a rule onto the class, leaving its other fields alone', async () => {
    const onSaveClass = vi.fn()
    renderPanel({ canvasClasses: [makeClass({ exceptions: { cancelled: ['2026-03-09'] } })], onSaveClass })
    await userEvent.click(screen.getByRole('button', { name: '2 days before, Tasks due' }))
    expect(onSaveClass).toHaveBeenCalledWith(expect.objectContaining({
      id: 'c1',
      courseName: 'Physics 101',
      exceptions: { cancelled: ['2026-03-09'] },
      reminders: { tasks: [{ ms: 2 * DAY, label: '2 days before' }], exams: [] },
    }))
  })
})

describe('ClassesPanel — header summary', () => {
  it('counts the classes you are taking and the work outstanding', () => {
    renderPanel({
      canvasClasses: [makeClass(), makeClass({ id: 'c2', courseName: 'Chem 210', enabled: false })],
      todos: [{ id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-04' }],
    })
    expect(screen.getByText(/1 class · 1 open task/)).toBeInTheDocument()
  })
})
