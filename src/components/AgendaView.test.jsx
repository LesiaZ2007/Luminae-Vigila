/**
 * @vitest-environment jsdom
 *
 * The agenda previously dropped anything with a due date before today, so work
 * you missed vanished from the one view meant to tell you what needs doing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AgendaView from './AgendaView'
import { todayStr, addDaysStr } from '@/lib/localDate'

const todo = (over = {}) => ({
  id: 't1', title: 'Read chapter 4', dueDate: todayStr(), completed: false, ...over,
})

describe('AgendaView overdue handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a task that was due before today', () => {
    render(<AgendaView todos={[todo({ title: 'Late essay', dueDate: addDaysStr(-3) })]} />)
    expect(screen.getByText('Late essay')).toBeInTheDocument()
  })

  it('groups overdue work under its own heading', () => {
    render(<AgendaView todos={[todo({ title: 'Late essay', dueDate: addDaysStr(-3) })]} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('puts the overdue group before today', () => {
    const { container } = render(
      <AgendaView todos={[
        todo({ id: 'a', title: 'Due now',  dueDate: todayStr() }),
        todo({ id: 'b', title: 'Late one', dueDate: addDaysStr(-2) }),
      ]} />
    )
    const text = container.textContent
    expect(text.indexOf('Overdue')).toBeLessThan(text.indexOf('Today'))
  })

  it('orders overdue oldest-first — the most late is the most urgent', () => {
    const { container } = render(
      <AgendaView todos={[
        todo({ id: 'recent',  title: 'Recent',  dueDate: addDaysStr(-1) }),
        todo({ id: 'ancient', title: 'Ancient', dueDate: addDaysStr(-9) }),
      ]} />
    )
    const text = container.textContent
    expect(text.indexOf('Ancient')).toBeLessThan(text.indexOf('Recent'))
  })

  it('says how late each item is', () => {
    render(<AgendaView todos={[todo({ dueDate: addDaysStr(-1) })]} />)
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('does not resurrect completed work', () => {
    render(<AgendaView todos={[todo({ title: 'Done late', dueDate: addDaysStr(-3), completed: true })]} />)
    expect(screen.queryByText('Done late')).not.toBeInTheDocument()
  })

  it('includes overdue Canvas assignments but not done or hidden ones', () => {
    render(
      <AgendaView canvasAssignments={[
        { id: 'a1', title: 'Late lab',   dueAt: `${addDaysStr(-2)}T23:59:00` },
        { id: 'a2', title: 'Done lab',   dueAt: `${addDaysStr(-2)}T23:59:00`, done: true },
        { id: 'a3', title: 'Hidden lab', dueAt: `${addDaysStr(-2)}T23:59:00`, hidden: true },
      ]} />
    )
    expect(screen.getByText('Late lab')).toBeInTheDocument()
    expect(screen.queryByText('Done lab')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden lab')).not.toBeInTheDocument()
  })

  it('includes overdue custom-list items, skipping checked ones', () => {
    render(
      <AgendaView customLists={[{
        id: 'l1', name: 'Packing', color: '#3a6fa8',
        items: [
          { id: 'i1', text: 'Passport', dueDate: addDaysStr(-4) },
          { id: 'i2', text: 'Charger',  dueDate: addDaysStr(-4), checked: true },
        ],
      }]} />
    )
    expect(screen.getByText('Passport')).toBeInTheDocument()
    expect(screen.queryByText('Charger')).not.toBeInTheDocument()
  })

  it('leaves future work in its own day, not the overdue group', () => {
    render(<AgendaView todos={[todo({ title: 'Later', dueDate: addDaysStr(3) })]} />)
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
    expect(screen.getByText('Later')).toBeInTheDocument()
  })

  it('still shows the empty state when there is genuinely nothing', () => {
    render(<AgendaView />)
    expect(screen.getByText(/Nothing overdue or in the next 14 days/)).toBeInTheDocument()
  })

  it('counts the overdue group correctly in its header', () => {
    render(
      <AgendaView todos={[
        todo({ id: 'a', title: 'One', dueDate: addDaysStr(-1) }),
        todo({ id: 'b', title: 'Two', dueDate: addDaysStr(-2) }),
      ]} />
    )
    const heading = screen.getByText('Overdue').parentElement
    expect(within(heading).getByText('2 items')).toBeInTheDocument()
  })
})
