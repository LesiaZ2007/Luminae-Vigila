'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { moveId, neighbourId, applyOrder, sameOrder } from './reorder'

const defaultGetId = item => item.id

/**
 * Drag-to-reorder for a list of rows, by mouse and by keyboard.
 *
 *   const drag = useDragReorder({ items, onCommit })
 *   <ul {...drag.listProps}>
 *     {drag.orderedItems.map(item =>
 *       <li key={item.id} {...drag.rowProps(item.id)}>
 *         <button {...drag.handleProps(item.id)} aria-label={`Reorder ${item.text}`} />
 *
 * The task list and the custom lists each had their own copy of this, written the
 * same way and broken the same way. Neither listened for `dragend`, so a drag that
 * was let go anywhere but on another row — in the gap between two rows, on a date
 * heading, below the list, or cancelled with Escape — never cleared. The dragged row
 * stayed dimmed, and because the list rendered its drag-time snapshot for as long as
 * one existed, it stopped showing anything new: a task added, ticked or synced from
 * another device did not appear until the next drag happened to finish on a row.
 * Pressing the grip without dragging dimmed the row too, since the grip started the
 * "drag" on pointer-down. And with no `setData`, Firefox would not start a drag at
 * all.
 *
 * Here the preview cannot outlive the drag: it is cleared on drop, on `dragend`
 * (which fires however the drag ends), and is ignored outright once the dragged row
 * is gone. It holds ids, not items, so the rows it draws are always the current
 * ones — an edit landing mid-drag shows immediately. When nothing is being dragged
 * the hook hands back `items` untouched.
 *
 * The grip is a real button, and ↑ / ↓ on it moves the row a step and saves straight
 * away, so reordering no longer needs a mouse. Focus follows the row it moved.
 *
 * Options
 *   items     the rows, in their current order
 *   onCommit  (itemsInNewOrder) => void — called once per finished move, never for a
 *             drop that changed nothing
 *   getId     item => id                 (default: item.id)
 *   enabled   false turns it all off: no drag, no keys, rows rendered as given
 *   groupOf   item => key — rows only move among rows with the same key. The task
 *             list draws one order under several date headings; a move across a
 *             heading would change the stored order and nothing on screen.
 *
 * Returns
 *   enabled       as passed — whether to draw a grip at all
 *   orderedItems  what to render — the live preview while dragging, else `items`
 *   draggingId    the row being dragged, or null
 *   rowProps(id)  spread on the row: draggable + the drag events
 *   handleProps(id) spread on the grip <button>: keyboard moves
 *   listProps     spread on the container, so letting go in a gap or on a heading
 *                 still drops where the preview showed rather than snapping back
 */
export default function useDragReorder({ items, onCommit, getId = defaultGetId, enabled = true, groupOf }) {
  /* The drag lives in both a ref and state, deliberately. The handlers read the ref:
     dragover fires many times a second and needs the current order synchronously,
     not as of the last render. The state is what rendering reads, since writing a
     ref re-renders nothing. */
  const dragRef = useRef(null)            // { id, order, overId }
  const [drag, setDrag] = useState(null)  // { id, order }

  // The grip a keyboard move came from, to give focus back to once the list re-renders.
  const [focusRequest, setFocusRequest] = useState(null)

  const ids = items.map(getId)
  /* A preview is only honoured while its row still exists. If the dragged row is
     deleted mid-drag (another device, say), its `dragend` may never reach us, and a
     preview for a row that is not there would otherwise pin the list forever. */
  const live = enabled && drag && ids.includes(drag.id) ? drag : null
  const orderedItems = live ? applyOrder(items, live.order, getId) : items

  useLayoutEffect(() => {
    const el = focusRequest?.el
    /* Moving a focused node in the DOM drops its focus, and React moves whichever
       nodes its diff says to — so a row moved down by keyboard loses focus and one
       moved up keeps it. Putting it back unconditionally makes both directions the
       same. Layout effect, so the ring never visibly blinks off. */
    if (el?.isConnected && document.activeElement !== el) el.focus()
  }, [focusRequest])

  function itemById(id) {
    return items.find(i => getId(i) === id)
  }

  function sameGroup(a, b) {
    if (!groupOf) return true
    const ia = itemById(a), ib = itemById(b)
    return !!ia && !!ib && groupOf(ia) === groupOf(ib)
  }

  function commit(order) {
    const next = applyOrder(items, order, getId)
    if (!sameOrder(next, items, getId)) onCommit?.(next)
  }

  function reset() {
    dragRef.current = null
    setDrag(null)
  }

  function finishDrop(e) {
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    commit(d.order)
    reset()
  }

  function acceptDrag(e) {
    if (!dragRef.current) return false
    // Without preventDefault the browser treats this as "no drop here".
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    return true
  }

  function rowProps(id) {
    if (!enabled) return {}
    return {
      draggable: true,
      onDragStart: e => {
        /* Only drags of the row itself. Selecting text inside a field on the row and
           dragging that bubbles a dragstart here too, and is not a reorder. */
        if (e.target !== e.currentTarget) return
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          // Firefox will not start a drag that carries no data.
          e.dataTransfer.setData('text/plain', String(id))
        }
        dragRef.current = { id, order: ids, overId: null }
        setDrag({ id, order: ids })
      },
      onDragOver: e => {
        if (!acceptDrag(e)) return
        const d = dragRef.current
        if (id === d.id) {
          /* Back over the row being dragged: forget the last row passed, so moving
             back onto it swaps them back. Without this, undoing a step meant
             detouring over some third row first. */
          d.overId = null
          return
        }
        // Each row once per entry — dragover repeats while the pointer sits still.
        if (id === d.overId) return
        d.overId = id
        if (!sameGroup(d.id, id)) return
        const order = moveId(d.order, d.id, id)
        if (order === d.order) return
        d.order = order
        setDrag({ id: d.id, order })
      },
      onDrop: e => {
        // The list container would see this drop too, once it bubbles; one is enough.
        e.stopPropagation()
        finishDrop(e)
      },
      // However the drag ended — dropped, cancelled with Escape, let go off the list.
      // After a successful drop this finds nothing left to reset.
      onDragEnd: reset,
    }
  }

  function handleProps(id) {
    if (!enabled) return {}
    return {
      type: 'button',
      'aria-keyshortcuts': 'ArrowUp ArrowDown',
      onKeyDown: e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        // The arrows would otherwise scroll the list out from under the row.
        e.preventDefault()
        e.stopPropagation()
        if (dragRef.current) return
        const target = neighbourId(ids, id, e.key === 'ArrowUp' ? -1 : 1, other => sameGroup(id, other))
        if (target == null) return
        setFocusRequest({ el: e.currentTarget })
        commit(moveId(ids, id, target))
      },
      /* A grip is not a way into the row's editor. Enter and Space on a focused
         button synthesise a click, which would otherwise reach a row that opens on
         click. */
      onClick: e => e.stopPropagation(),
    }
  }

  const listProps = enabled
    ? { onDragOver: acceptDrag, onDrop: finishDrop }
    : {}

  return {
    enabled,
    orderedItems,
    draggingId: live ? live.id : null,
    rowProps,
    handleProps,
    listProps,
  }
}
