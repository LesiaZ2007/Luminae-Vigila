/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dialog, { ConfirmDialog, EXIT_MS, useDialogExit } from './Dialog'
import { isDialogOpen } from '@/lib/dialogStack'

afterEach(cleanup)

const backdropOf = name => screen.getByRole('dialog', { name }).parentElement

/** A parent that unmounts its dialog on close, the way every caller in the app does. */
function Closable({ name = 'Outer', onClosed, children, ...props }) {
  const [open, setOpen] = useState(true)
  if (!open) return <button>opener</button>
  return (
    <Dialog label={name} onClose={() => { onClosed?.(); setOpen(false) }} {...props}>
      {children ?? <button>inside {name}</button>}
    </Dialog>
  )
}

describe('Dialog — markup', () => {
  it('portals a labelled modal dialog onto <body>', () => {
    const { container } = render(<Dialog label="Settings" onClose={() => {}}><p>hi</p></Dialog>)
    const panel = screen.getByRole('dialog', { name: 'Settings' })
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('tabindex')).toBe('-1')
    expect(panel.classList.contains('modal-surface')).toBe(true)
    expect(container.contains(panel)).toBe(false)
    expect(document.body.contains(panel)).toBe(true)
  })

  it('prefers aria-labelledby when given one', () => {
    render(
      <Dialog labelledBy="t" label="ignored" onClose={() => {}}>
        <h2 id="t">Edit task</h2>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeTruthy()
  })

  it('uses the shared backdrop', () => {
    render(<Dialog label="X" onClose={() => {}} />)
    const backdrop = backdropOf('X')
    expect(backdrop.classList.contains('dialog-backdrop')).toBe(true)
    expect(backdrop.classList.contains('modal-backdrop')).toBe(true)
  })

  it('registers with the dialog stack while mounted', () => {
    const { unmount } = render(<Dialog label="X" onClose={() => {}} />)
    expect(isDialogOpen()).toBe(true)
    unmount()
    expect(isDialogOpen()).toBe(false)
  })
})

describe('Dialog — Escape', () => {
  it('closes only the top one of two nested dialogs', async () => {
    const user = userEvent.setup()
    const outer = vi.fn(), inner = vi.fn()
    render(
      <Closable name="Outer" onClosed={outer}>
        <Closable name="Inner" onClosed={inner} />
      </Closable>,
    )

    await user.keyboard('{Escape}')

    await waitFor(() => expect(inner).toHaveBeenCalledTimes(1))
    expect(outer).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy()
  })

  it('then closes the next one on the next press', async () => {
    const user = userEvent.setup()
    const outer = vi.fn()
    render(
      <Closable name="Outer" onClosed={outer}>
        <Closable name="Inner" />
      </Closable>,
    )

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull())
    await user.keyboard('{Escape}')

    await waitFor(() => expect(outer).toHaveBeenCalledTimes(1))
  })

  // The contract: whatever uses Escape inside the dialog calls preventDefault.
  it('stays open when something inside used the key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog label="X" onClose={onClose}>
        <input aria-label="rename" onKeyDown={e => { if (e.key === 'Escape') e.preventDefault() }} />
      </Dialog>,
    )

    await user.click(screen.getByLabelText('rename'))
    await user.keyboard('{Escape}')
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does nothing when not dismissible', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Dialog label="X" dismissible={false} onClose={onClose}><button>ok</button></Dialog>)

    await user.keyboard('{Escape}')
    await user.click(backdropOf('X'))
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onClose).not.toHaveBeenCalled()
  })

  // A dialog that has to be answered must not let Escape through to the one below.
  it('does not let a non-dismissible dialog pass Escape down', async () => {
    const user = userEvent.setup()
    const outer = vi.fn()
    render(
      <Closable name="Outer" onClosed={outer}>
        <Dialog label="Must answer" dismissible={false} onClose={() => {}} />
      </Closable>,
    )

    await user.keyboard('{Escape}')
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(outer).not.toHaveBeenCalled()
  })
})

