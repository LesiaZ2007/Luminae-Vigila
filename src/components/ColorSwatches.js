'use client'

/**
 * The colour picker every event surface shares.
 *
 * Both entry points had their own, and both were bad on a phone. The event modal drew
 * 26px circles in a flex-wrap row — a tap target well under half what a thumb needs,
 * revealed only on hover, and offered only when *editing*, so a new event had no colour
 * control at all. The detail modal fell back to a raw `<input type="color">`, which
 * hands the whole job to the OS colour wheel: it renders as a black chip in the app's
 * own palette, looks nothing like the rest of the chrome, and answers "which of my ten
 * colours is this" with a gradient square.
 *
 * So: one grid, ten known colours, cells big enough to hit. The tap target is the whole
 * padded cell rather than the circle inside it, which is what buys the touch size
 * without making the dots cartoonish on a desktop.
 */

import { Check } from 'lucide-react'

/**
 * The event palette. One list, so the modal, the detail view and the calendar's
 * right-click popover cannot drift apart.
 */
export const EVENT_SWATCHES = [
  '#3a6fa8','#10b981','#ef4444','#f59e0b','#8b5cf6',
  '#e8751a','#0ea5e9','#ec4899','#6366f1','#14b8a6',
]

/** Hex compare that doesn't care about case — stored values are mixed. */
export function sameColor(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
}

/**
 * @param value    currently selected hex, or null/undefined for none
 * @param onChange called with the picked hex
 * @param label    prefix for each swatch's accessible name
 */
export default function ColorSwatches({ value, onChange, label = 'Colour' }) {
  return (
    <div
      style={{
        display: 'grid',
        /* Cells size themselves so the row fills the modal at any width instead of
           leaving a ragged flex-wrap gap. 44px is the floor a thumb needs; on a
           desktop modal that resolves to five or six per row. */
        gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))',
        gap: 4,
        marginTop: 4,
      }}
    >
      {EVENT_SWATCHES.map(c => {
        const active = sameColor(value, c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={active}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              /* The cell, not the dot, is the target — 44px tall including padding. */
              minHeight: 44, padding: 4, borderRadius: 10,
              border: 'none', cursor: 'pointer', background: 'transparent',
              /* An outline rather than a border: a border would resize the cell on
                 selection and shuffle the whole grid by a pixel. */
              outline: active ? '2px solid var(--text)' : '2px solid transparent',
              outlineOffset: -2,
              transition: 'background .12s, outline-color .12s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: '50%', background: c,
                boxShadow: active ? `0 0 0 3px ${c}44` : 'none',
                transition: 'box-shadow .12s',
              }}
            >
              {/* The tick carries the selection for anyone who can't separate the
                  outline from the dot — a ring in a ten-colour grid is subtle. */}
              {active && <Check size={14} strokeWidth={3} color="#fff" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
