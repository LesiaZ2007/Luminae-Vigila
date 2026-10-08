'use client'

/**
 * Dialog — the one shell every modal in the planner is drawn in.
 *
 * There used to be sixteen hand-built ones, and they had drifted apart: five different
 * backdrops, Escape handled by some and ignored by others, a click-outside that also
 * fired when a text selection was dragged out of the panel, and no focus handling at
 * all. This is where those decisions now live, once.
 *
 *  • Rendered in a portal on <body>. A modal opened from inside the floating Corvus
 *    panel, or from anything with a transform, used to inherit that ancestor's
 *    stacking context — the panel's z-index capped it, and `position: fixed` children
 *    were placed against the wrong box.
 *
 *  • Escape closes the topmost layer only (lib/dialogStack.js). Something inside the
 *    dialog that uses Escape itself — a rename field, a dropdown — calls
 *    `e.preventDefault()`, and the dialog stays open.
 *
 *  • The backdrop only counts as clicked when the press *started* on it. A drag that
 *    selects text in a field and is released over the backdrop used to dismiss the
 *    dialog, and in the event and task forms — where clicking outside saves — it
 *    saved a half-edited form.
 *
 *  • Focus moves into the dialog when it opens (unless an autoFocus field already
 *    took it), Tab and Shift+Tab wrap inside the topmost dialog, and when the dialog
 *    goes away focus returns to whatever had it before — the button that opened it,
 *    usually — so a keyboard user is not dropped at the top of the page.
 *
 *  • A popover opened from the dialog is part of it. Select, DatePicker and
 *    TimePicker portal into the dialog's root (usePopoverContainer) rather than onto
 *    <body>. On <body> they are outside the dialog: the Tab trap wraps from the
 *    panel's last field back to its first without ever reaching an open menu — so a
 *    form's date, category or priority cannot be changed from the keyboard — and
 *    `aria-modal` tells screen readers the menus are not there at all.
 *
 *    The DOM, and why it is shaped like this:
 *
 *      .dialog-root   role, aria-modal, the label; no z-index, transform or filter
 *        .dialog-backdrop   the scrim (fixed, z-index, backdrop-filter)
 *          .dialog-panel    the panel (animated with a transform)
 *        …popovers          appended here, after the backdrop
 *
 *    The popovers are siblings of the backdrop, not inside it, and nowhere near the
 *    panel. The panel's entrance animation leaves a transform on it, which makes it
 *    the containing block for `position: fixed` children — a menu in it would be
 *    placed against the panel, not the viewport. The backdrop has a z-index and a
 *    backdrop-filter, and either would confine a menu's z-index to the dialog's own
 *    tier, under the toasts. The root sets none of that, so a popover in it is placed
 *    against the viewport and stacked against the whole page exactly as it was on
 *    <body> — above the toasts too.
 *
 * Stacking tiers (z-index, see globals.css `--z-dialog`):
 *    ≤ 500   page chrome — the floating Corvus panel, menus
 *    2001    focus timer panel ·  3000  offline / sync pill
 *    3500    dialogs (this)
 *    3600    toasts — above dialogs, so one raised while a dialog is open is seen
 *    4000    focus timer full-screen — it covers everything, dialogs included
 *    6000+   popovers: selects, date and time pickers, task and day menus. These are
 *            opened *from* dialogs, so they must sit above every one of them.
 *
 * Closing. Escape and the backdrop play the exit fade (`.modal-closing`, 180 ms) and
 * then call `onClose`. A modal with buttons of its own that should fade too uses
 * `useDialogExit` and passes the resulting `closing` in — the dialog then calls
 * `onClose` straight away, since the caller's close already fades.
 *
 * Props:
 *   onClose          Escape, and the backdrop unless onBackdropClick is given
 *   onBackdropClick  replaces the backdrop's action — the event and task forms save
 *   dismissible      false: neither Escape nor the backdrop does anything
 *   closing          see "Closing" above
 *   align            'center' | 'bottom-on-mobile' (a sheet on phones)
 *   maxWidth, className, panelStyle — the panel's own look
 *   label | labelledBy, describedBy, role ('dialog' | 'alertdialog')
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useDialogLayer, isTopLayer } from '@/lib/dialogStack'

/** The exit fade, matching `.modal-closing` in globals.css. */
export const EXIT_MS = 180

