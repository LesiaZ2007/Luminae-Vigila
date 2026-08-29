/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClassRemindersEditor from './ClassRemindersEditor'

const DAY  = 24 * 60 * 60_000
const WEEK = 7 * DAY

function makeClass(over = {}) {
  return { id: 'c1', courseName: 'Physics 101', color: '#3a6fa8', enabled: true, ...over }
}

/**
 * A chip reads "2 days" but is *named* "2 days before, Tasks due" — both rows offer
 * some of the same offsets, so the row has to be part of the accessible name.
 */
function chip(kind, label) {
  return screen.getByRole('button', { name: `${label}, ${kind === 'tasks' ? 'Tasks due' : 'Exams'}` })
}

afterEach(cleanup)

describe('ClassRemindersEditor', () => {
  it('starts with nothing selected and says so for both kinds', () => {
    render(<ClassRemindersEditor cls={makeClass()} onChange={vi.fn()} />)
    expect(screen.getByText('No reminder for coursework in this class.')).toBeInTheDocument()
    expect(screen.getByText(/No reminder for this class.s exams\./)).toBeInTheDocument()
  })

  it('marks the chips a stored rule selected, and only those', () => {
    render(<ClassRemindersEditor cls={makeClass({ reminders: { tasks: [{ ms: 2 * DAY }] } })} onChange={vi.fn()} />)
    expect(chip('tasks', '2 days before')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('tasks', '3 days before')).toHaveAttribute('aria-pressed', 'false')
  })

  it('adds an offset, with the label the rest of the app uses', async () => {
    const onChange = vi.fn()
    render(<ClassRemindersEditor cls={makeClass()} onChange={onChange} />)
    await userEvent.click(chip('tasks', '2 days before'))
    expect(onChange).toHaveBeenCalledWith({
      tasks: [{ ms: 2 * DAY, label: '2 days before' }],
      exams: [],
    })
  })

  // A week's warning *and* a nudge the day before is a normal want. Making the chips
  // exclusive would mean choosing which of the two to lose.
  it('keeps existing offsets when another is added, longest lead first', async () => {
    const onChange = vi.fn()
    render(<ClassRemindersEditor cls={makeClass({ reminders: { tasks: [{ ms: DAY, label: '1 day before' }] } })} onChange={onChange} />)
    await userEvent.click(chip('tasks', '1 week before'))
    expect(onChange.mock.calls[0][0].tasks.map(r => r.ms)).toEqual([WEEK, DAY])
  })

  it('removes an offset when its chip is clicked again', async () => {
    const onChange = vi.fn()
    render(<ClassRemindersEditor cls={makeClass({ reminders: { tasks: [{ ms: 2 * DAY, label: '2 days before' }] } })} onChange={onChange} />)
    await userEvent.click(chip('tasks', '2 days before'))
    expect(onChange).toHaveBeenCalledWith({ tasks: [], exams: [] })
  })

  it('keeps the two kinds independent', async () => {
    const onChange = vi.fn()
    render(<ClassRemindersEditor cls={makeClass({ reminders: { tasks: [{ ms: DAY, label: '1 day before' }] } })} onChange={onChange} />)
    await userEvent.click(chip('exams', '2 weeks before'))
    const next = onChange.mock.calls[0][0]
    expect(next.exams).toEqual([{ ms: 2 * WEEK, label: '2 weeks before' }])
    expect(next.tasks).toEqual([{ ms: DAY, label: '1 day before' }])
  })

  it('summarises several offsets as one readable line', () => {
    render(<ClassRemindersEditor cls={makeClass({ reminders: { exams: [{ ms: WEEK }, { ms: DAY }] } })} onChange={vi.fn()} />)
    expect(screen.getByText(/1 week and 1 day before each exam/)).toBeInTheDocument()
  })

  // Otherwise a task with its own reminder looks like the class rule silently failed.
  it('states the precedence rule where it can be acted on', () => {
    render(<ClassRemindersEditor cls={makeClass()} onChange={vi.fn()} />)
    expect(screen.getByText(/task with its own reminder keeps it/)).toBeInTheDocument()
  })

  // Reading through the validator rather than off the class means a bad stored rule
  // shows its cleaned-up state instead of a chip that does nothing.
  it('does not select a chip for a malformed stored rule', () => {
    render(<ClassRemindersEditor cls={makeClass({ reminders: { tasks: [{ ms: 'soon' }] } })} onChange={vi.fn()} />)
    expect(chip('tasks', '1 day before')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('No reminder for coursework in this class.')).toBeInTheDocument()
  })
})
