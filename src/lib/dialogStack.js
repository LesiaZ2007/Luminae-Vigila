'use client'

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Which open layer a press of Escape belongs to.
 *
 * Every modal used to add its own `keydown` listener to `document`, and the planner
 * had a second dispatcher on `window`. Nothing decided between them, so one Escape
 * reached all of them: the category manager closed together with the event form it
 * was opened from, a dialog closed together with the focus timer behind it, and the
 * search popup — which had a listener of its own *and* a branch in the dispatcher —
 * was asked to close twice.
 *
 * Now there is one ordered stack of open layers and exactly one listener. Escape goes
 * to the topmost layer and nowhere else, so each press peels off one layer.
 *
 * ── The contract ──────────────────────────────────────────────────────────────
 *
 * Anything *inside* a dialog that wants Escape for itself — an inline rename, a time
 * picker, a dropdown — calls `e.preventDefault()` when it uses the key. The stack
 * ignores an Escape that has already been handled, so the dialog stays open and the
 * popover closes alone.
 *
 * This works because of where the listener sits: on `window`, in the bubble phase.
 * A keydown reaches `window` last. Next mounts React on `document` (hydrateRoot), so
 * every React `onKeyDown`, and every plain `document` listener a popover adds, has
 * already run by the time the stack looks at the event.
 *
 * `preventDefault`, not `stopPropagation`, because stopping propagation inside React
 * cannot reach the other `document` listeners — they sit on the same node as React's
 * root, and stopPropagation only skips nodes further up. In tests React mounts into a
 * `div`, where stopPropagation *does* keep the event from `document`, which is how an
 * Escape that closed a whole form in production passed in jsdom. preventDefault
 * behaves the same in both, and anything listening later can still see it.
 *
 * A layer with no handler still counts: it swallows Escape so the layers under it are
 * not closed by a key aimed at it (a dialog that must be answered, for instance).
 */

/** Open layers, bottom first. Each is { id, order, onEscape }. */
let layers = []
let nextId = 0
let nextOrder = 0
let installed = false
const subscribers = new Set()

function onKeyDown(e) {
  if (e.key !== 'Escape' && e.key !== 'Esc') return
  // Already used by something inside the dialog, or cancelling an IME composition.
  if (e.defaultPrevented || e.isComposing) return
  const top = layers[layers.length - 1]
  if (!top) return
  e.preventDefault()
  top.onEscape?.(e)
}

/** Keep the one window listener installed exactly while something is open. */
function syncListener() {
  if (typeof window === 'undefined') return
  const want = layers.length > 0
  if (want === installed) return
  if (want) window.addEventListener('keydown', onKeyDown)
  else      window.removeEventListener('keydown', onKeyDown)
  installed = want
}

function changed() {
  syncListener()
  subscribers.forEach(fn => fn())
}

/**
 * A place in the stacking order, taken when a dialog first *renders*.
 *
 * Effects run children-first, so a dialog that mounts in the same commit as one it is
 * nested in would register first and end up underneath. Render order is parent-first,
 * which is the order the layers are drawn in.
 */
export function reserveOrder() {
  nextOrder += 1
  return nextOrder
}

/** Open a layer. Returns its id, for removeLayer and isTopLayer. */
export function pushLayer(onEscape, order = reserveOrder()) {
  nextId += 1
  const id = nextId
  layers = [...layers, { id, order, onEscape }].sort((a, b) => a.order - b.order)
  changed()
  return id
}

export function removeLayer(id) {
  const next = layers.filter(l => l.id !== id)
  if (next.length === layers.length) return
  layers = next
  changed()
}

/** Whether any dialog is open — for a check made inside an event handler. */
export function isDialogOpen() {
  return layers.length > 0
}

export function isTopLayer(id) {
  return layers.length > 0 && layers[layers.length - 1].id === id
}

export function subscribeDialogs(fn) {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

/** Whether any dialog is open — for a check made while rendering. */
export function useDialogOpen() {
  return useSyncExternalStore(subscribeDialogs, isDialogOpen, () => false)
}

/**
 * Hold a layer open for as long as the calling component is mounted (and `enabled`).
 * `onEscape` may change between renders; the latest one is called.
 *
 * Returns a ref holding the layer's id while it is open, for isTopLayer.
 */
export function useDialogLayer(onEscape, enabled = true) {
  const [order] = useState(reserveOrder)
  const handler = useRef(onEscape)
  const idRef   = useRef(null)

  useLayoutEffect(() => { handler.current = onEscape })

  // A layout effect so the layer is in place before the first paint: an Escape
  // pressed the moment a dialog appears must not fall through to what is under it.
  useLayoutEffect(() => {
    if (!enabled) return
    const id = pushLayer(e => handler.current?.(e), order)
    idRef.current = id
    return () => {
      removeLayer(id)
      if (idRef.current === id) idRef.current = null
    }
  }, [enabled, order])

  return idRef
}

/** Test-only: forget every layer and the listener. */
export function _resetDialogStack() {
  layers = []
  changed()
}