describe('Dialog — backdrop', () => {
  it('closes on a click on the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Dialog label="X" onClose={onClose}><button>ok</button></Dialog>)

    await user.click(backdropOf('X'))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('ignores a click inside the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Dialog label="X" onClose={onClose}><button>ok</button></Dialog>)

    await user.click(screen.getByText('ok'))
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onClose).not.toHaveBeenCalled()
  })

  // A text selection dragged out of a field and released over the backdrop.
  it('ignores a press that started inside the panel and ended on the backdrop', async () => {
    const onClose = vi.fn()
    render(<Dialog label="X" onClose={onClose}><input aria-label="title" /></Dialog>)

    fireEvent.pointerDown(screen.getByLabelText('title'))
    fireEvent.click(backdropOf('X'))
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onBackdropClick instead of onClose when given', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn(), onBackdropClick = vi.fn()
    render(<Dialog label="X" onClose={onClose} onBackdropClick={onBackdropClick} />)

    await user.click(backdropOf('X'))
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onBackdropClick).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not pass a click on to whatever rendered the dialog', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <div onClick={onRowClick}>
        <Dialog label="X" onClose={() => {}}><button>inside</button></Dialog>
      </div>,
    )

    await user.click(screen.getByText('inside'))

    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('Dialog — exit fade', () => {
  it('plays .modal-closing for the fade, then calls onClose', () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(<Dialog label="X" onClose={onClose} />)

      fireEvent.keyDown(document.body, { key: 'Escape' })

      expect(screen.getByRole('dialog').classList.contains('modal-closing')).toBe(true)
      expect(backdropOf('X').classList.contains('modal-closing')).toBe(true)
      expect(onClose).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(EXIT_MS) })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes once, however many times Escape is pressed during the fade', () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(<Dialog label="X" onClose={onClose} />)

      fireEvent.keyDown(document.body, { key: 'Escape' })
      fireEvent.keyDown(document.body, { key: 'Escape' })
      act(() => { vi.advanceTimersByTime(EXIT_MS * 2) })

      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // A caller that fades its own buttons hands `closing` in; the dialog then leaves the
  // timing to it rather than fading twice.
  it('calls onClose at once when the caller manages the fade', () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(<Dialog label="X" closing={false} onClose={onClose} />)
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('useDialogExit fades the caller’s own buttons the same way', () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      function Modal() {
        const [closing, close] = useDialogExit(onClose)
        return (
          <Dialog label="X" closing={closing} onClose={close}>
            <button onClick={() => close()}>Cancel</button>
          </Dialog>
        )
      }
      render(<Modal />)

      fireEvent.click(screen.getByText('Cancel'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.getByRole('dialog').classList.contains('modal-closing')).toBe(true)
      act(() => { vi.advanceTimersByTime(EXIT_MS) })

      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Dialog — focus', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<Dialog label="X" onClose={() => {}}><button>ok</button></Dialog>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('leaves an autoFocus field focused', () => {
    render(<Dialog label="X" onClose={() => {}}><input aria-label="title" autoFocus /></Dialog>)
    expect(document.activeElement).toBe(screen.getByLabelText('title'))
  })

  it('wraps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button>behind</button>
        <Dialog label="X" onClose={() => {}}>
          <button>first</button>
          <button>last</button>
        </Dialog>
      </>,
    )

    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('last'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('last'))
  })

  it('wraps Tab in the top dialog only', async () => {
    const user = userEvent.setup()
    render(
      <Closable name="Outer">
        <Closable name="Inner">
          <button>a</button>
          <button>b</button>
        </Closable>
      </Closable>,
    )

    screen.getByText('b').focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('a'))
  })

  it('gives focus back to what had it before, on close', async () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          {open && <Dialog label="X" closing={false} onClose={() => setOpen(false)}><button>ok</button></Dialog>}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByText('open'))
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('open')))
  })
})

describe('ConfirmDialog', () => {
  function renderConfirm(props = {}) {
    const onConfirm = vi.fn(), onCancel = vi.fn()
    render(
      <ConfirmDialog title="Delete “Groceries”?" message="This cannot be undone."
                     confirmLabel="Delete list" destructive
                     onConfirm={onConfirm} onCancel={onCancel} {...props} />,
    )
    return { onConfirm, onCancel }
  }

  it('is an alertdialog named by its title', () => {
    renderConfirm()
    expect(screen.getByRole('alertdialog', { name: 'Delete “Groceries”?' })).toBeTruthy()
  })

  it('starts on Cancel for a destructive action', () => {
    renderConfirm()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('confirms', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderConfirm()
    await user.click(screen.getByRole('button', { name: 'Delete list' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on Escape', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = renderConfirm()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels on the backdrop', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderConfirm()
    await user.click(screen.getByRole('alertdialog').parentElement)
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  })
})
