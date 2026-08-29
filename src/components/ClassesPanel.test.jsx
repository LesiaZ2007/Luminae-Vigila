/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
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

/**
 * The panel opens on the calendar, so anything asserting about the cards has to ask
 * for them. `view: 'calendar'` opts back out for the calendar's own cases.
 */
function renderPanel({ view = 'classes', ...props } = {}) {
  const result = render(
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
  if (view === 'classes') {
    fireEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
  }
  return result
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

  it('offers to connect Canvas from the empty state, but does not require it', () => {
    render(<ClassesPanel canvasClasses={[]} onAddClass={vi.fn()} onOpenCanvasSettings={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Connect Canvas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add class/ })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
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

describe('ClassesPanel — Canvas courses with no schedule entry', () => {
  const assignments = [
    { id: 'a1', title: 'Essay',      courseId: 7,  courseName: 'History 100', dueAt: '2026-03-05T23:59:00' },
    { id: 'a2', title: 'Problem set', courseId: 42, courseName: 'Physics 101', dueAt: '2026-03-05T23:59:00' },
  ]

  /* Folding the Courses tab in must not lose the rows it used to show. A Canvas
     course nobody typed in as a class still gets a card. */
  it('still lists a Canvas course that has no class entry', () => {
    render(
      <ClassesPanel
        canvasClasses={[]} todos={[]} canvasClassEvents={[]} notes={[]} studySessions={[]}
        canvasAssignments={assignments}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
    expect(screen.getByText('History 100')).toBeInTheDocument()
    expect(screen.getByText('Essay')).toBeInTheDocument()
  })

  it('does not duplicate a course a class already claims', () => {
    renderPanel({ canvasClasses: [makeClass({ canvasCourseId: 42 })], canvasAssignments: assignments })
    // Physics appears once — as the class, not also as a loose Canvas course.
    expect(screen.getAllByText('Physics 101')).toHaveLength(1)
    expect(screen.getByText('History 100')).toBeInTheDocument()
  })

  // Reminder rules live on the schedule entry, so a Canvas-only course has nowhere
  // to keep one until it becomes a real class.
  it('offers to give a Canvas course meeting times instead of reminder chips', async () => {
    const onAdoptCourse = vi.fn()
    render(
      <ClassesPanel
        canvasClasses={[]} todos={[]} canvasClassEvents={[]} notes={[]} studySessions={[]}
        canvasAssignments={assignments} onAdoptCourse={onAdoptCourse}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
    expect(screen.queryByRole('button', { name: /Tasks due/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /Add meeting times/ })[0])
    expect(onAdoptCourse).toHaveBeenCalledWith(expect.objectContaining({ courseId: 7, courseName: 'History 100' }))
  })
})

describe('ClassesPanel — Canvas chrome appears only with Canvas', () => {
  it('hides sync and settings until Canvas is connected', () => {
    renderPanel({ onSyncCanvas: vi.fn(), onOpenCanvasSettings: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Sync Canvas' })).not.toBeInTheDocument()
  })

  it('shows sync, settings and bulk select once it is', () => {
    renderPanel({
      canvasClasses: [makeClass({ canvasCourseId: 42 })],
      canvasAssignments: [{ id: 'a1', title: 'Problem set', courseId: 42, dueAt: '2026-03-05T23:59:00' }],
      canvasConnected: true, onSyncCanvas: vi.fn(), onOpenCanvasSettings: vi.fn(),
    })
    expect(screen.getByRole('button', { name: 'Sync Canvas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Canvas settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })

  it('marks a batch of assignments done in one go', async () => {
    const onToggleAssignment = vi.fn()
    renderPanel({
      canvasClasses: [makeClass({ canvasCourseId: 42 })],
      canvasAssignments: [
        { id: 'a1', title: 'Problem set', courseId: 42, dueAt: '2026-03-05T23:59:00' },
        { id: 'a2', title: 'Lab 4',       courseId: 42, dueAt: '2026-03-09T23:59:00', submissionState: 'graded' },
      ],
      canvasConnected: true, onToggleAssignment,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Select' }))
    // In select mode the header reads "Cancel" and every row offers its own "Select".
    for (const box of screen.getAllByRole('button', { name: 'Select' })) {
      await userEvent.click(box)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onToggleAssignment).toHaveBeenCalledTimes(1)
    expect(onToggleAssignment).toHaveBeenCalledWith('a1')
  })
})

describe('ClassesPanel — this week', () => {
  const todos = [
    { id: 't1', title: 'Due this week', category: 'class:c1', dueDate: '2026-03-04' },
    { id: 't2', title: 'Due much later', category: 'class:c1', dueDate: '2026-04-20' },
  ]

  it('shows everything by default', () => {
    renderPanel({ todos })
    expect(screen.getByText('Due much later')).toBeInTheDocument()
  })

  it('narrows the work to the current week when asked', async () => {
    renderPanel({ todos })
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(screen.getByText('Due this week')).toBeInTheDocument()
    expect(screen.queryByText('Due much later')).not.toBeInTheDocument()
  })

  // Saying "nothing outstanding" when two things are outstanding but not this week
  // would be a lie the filter told on the class's behalf.
  it('says what the filter hid rather than claiming the class is clear', async () => {
    renderPanel({ todos: [{ id: 't2', title: 'Due much later', category: 'class:c1', dueDate: '2026-04-20' }] })
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(screen.getByText(/Nothing due this week — 1 outstanding overall\./)).toBeInTheDocument()
  })
})

describe('ClassesPanel — the calendar is the main spread', () => {
  const todos = [
    { id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-12' },
  ]
  const events = [
    meeting('2026-03-04', {
      title: 'Midterm', color: '#ef4444',
      extendedProps: { source: 'canvas-class', classId: 'c1', category: 'exam', isExam: true },
    }),
  ]

  it('opens on the calendar, not the class cards', () => {
    renderPanel({ view: 'calendar', todos })
    expect(screen.getByText('March 2026')).toBeInTheDocument()
    // A card detail would only be on screen in the Classes view.
    expect(screen.queryByText('Dr. Vane')).not.toBeInTheDocument()
  })

  it('puts coursework from every class on the month', () => {
    renderPanel({ view: 'calendar', todos, canvasClassEvents: events })
    expect(screen.getByTitle(/Lab report/)).toBeInTheDocument()
    expect(screen.getByTitle(/Midterm/)).toBeInTheDocument()
  })

  // The calendar tab already shows every lecture. Here they would bury the four
  // things that actually have deadlines.
  it('leaves ordinary class meetings off', () => {
    renderPanel({ view: 'calendar', canvasClassEvents: [meeting('2026-03-04')] })
    expect(screen.queryByTitle(/Physics 101 \(002\)/)).not.toBeInTheDocument()
  })

  it('shows the selected day in full underneath, starting on today', () => {
    renderPanel({ view: 'calendar', canvasClassEvents: events })
    // "Today" is both the jump-to button and the strip's heading, so assert on the
    // heading's own copy rather than the ambiguous word.
    expect(screen.getByText('Nothing due today.')).toBeInTheDocument()
  })

  it('fills the day strip when a day with work is picked', async () => {
    renderPanel({ view: 'calendar', canvasClassEvents: events })
    await userEvent.click(screen.getByTitle(/2026-03-04: 1 exam/))
    expect(screen.getByText('Wednesday, March 4')).toBeInTheDocument()
    expect(screen.getAllByText('Midterm').length).toBeGreaterThan(0)
  })

  it('opens a task in the task editor rather than a view of its own', async () => {
    const onTodoClick = vi.fn()
    renderPanel({ view: 'calendar', todos, onTodoClick })
    await userEvent.click(screen.getByTitle(/Lab report/))
    expect(onTodoClick).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('opens an exam in the event detail view', async () => {
    const onEventClick = vi.fn()
    renderPanel({ view: 'calendar', canvasClassEvents: events, onEventClick })
    await userEvent.click(screen.getByTitle(/Midterm/))
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Midterm' }))
  })

  it('ticks a task off from the day strip', async () => {
    const onToggleTodo = vi.fn()
    renderPanel({ view: 'calendar', todos, onToggleTodo })
    await userEvent.click(screen.getByTitle(/2026-03-12: 1 task/))
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onToggleTodo).toHaveBeenCalledWith('t1')
  })

  it('pages to another month and back to today', async () => {
    renderPanel({ view: 'calendar' })
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('April 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('counts what is still outstanding in the month on screen', () => {
    renderPanel({
      view: 'calendar',
      todos: [
        ...todos,
        { id: 't2', title: 'Done already', category: 'class:c1', dueDate: '2026-03-13', completed: true },
        { id: 't3', title: 'Next month', category: 'class:c1', dueDate: '2026-04-13' },
      ],
    })
    expect(screen.getByText('1 outstanding')).toBeInTheDocument()
  })

  // Narrowing a month view to one week is not a filter so much as a lie about
  // the month you are looking at.
  it('offers the week filter only on the cards', async () => {
    renderPanel({ view: 'calendar', todos })
    expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Classes$/ }))
    expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()
  })
})

describe('ClassesPanel — header summary', () => {
  it('counts the classes you are taking and the work outstanding', () => {
    renderPanel({
      canvasClasses: [makeClass(), makeClass({ id: 'c2', courseName: 'Chem 210', enabled: false })],
      todos: [{ id: 't1', title: 'Lab report', category: 'class:c1', dueDate: '2026-03-04' }],
    })
    expect(screen.getByText(/1 class · 1 open/)).toBeInTheDocument()
  })
})
