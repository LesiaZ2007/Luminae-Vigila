/**
 * quickParse.js — hand-written natural-language parser for the quick-add omnibar.
 * No external deps, no AI calls. Returns a structured result object.
 *
 * Supported input patterns (case-insensitive):
 *   - Relative days:  today, tomorrow, tonight, yesterday
 *   - Weekday names:  monday … sunday  (next occurrence; "next monday" = week after)
 *   - Explicit dates: 6/15  |  jun 15  |  june 15th  |  6-15
 *   - Times:          5pm  |  17:00  |  5:30pm  |  2-3pm  |  2pm-3pm  |  "at 5pm"
 *   - Duration:       for 2h  |  for 90min  |  for 1.5h  |  for 45 minutes
 *   - Due phrasing:   "due monday"  |  "due 6/15"  →  forces task type
 *   - Recurrence:     "every tuesday"  |  "every week"  |  "every day"
 *
 * Type heuristic:
 *   - "due …" keyword  → task
 *   - time-of-day present (no "due")  → event
 *   - neither  → task (no time = no event)
 *
 * Returns:
 * {
 *   type:       'event' | 'task',
 *   title:      string,
 *   start:      ISO string | null,   // for events
 *   end:        ISO string | null,   // for events with end time
 *   dueDate:    'YYYY-MM-DD' | null, // for tasks
 *   recurrence: { type, days, until } | null,
 *   confidence: 'high' | 'medium' | 'low',
 * }
 */

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const WEEKDAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

// Zero-pad helper
function pad(n) { return String(n).padStart(2, '0') }

