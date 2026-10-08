/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dialog, { ConfirmDialog, EXIT_MS, useDialogExit } from './Dialog'
import Select from './Select'
import DatePicker from './DatePicker'
import TimePicker from './TimePicker'
import { isDialogOpen } from '@/lib/dialogStack'

afterEach(cleanup)

// The role sits on the dialog's root, which holds the backdrop (and the panel inside
// it) and any popover opened from the panel.
const dialogOf   = name => screen.getByRole('dialog', name === undefined ? {} : { name })
const backdropOf = name => dialogOf(name).querySelector(':scope > .dialog-backdrop')
const panelOf    = name => backdropOf(name).querySelector(':scope > .dialog-panel')

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
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.classList.contains('dialog-root')).toBe(true)
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
  })

  it('draws the panel inside the backdrop, inside the dialog', () => {
    render(<Dialog label="Settings" onClose={() => {}}><p>hi</p></Dialog>)
    const panel = panelOf('Settings')
    expect(panel.getAttribute('tabindex')).toBe('-1')
    expect(panel.classList.contains('modal-surface')).toBe(true)
    expect(panel.textContent).toBe('hi')
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

      expect(panelOf('X').classList.contains('modal-closing')).toBe(true)
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
      expect(panelOf('X').classList.contains('modal-closing')).toBe(true)
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
    expect(document.activeElement).toBe(panelOf('X'))
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

/* A popover opened from a dialog used to be portaled onto <body>, outside it. The Tab
   trap then wrapped from the panel's last field to its first without ever reaching an
   open menu or calendar, and aria-modal hid them from screen readers. They now portal
   into the dialog's root: inside the dialog, but outside the animated panel. */
describe('Dialog — popovers opened from it', () => {
  const OPTIONS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]

  function Form({ onClose = () => {}, onChange = () => {} }) {
    const [value, setValue] = useState('a')
    return (
      <>
        <button>behind</button>
        <Dialog label="Form" onClose={onClose}>
          <button>first</button>
          <Select value={value} options={OPTIONS}
                  onChange={v => { onChange(v); setValue(v) }} />
        </Dialog>
      </>
    )
  }

  it('portals a Select menu into the dialog, beside the backdrop rather than in the panel', async () => {
    const user = userEvent.setup()
    render(<Form />)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    const option = screen.getByRole('button', { name: 'Beta' })

    expect(dialogOf('Form').contains(option)).toBe(true)
    expect(backdropOf('Form').contains(option)).toBe(false)
  })

  it('portals the date and time pickers into the dialog too', async () => {
    const user = userEvent.setup()
    render(
      <Dialog label="Form" onClose={() => {}}>
        <DatePicker value="2026-10-08" onChange={() => {}} />
        <TimePicker value="09:30" onChange={() => {}} />
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: /Oct 8, 2026/ }))
    const calendar = document.querySelector('[data-datepicker-popup]')
    expect(dialogOf('Form').contains(calendar)).toBe(true)
    expect(backdropOf('Form').contains(calendar)).toBe(false)

    await user.click(screen.getByTitle('Open clock picker'))
    const ok = screen.getByRole('button', { name: 'OK' })
    expect(dialogOf('Form').contains(ok)).toBe(true)
    expect(backdropOf('Form').contains(ok)).toBe(false)
  })

  it('still portals onto <body> outside a dialog', async () => {
    const user = userEvent.setup()
    render(<Select value="a" options={OPTIONS} onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))

    expect(screen.getByRole('button', { name: 'Beta' }).parentElement.parentElement).toBe(document.body)
  })

  // The category manager over the event form: its own menus belong to it, not the form.
  it('does not hand its root to a dialog opened inside it', async () => {
    const user = userEvent.setup()
    render(
      <Dialog label="Outer" onClose={() => {}}>
        <Dialog label="Inner" onClose={() => {}}>
          <Select value="a" options={OPTIONS} onChange={() => {}} />
        </Dialog>
      </Dialog>,
    )
    expect(dialogOf('Inner').parentElement).toBe(document.body)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    const option = screen.getByRole('button', { name: 'Beta' })
    expect(dialogOf('Inner').contains(option)).toBe(true)
    expect(dialogOf('Outer').contains(option)).toBe(false)
  })

  // The keyboard path that did not exist: on past the panel's last field, into the menu.
  it('Tab goes on from the panel’s last field into the open menu, then wraps', async () => {
    const user = userEvent.setup()
    render(<Form />)

    const trigger = screen.getByRole('button', { name: 'Alpha' })   // last in the panel
    await user.click(trigger)
    const menu = within(screen.getByRole('button', { name: 'Beta' }).parentElement)
    expect(document.activeElement).toBe(trigger)

    await user.tab()
    expect(document.activeElement).toBe(menu.getByRole('button', { name: 'Alpha' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Beta' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Beta' }))
  })

  it('reaches the date picker’s type-in field from the keyboard', async () => {
    const user = userEvent.setup()
    render(
      <Dialog label="Form" onClose={() => {}}>
        <button>first</button>
        <DatePicker value="2026-10-08" onChange={() => {}} />
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: /Oct 8, 2026/ }))
    await user.tab()

    expect(document.activeElement).toBe(screen.getByPlaceholderText('MM/DD/YYYY or YYYY-MM-DD'))
  })

  it('does not take a click in the menu for a click on the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn(), onChange = vi.fn()
    render(<Form onClose={onClose} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    await user.click(screen.getByRole('button', { name: 'Beta' }))
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(onChange).toHaveBeenCalledWith('b')
    expect(onClose).not.toHaveBeenCalled()
    expect(dialogOf('Form')).toBeTruthy()
  })

  // The event and task forms save on a click outside, so this one would save mid-edit.
  it('does not take a click in the calendar for a click outside a form that saves on one', async () => {
    const user = userEvent.setup()
    const onBackdropClick = vi.fn(), onChange = vi.fn()
    render(
      <Dialog label="Form" onClose={() => {}} onBackdropClick={onBackdropClick}>
        <DatePicker value="2026-10-08" onChange={onChange} />
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: /Oct 8, 2026/ }))
    await user.click(screen.getByRole('button', { name: '15' }))

    expect(onChange).toHaveBeenCalledWith('2026-10-15')
    expect(onBackdropClick).not.toHaveBeenCalled()
  })

  // Focus can be in the menu now, which it never was before; the menu still has the
  // first claim on Escape, and the dialog the next one.
  it('Escape in the open menu closes the menu alone, and the next one the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Form onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Beta' }).parentElement.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(screen.queryByRole('button', { name: 'Beta' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf('Form').classList.contains('modal-closing')).toBe(false)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('Escape in the date picker’s field closes the calendar, not the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog label="Form" onClose={onClose}>
        <DatePicker value="2026-10-08" onChange={() => {}} />
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: /Oct 8, 2026/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('MM/DD/YYYY or YYYY-MM-DD'))

    await user.keyboard('{Escape}')
    // Past both fades: the calendar's (160 ms) and the dialog's, had it started one.
    await act(() => new Promise(r => setTimeout(r, EXIT_MS + 20)))

    expect(document.querySelector('[data-datepicker-popup]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf('Form').classList.contains('modal-closing')).toBe(false)
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
    await user.click(screen.getByRole('alertdialog').querySelector('.dialog-backdrop'))
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  })
})
