/**
 * The generic colour-preset swatch grid offered wherever someone picks a colour
 * by hand — Google calendar colours, task/event categories. Distinct from
 * `courseColors.js`'s COURSE_PALETTE, which is auto-assigned per course rather
 * than chosen from a grid, and from `ColorSwatches.js`'s EVENT_SWATCHES, which
 * is the event-colour picker's own ten.
 *
 * Four components each carried their own copy of this list; three were
 * byte-identical and now share this one. A fourth (ClassScheduleModal) swaps
 * two of the twelve values and was left alone rather than risk changing a
 * colour someone already sees.
 */
export const COLOR_PRESETS = [
  '#3b82f6','#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#059669','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#64748b','#475569',
]
