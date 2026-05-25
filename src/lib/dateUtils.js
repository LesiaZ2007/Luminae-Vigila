/**
 * Format ISO date string to readable format
 * @param {string} iso - ISO date string
 * @param {string} format - Format style (default: 'short')
 * @returns {string} Formatted date
 */
export function formatDate(iso, format = 'short') {
  if (!iso) return ''
  const date = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  if (format === 'short') {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }
  return date.toLocaleDateString('en-US')
}

/**
 * Format ISO datetime string to time
 * @param {string} iso - ISO datetime string
 * @returns {string} Formatted time
 */
export function formatTime(iso) {
  if (!iso || !iso.includes('T')) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 * @returns {string} Today's date
 */
export function getTodayISO() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Get a date N days from now as ISO string
 * @param {number} days - Number of days ahead
 * @returns {string} Future date as ISO string
 */
export function getFutureDateISO(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