/** The root element of the dialog a component is rendered in, or null outside one. */
const DialogRoot = createContext(null)

/**
 * Where a popover should portal to: the root of the dialog it was opened from, or
 * <body> when it is not in one — see "A popover opened from the dialog" above.
 * Null during the server render, when there is nowhere to portal to.
 */
export function usePopoverContainer() {
  const root = useContext(DialogRoot)
  if (root) return root
  return typeof document === 'undefined' ? null : document.body
}

const TABBABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]',
].join(',')

function tabbablesIn(root) {
  const all = [...root.querySelectorAll(TABBABLE)]
    .filter(el => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'))
  // Only a real browser lays anything out; jsdom gives every element an empty box.
  const shown = all.filter(el => el.getClientRects().length > 0)
  return shown.length ? shown : all
}

const subscribeNothing = () => () => {}
/** False during the server render and hydration, true after — there is no <body> to portal into before that. */
function useIsClient() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false)
}

/**
 * The exit fade for a modal's own buttons: `[closing, close]`. `close()` sets
 * `closing`, waits out the fade and then calls `onClose()`. Only the first call
 * counts — a second click during the fade must not close (or save) twice.
 *
 * `close` takes no arguments and passes none on, so it can be handed straight to an
 * `onClick` without the click event turning up in the parent's onClose.
 */
export function useDialogExit(onClose, ms = EXIT_MS) {
  const [closing, setClosing] = useState(false)
  const latest = useRef(onClose)
  const timer  = useRef(null)
  useLayoutEffect(() => { latest.current = onClose })

  const close = useCallback(() => {
    if (timer.current) return
    setClosing(true)
    // Not cleared on unmount, on purpose: if the parent removes the modal mid-fade,
    // its onClose still has to run — that is where it resets its own state.
    timer.current = setTimeout(() => latest.current?.(), ms)
  }, [ms])

  return [closing, close]
}

