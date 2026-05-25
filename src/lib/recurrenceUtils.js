/**
 * Expand a recurring event into individual instances
 * @param {Object} base - Base event with recurrence rules
 * @returns {Array} Array of expanded event instances
 */
export function expandRecurring(base) {
  const { recurrence } = base
  const newId = base.id || String(Date.now())

  if (!recurrence) {
    return [{ ...base, id: newId }]
  }

  const startDt = new Date(base.start)
  const endDt = new Date(base.end)
  const duration = endDt - startDt
  const until = new Date(recurrence.until + 'T23:59:59')
  const results = []
  let cur = new Date(startDt)

  while (cur <= until) {
    const dow = cur.getDay()
    const weekDiff = Math.round((cur - startDt) / (7 * 24 * 60 * 60 * 1000))
    const dateStr = cur.toISOString().slice(0, 10)

    const include =
      recurrence.type === 'daily' ||
      (recurrence.type === 'weekly' && dow === startDt.getDay()) ||
      (recurrence.type === 'biweekly' &&
        dow === startDt.getDay() &&
        weekDiff % 2 === 0) ||
      (recurrence.type === 'monthly' && cur.getDate() === startDt.getDate()) ||
      (recurrence.type === 'custom' && recurrence.days.includes(dow))

    if (include) {
      const id = `${newId}-r-${dateStr}`
      results.push({
        ...base,
        id,
        recurrenceGroupId: newId,
        start: new Date(cur).toISOString(),
        end: new Date(cur.getTime() + duration).toISOString(),
        recurrence: undefined,
      })
    }

    cur.setDate(cur.getDate() + 1)
  }

  return results
}

/**
 * Expand a recurring todo into individual instances (up to 8 weeks ahead)
 * @param {Object} todo - Todo with recurrence rules
 * @returns {Array} Array of expanded todo instances
 */
export function expandRecurringTodo(todo) {
  if (!todo.dueDate) return []
  if (!todo.recurrence) return [todo]

  const { recurrence } = todo
  const startDt = new Date(todo.dueDate + 'T12:00:00')
  const until = recurrence.until
    ? new Date(recurrence.until + 'T23:59:59')
    : new Date(startDt.getTime() + 8 * 7 * 24 * 3600000)
  const completedDates = todo.completedDates || []

  const results = []
  let cur = new Date(startDt)

  while (cur <= until && results.length < 60) {
    const dow = cur.getDay()
    const dateStr = cur.toISOString().slice(0, 10)
    const include =
      recurrence.type === 'daily' ||
      (recurrence.type === 'weekly' && dow === startDt.getDay()) ||
      (recurrence.type === 'custom' && recurrence.days?.includes(dow))

    if (include && !completedDates.includes(dateStr)) {
      results.push({
        ...todo,
        dueDate: dateStr,
        recurrenceGroupId: todo.id,
        id: `${todo.id}-r-${dateStr}`,
      })
    }

    cur.setDate(cur.getDate() + 1)
  }

  return results
}
