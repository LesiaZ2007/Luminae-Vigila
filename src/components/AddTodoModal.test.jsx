/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddTodoModal from './AddTodoModal'

afterEach(cleanup)

const CATEGORIES = [
  { id: 'academic', label: 'Academic', color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#8a6fa8' },
]

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onAdd   = vi.fn()
  render(
    <AddTodoModal
      events={[]}
      todoCategories={CATEGORIES}
      onAdd={onAdd}
      onEdit={() => {}}
      onClose={onClose}
      {...props}
    />,
  )
  return { onClose, onAdd }
}

const stepField = () => screen.getByPlaceholderText(/add a step/i)

/* Escape in the step field reached the modal's own Escape handler, so it tore down the
   whole form — losing the half-typed step and every other unsaved edit on the task with
   it. The modal is the only thing standing between the edits and nothing, so an
   accidental Escape there was expensive. */
describe('AddTodoModal — Escape in the step field', () => {
  it('adds the typed step instead of discarding it', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(stepField(), 'Find three sources')
    await user.keyboard('{Escape}')

    expect(screen.getByText('Find three sources')).toBeTruthy()
  })

  it('leaves the form open, so the rest of the edits survive', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.type(stepField(), 'Find three sources')
    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears the field, so the step is not added twice on the next Enter', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(stepField(), 'Find three sources')
    await user.keyboard('{Escape}')

    expect(stepField().value).toBe('')
  })

  // Nothing typed, nothing to lose — Escape still means what it means everywhere else.
  it('still closes the modal when the field is empty', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(stepField())
    await user.keyboard('{Escape}')

    // handleClose plays a 180ms exit animation before calling onClose.
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