// Format a Date to YYYY-MM-DD
function toYMD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Format a Date to YYYY-MM-DDTHH:MM:00
function toISO(d) {
  return `${toYMD(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/**
 * Get the next occurrence of a given weekday (0=Sun … 6=Sat).
 * If today IS that weekday, returns the next occurrence 7 days out.
 * "next monday" is handled by the caller adding another 7 days.
 */
function nextWeekday(targetDow, fromDate = new Date()) {
  const d = new Date(fromDate)
  d.setHours(12, 0, 0, 0) // anchor to noon so DST doesn't shift the day
  const curDow = d.getDay()
  let diff = targetDow - curDow
  if (diff <= 0) diff += 7 // always future
  d.setDate(d.getDate() + diff)
  return d
}

/**
 * Parse a time string like "5pm", "17:00", "5:30pm", "9am"
 * Returns { hour, minute } or null.
 */
function parseTimeStr(s) {
  s = s.trim().toLowerCase()
  // HH:MM with optional am/pm
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    const period = m[3]
    if (period === 'pm' && h < 12) h += 12
    if (period === 'am' && h === 12) h = 0
    if (h < 0 || h > 23 || min < 0 || min > 59) return null
    return { hour: h, minute: min }
  }
  // H or HH with optional am/pm
  m = s.match(/^(\d{1,2})\s*(am|pm)$/)
  if (m) {
    let h = parseInt(m[1], 10)
    const period = m[2]
    if (period === 'pm' && h < 12) h += 12
    if (period === 'am' && h === 12) h = 0
    if (h < 0 || h > 23) return null
    return { hour: h, minute: 0 }
  }
  return null
}

/**
 * Apply hour/minute to a Date object (mutates). Returns the same Date.
 */
function applyTime(date, hour, minute) {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d
}

export function quickParse(input, referenceDate) {
  const ref = referenceDate ? new Date(referenceDate) : new Date()
  ref.setSeconds(0, 0)

  let text = input.trim()
  if (!text) return null

  let dateResolved = null       // Date object (calendar day) once found
  let startTime = null          // { hour, minute }
  let endTime = null            // { hour, minute }
  let durationMinutes = null    // number
  let isDue = false             // "due …" keyword found
  let isNextWeek = false        // "next <weekday>" pattern
  let recurrence = null         // recurrence object if "every …" found
  let confidence = 'medium'

  // ── 1. Strip and note "due" keyword ────────────────────────────────────────
  if (/\bdue\b/i.test(text)) {
    isDue = true
    text = text.replace(/\bdue\b/gi, ' ').replace(/\s+/g, ' ').trim()
  }

  // ── 2. Recurrence: "every <weekday|day|week|…>" ────────────────────────────
  const everyMatch = text.match(/\bevery\s+(day|daily|week(?:ly)?|other\s+week|biweekly|month(?:ly)?|([a-z]+day|[a-z]+))\b/i)
  if (everyMatch) {
    const rec = everyMatch[1].toLowerCase().replace(/\s+/g, '')
    let recType = null
    let recDays = []

    if (rec === 'day' || rec === 'daily') {
      recType = 'daily'
    } else if (rec === 'week' || rec === 'weekly') {
      recType = 'weekly'
    } else if (rec === 'otherweek' || rec === 'biweekly') {
      recType = 'biweekly'
    } else if (rec === 'month' || rec === 'monthly') {
      recType = 'monthly'
    } else {
      // Try to match a weekday
      const dow = WEEKDAY_MAP[rec]
      if (dow !== undefined) {
        recType = 'custom'
        recDays = [dow]
        // The start date should be the next occurrence of that day
        dateResolved = nextWeekday(dow, ref)
      }
    }

    if (recType) {
      // Default until 8 weeks from now if no end date is parsed
      const until = new Date(ref)
      until.setDate(until.getDate() + 56)
      recurrence = { type: recType, days: recDays, until: toYMD(until) }
    }

    // Remove the matched "every …" phrase from text
    text = text.replace(everyMatch[0], ' ').replace(/\s+/g, ' ').trim()
  }

  // ── 3. "next <weekday>" pattern ─────────────────────────────────────────────
  const nextMatch = text.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i)
  if (nextMatch) {
    const dow = WEEKDAY_MAP[nextMatch[1].toLowerCase()]
    if (dow !== undefined) {
      // "next monday" = the occurrence AFTER the next occurring monday
      const firstNext = nextWeekday(dow, ref)
      dateResolved = new Date(firstNext)
      dateResolved.setDate(dateResolved.getDate() + 7)
      text = text.replace(nextMatch[0], ' ').replace(/\s+/g, ' ').trim()
      confidence = 'high'
    }
  }

  // ── 4. Relative day keywords ────────────────────────────────────────────────
  if (!dateResolved) {
    const relMatch = text.match(/\b(today|tonight|tomorrow|yesterday)\b/i)
    if (relMatch) {
      const kw = relMatch[1].toLowerCase()
      const d = new Date(ref)
      if (kw === 'tomorrow') d.setDate(d.getDate() + 1)
      if (kw === 'yesterday') d.setDate(d.getDate() - 1)
      d.setHours(kw === 'tonight' ? 20 : 9, 0, 0, 0)
      dateResolved = d
      text = text.replace(relMatch[0], ' ').replace(/\s+/g, ' ').trim()
      confidence = 'high'
    }
  }

  // ── 5. Weekday name (bare — next occurrence) ────────────────────────────────
  if (!dateResolved) {
    const wdMatch = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i)
    if (wdMatch) {
      const dow = WEEKDAY_MAP[wdMatch[1].toLowerCase()]
      if (dow !== undefined) {
        dateResolved = nextWeekday(dow, ref)
        text = text.replace(wdMatch[0], ' ').replace(/\s+/g, ' ').trim()
        confidence = 'high'
      }
    }
  }

  // ── 6. Explicit dates: "jun 15", "june 15th", "6/15", "6-15" ───────────────
  if (!dateResolved) {
    // "jun 15" or "june 15th"
    const monthWordMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
    if (monthWordMatch) {
      const monthNum = MONTH_MAP[monthWordMatch[1].toLowerCase()]
      const dayNum = parseInt(monthWordMatch[2], 10)
      if (monthNum && dayNum >= 1 && dayNum <= 31) {
        const d = new Date(ref)
        d.setMonth(monthNum - 1, dayNum)
        d.setHours(9, 0, 0, 0)
        // If the date is in the past, assume next year
        if (d < ref && d.getMonth() < ref.getMonth()) d.setFullYear(d.getFullYear() + 1)
        dateResolved = d
        text = text.replace(monthWordMatch[0], ' ').replace(/\s+/g, ' ').trim()
        confidence = 'high'
      }
    }

    // "6/15" or "6-15"
    if (!dateResolved) {
      const numDateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/)
      if (numDateMatch) {
        const month = parseInt(numDateMatch[1], 10)
        const day   = parseInt(numDateMatch[2], 10)
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const d = new Date(ref)
          d.setMonth(month - 1, day)
          d.setHours(9, 0, 0, 0)
          if (d < ref) d.setFullYear(d.getFullYear() + 1)
          dateResolved = d
          text = text.replace(numDateMatch[0], ' ').replace(/\s+/g, ' ').trim()
          confidence = 'high'
        }
      }
    }
  }

  // ── 7. Duration: "for 2h", "for 90min", "for 1.5 hours", "for 45 minutes" ──
  const durationMatch = text.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(h(?:r|rs|our|ours)?|m(?:in|ins|inute|inutes)?)\b/i)
  if (durationMatch) {
    const val = parseFloat(durationMatch[1])
    const unit = durationMatch[2].toLowerCase()
    if (unit.startsWith('h')) {
      durationMinutes = Math.round(val * 60)
    } else {
      durationMinutes = Math.round(val)
    }
    text = text.replace(durationMatch[0], ' ').replace(/\s+/g, ' ').trim()
  }

  // ── 8. Time range: "2-3pm", "2pm-3pm", "2pm to 3pm" ───────────────────────
  // Must try range before single-time to avoid eating just the start
  let timeRangeFound = false

  // "2-3pm" → both inherit pm
  const rangeImplicitMatch = text.match(/\b(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/i)
  if (rangeImplicitMatch) {
    const endParsed = parseTimeStr(rangeImplicitMatch[2] + rangeImplicitMatch[3])
    const startParsed = parseTimeStr(rangeImplicitMatch[1] + rangeImplicitMatch[3])
    if (startParsed && endParsed) {
      startTime = startParsed
      endTime = endParsed
      // If start >= end (e.g. 3-2pm), swap
      if (startTime.hour * 60 + startTime.minute >= endTime.hour * 60 + endTime.minute) {
        // start might be AM — try without pm
        const altStart = parseTimeStr(rangeImplicitMatch[1])
        if (altStart) startTime = altStart
      }
      text = text.replace(rangeImplicitMatch[0], ' ').replace(/\s+/g, ' ').trim()
      timeRangeFound = true
    }
  }

  if (!timeRangeFound) {
    // "2pm-3pm" or "2pm to 3pm"
    const rangeExplicitMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
    if (rangeExplicitMatch) {
      const s = parseTimeStr(rangeExplicitMatch[1])
      const e = parseTimeStr(rangeExplicitMatch[2])
      if (s && e) {
        startTime = s
        endTime = e
        text = text.replace(rangeExplicitMatch[0], ' ').replace(/\s+/g, ' ').trim()
        timeRangeFound = true
      }
    }
  }

  // ── 9. Single time: "5pm", "17:00", "at 5pm", "@ 5pm" ────────────────────
  if (!timeRangeFound) {
    const singleTimeMatch = text.match(/(?:^|\s|@|at\s)(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{2}:\d{2})(?:\s|$)/i)
    if (singleTimeMatch) {
      const parsed = parseTimeStr(singleTimeMatch[1])
      if (parsed) {
        startTime = parsed
        text = text.replace(singleTimeMatch[0].trim(), ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }

  // ── 10. Strip connective words that may be leftover ───────────────────────
  text = text.replace(/\b(at|on|by|the|a|an|in|for)\b/gi, ' ').replace(/\s+/g, ' ').trim()

  // ── 11. Determine type ─────────────────────────────────────────────────────
  const hasTime = startTime !== null
  const type = isDue ? 'task' : (hasTime ? 'event' : 'task')

  // ── 12. Build date/time fields ────────────────────────────────────────────
  // Default: today if no date was found
  if (!dateResolved) {
    dateResolved = new Date(ref)
    dateResolved.setSeconds(0, 0)
    confidence = hasTime ? 'medium' : 'low'
  }

  let startISO = null
  let endISO = null
  let dueDate = null

  if (type === 'event') {
    // Apply start time to resolved date
    const startH = startTime ? startTime.hour : 9
    const startM = startTime ? startTime.minute : 0
    const startDt = applyTime(dateResolved, startH, startM)
    startISO = toISO(startDt)

    if (endTime) {
      const endDt = applyTime(dateResolved, endTime.hour, endTime.minute)
      endISO = toISO(endDt)
    } else if (durationMinutes) {
      const endDt = new Date(startDt.getTime() + durationMinutes * 60_000)
      endISO = toISO(endDt)
    } else {
      // Default 1 hour
      const endDt = new Date(startDt.getTime() + 60 * 60_000)
      endISO = toISO(endDt)
    }
  } else {
    // Task — use resolved date as due date
    dueDate = toYMD(dateResolved)
  }

  // ── 13. Clean title ────────────────────────────────────────────────────────
  // Remove leading/trailing punctuation and double spaces
  const title = text.replace(/^[,.\-–:]+/, '').replace(/[,.\-–:]+$/, '').replace(/\s+/g, ' ').trim()

  return {
    type,
    title: title || 'Untitled',
    start: startISO,
    end: endISO,
    dueDate,
    recurrence,
    confidence,
  }
}

/**
 * Format a parsed result into a human-readable preview string.
 * e.g. "Event · Dentist · Fri Jun 13, 2:00–3:00 PM"
 */
export function formatPreview(parsed) {
  if (!parsed) return ''

  const icon = parsed.type === 'event' ? 'Event' : 'Task'
  const title = parsed.title || 'Untitled'

  let dateStr = ''
  if (parsed.type === 'event' && parsed.start) {
    const s = new Date(parsed.start)
    const datePart = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    if (parsed.end) {
      const e = new Date(parsed.end)
      const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      dateStr = `${datePart}, ${startTime}–${endTime}`
    } else {
      dateStr = `${datePart}, ${startTime}`
    }
  } else if (parsed.type === 'task' && parsed.dueDate) {
    const d = new Date(parsed.dueDate + 'T12:00:00')
    dateStr = 'Due ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const parts = [icon, title, dateStr].filter(Boolean)
  return parts.join(' · ')
}