export default function Dialog({
  children,
  onClose,
  onBackdropClick,
  dismissible = true,
  closing: closingProp,
  align = 'center',
  maxWidth,
  className = '',
  panelStyle,
  label,
  labelledBy,
  describedBy,
  role = 'dialog',
}) {
  const controlled = closingProp !== undefined
  const [fading, fadeOut] = useDialogExit(onClose)
  const closing  = controlled ? !!closingProp : fading
  const isClient = useIsClient()
  const panelRef = useRef(null)
  const rootRef  = useRef(null)
  // The root again, as state: popovers inside read it through context while
  // rendering, which a ref cannot be read during.
  const [rootEl, setRootEl] = useState(null)
  const setRoot = useCallback(el => { rootRef.current = el; setRootEl(el) }, [])
  const mounted  = useRef(false)
  const pressedOnBackdrop = useRef(false)
  // Read during the first render, before an autoFocus inside the dialog moves focus.
  const [returnTo] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))

  const latest = useRef(null)
  useLayoutEffect(() => { latest.current = { onClose, onBackdropClick, dismissible, closing, controlled } })

  const dismiss = useCallback(via => {
    const p = latest.current
    // Mid-fade the dialog is already going; a second Escape or click must not fire again.
    if (!p || !p.dismissible || p.closing) return
    if (via === 'backdrop' && p.onBackdropClick) p.onBackdropClick()
    else if (p.controlled) p.onClose?.()
    else fadeOut()
  }, [fadeOut])

  // Always registered, even when not dismissible: the layer still has to swallow
  // Escape so it cannot close whatever is underneath.
  const layer = useDialogLayer(() => dismiss('escape'))

  // Focus in on open, back out on close.
  useLayoutEffect(() => {
    if (!isClient) return
    const panel = panelRef.current
    const root  = rootRef.current
    if (!panel || !root) return
    mounted.current = true
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    return () => {
      mounted.current = false
      // A tick later, because StrictMode rehearses an unmount and remounts straight
      // away — focus must not jump out and back for that.
      queueMicrotask(() => {
        if (mounted.current) return
        const active = document.activeElement
        // Only if focus went down with the dialog (or one of its popovers). If
        // closing it opened something else that took focus (a note, another
        // dialog), leave that alone.
        const lost = !active || active === document.body || root.contains(active)
        if (lost && returnTo?.isConnected && typeof returnTo.focus === 'function') {
          returnTo.focus({ preventScroll: true })
        }
      })
    }
  }, [isClient, returnTo])

  // Tab wraps inside the topmost dialog.
  useEffect(() => {
    if (!isClient) return
    function onKeyDown(e) {
      if (e.key !== 'Tab' || e.defaultPrevented || !isTopLayer(layer.current)) return
      const panel = panelRef.current
      const root  = rootRef.current
      if (!panel || !root) return
      const active = document.activeElement
      // The root holds the panel and the popovers opened from it, so focus in an
      // open menu or calendar is inside too, and the cycle runs through them: the
      // panel's fields first, then each open popover's, in the order they opened.
      const inside = root.contains(active)
      // Focus somewhere else that wants it — a toast's Undo, say — is left alone.
      // Focus on <body> — after a press on the backdrop, or once the focused field
      // was removed — is brought back in. (The backdrop deliberately doesn't hold
      // focus on press: the blur is what commits an inline rename before a click
      // outside saves the form.)
      if (!inside && active && active !== document.body) return
      const items = tabbablesIn(root)
      if (items.length === 0) { e.preventDefault(); panel.focus({ preventScroll: true }); return }
      const first = items[0]
      const last  = items[items.length - 1]
      if (!inside) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isClient, layer])

  if (!isClient) return null

  const style = maxWidth != null ? { maxWidth, ...panelStyle } : panelStyle

  return createPortal(
    <div
      ref={setRoot}
      className="dialog-root"
      role={role}
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <div
        className={`dialog-backdrop modal-backdrop${closing ? ' modal-closing' : ''}`}
        data-align={align}
        onPointerDown={e => {
          // A popover is not inside the backdrop in the DOM, but its React events
          // still bubble here, through the panel it was opened from — with a target
          // that is not the backdrop, so a press in a menu never counts as outside.
          pressedOnBackdrop.current = e.target === e.currentTarget
        }}
        onClick={e => {
          // A click inside a dialog is not a click on whatever the dialog was opened from.
          // Portals bubble React events up the component tree, not the DOM, so without
          // this a click in, say, a task's detail dialog also reached the task row.
          e.stopPropagation()
          const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget
          pressedOnBackdrop.current = false
          if (onBackdrop) dismiss('backdrop')
        }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className={`modal-surface dialog-panel${className ? ` ${className}` : ''}${closing ? ' modal-closing' : ''}`}
          style={style}
        >
          <DialogRoot value={rootEl}>{children}</DialogRoot>
        </div>
      </div>
      {/* Popovers opened from the panel are portaled in here (usePopoverContainer). */}
    </div>,
    document.body,
  )
}

/**
 * A yes/no question, drawn the way the list-delete confirms were. Replaces
 * `window.confirm`, which can't be styled, blocks the whole tab, and on Android in
 * the installed app sometimes never appears at all.
 *
 * Escape and the backdrop mean Cancel. For a destructive action focus starts on
 * Cancel, so an Enter pressed out of habit does not delete anything.
 */
export function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false, onConfirm, onCancel,
}) {
  // Whichever was pressed runs once the fade is over, so the parent can simply
  // unmount the dialog in its handler. The first answer is the one that counts.
  const answer = useRef(null)
  const [closing, close] = useDialogExit(() => answer.current?.())
  const finish = action => {
    if (answer.current) return
    answer.current = action ?? (() => {})
    close()
  }
  const cancel = () => finish(onCancel)

  return (
    <Dialog
      role="alertdialog"
      label={title}
      closing={closing}
      onClose={cancel}
      panelStyle={{ width: 'min(320px, 100%)', borderRadius: 16, padding: '24px 20px 18px' }}
    >
      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>{title}</p>
      {message && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={cancel} autoFocus={destructive}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {cancelLabel}
        </button>
        <button type="button" onClick={() => finish(onConfirm)} autoFocus={!destructive}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: destructive ? 'var(--red)' : 'var(--blue)', color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
