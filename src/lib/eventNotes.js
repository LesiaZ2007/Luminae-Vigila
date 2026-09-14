/**
 * How much of an event's notes fit inside its block on the calendar.
 *
 * A tall event leaves dead space under its title, and the notes are usually the part
 * you actually wanted (room number, what to bring, the link). Showing them there
 * saves opening the event just to read one line.
 *
 * ## Why this is duration maths rather than measurement
 *
 * The grid uses `slotDuration="00:30:00"` with `expandRows`, so the pixels-per-minute
 * scale is not fixed — it stretches to fill the viewport. Measuring the real block
 * would mean a layout read per event on every render, and FullCalendar re-renders
 * these constantly.
 *
 * So duration is used as a proxy, and the render leans on `flex: 1` + `overflow:
 * hidden` to do the actual clipping. That combination means an over-estimate degrades
 * to a clean cut at the block's edge instead of text spilling outside it — the maths
 * only has to be good enough to decide *whether* notes are worth showing, not exactly
 * how many lines survive.
 *
 * The thresholds are deliberately conservative. A single clipped half-line of grey
 * text reads as a rendering bug; showing nothing reads as a normal calendar.
 */

/** Roughly the minutes of block height one line of note text occupies. */
const MINUTES_PER_LINE = 22

/**
 * Minutes consumed before notes can start: the time row plus a title that usually
 * wraps to two lines in a week column.
 */
const RESERVED_MINUTES        = 68
const RESERVED_MINUTES_MOBILE = 92 // narrower columns wrap the title further

/** Never fill a whole block with grey text, however long the event is. */
const MAX_NOTE_LINES = 6

/** Same proxy as above, for the larger 0.76rem title line. */
const TITLE_MINUTES_PER_LINE = 22

/** The time row above the title. */
const TIME_ROW_MINUTES = 16

/** A title is a label, not a paragraph — past this it is not being read anyway. */
const MAX_TITLE_LINES = 3

/**
 * Collapse note text to a single readable run.
 *
 * Notes may hold newlines, and Google descriptions can contain HTML — pasted from a
 * meeting invite, typically a wall of markup and join links. Tags are stripped rather
 * than rendered: this is a 0.6rem preview inside a calendar block, and injecting
 * arbitrary remote HTML into it would be both unreadable and unsafe.
 */
export function flattenNotes(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lines of notes to show, or 0 to show none.
 *
 * @param {object}  opts
 * @param {number}  opts.durationMins  Event length. The compact renderer passes 999
 *                                     for all-day events, which is handled by `allDay`.
 * @param {boolean} [opts.allDay]      All-day events sit in a fixed-height row.
 * @param {boolean} [opts.isMobile]
 * @param {number}  [opts.linkedCount] Linked task rows already using vertical space.
 */
export function noteLineBudget({ durationMins, allDay = false, isMobile = false, linkedCount = 0 }) {
  // The all-day lane is a fixed short row — there is no vertical space to spend, and
  // its events are laid out horizontally.
  if (allDay) return 0
  if (!Number.isFinite(durationMins) || durationMins <= 0) return 0

  const reserved = (isMobile ? RESERVED_MINUTES_MOBILE : RESERVED_MINUTES)
    + linkedCount * MINUTES_PER_LINE

  const spare = durationMins - reserved
  if (spare < MINUTES_PER_LINE) return 0 // not even one full line — show nothing

  return Math.min(MAX_NOTE_LINES, Math.floor(spare / MINUTES_PER_LINE))
}

/**
 * Whole lines of title that fit in the block, for the tall (non-compact) layout.
 *
 * The title used to wrap freely and get sliced by the block's `overflow: hidden`,
 * which cut the last visible line horizontally through the letters — the bottom half
 * of a row of glyphs, which reads as broken rendering rather than as truncation.
 * Turning this budget into a `max-height` of whole line boxes moves the cut onto a
 * line boundary, so a long name simply stops at the end of a line.
 *
 * Deliberately a floor: rounding up buys a few more characters at the cost of
 * reintroducing the half-line it exists to prevent.
 *
 * @param {object}  opts
 * @param {number}  opts.durationMins  Event length; the renderer passes 999 for all-day.
 * @param {boolean} [opts.allDay]      The all-day lane grows with its content, so there
 *                                     is no block height to budget against.
 */
export function titleLineBudget({ durationMins, allDay = false }) {
  if (allDay) return MAX_TITLE_LINES
  if (!Number.isFinite(durationMins) || durationMins <= 0) return 1

  const spare = durationMins - TIME_ROW_MINUTES
  if (spare < TITLE_MINUTES_PER_LINE) return 1 // always show at least the first line

  return Math.min(MAX_TITLE_LINES, Math.floor(spare / TITLE_MINUTES_PER_LINE))
}
