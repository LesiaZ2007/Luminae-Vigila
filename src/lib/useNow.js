'use client'

import { useEffect, useState } from 'react'

/** Milliseconds until the next whole multiple of `intervalMs` on the clock. */
export function msUntilNextTick(intervalMs, now = Date.now()) {
  return intervalMs - (now % intervalMs)
}

/**
 * The current time, refreshed every `intervalMs`, on the boundary.
 *
 * Wakes at the next whole second (or minute) rather than `intervalMs` after
 * mounting, so a seconds display changes when the second actually changes and a
 * minute tick lands at :00. A fixed `setInterval` drifts off the boundary and
 * shows a clock that lags by up to a second.
 *
 * Whoever calls this re-renders on every tick, so call it from the smallest
 * component that needs the time. The planner shell used to own a one-second
 * clock for its sidebar, and so re-rendered all of itself — every panel, every
 * derived list — once a second, all day.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let id
    const tick = () => {
      setNow(new Date())
      id = setTimeout(tick, msUntilNextTick(intervalMs))
    }
    id = setTimeout(tick, msUntilNextTick(intervalMs))
    return () => clearTimeout(id)
  }, [intervalMs])

  return now
}
