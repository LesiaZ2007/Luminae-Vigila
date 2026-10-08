// Runs with TZ=America/New_York (see vitest.config.js). That is the point of several
// cases below: the answer for Tokyo or Berlin must not depend on the process's own
// zone, which on Vercel is UTC and here is deliberately something else again.
import { describe, it, expect } from 'vitest'
import {
  isValidTimeZone, zoneFromTzOffset, resolveUserZone, offsetMinutesAt, zonedWallToMs,
  floatingToMs, dateStrInZone, localDateOf, addDaysToDateStr, formatWallTime,
  MAX_ZONE_LENGTH, MAX_CACHED_ZONES, cachedZoneCount,
} from './zonedTime'

const utc = (...args) => Date.UTC(...args)
// Node's ICU puts a narrow no-break space before AM/PM; that is not what is under test.
const plain = s => (s == null ? s : s.replace(/\s/g, ' '))

describe('isValidTimeZone', () => {
  it('accepts IANA names Intl recognises', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
  })

  it('rejects anything that is not a zone', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone(-240)).toBe(false)
    expect(isValidTimeZone({ timeZone: 'UTC' })).toBe(false)
  })

  it('rejects an over-long string before handing it to Intl', () => {
    expect(isValidTimeZone('A'.repeat(MAX_ZONE_LENGTH + 1))).toBe(false)
  })
})

/* Zone names arrive from clients, and the formatter cache was keyed on the string as
   sent. Intl accepts any casing of a name, so a client cycling through spellings of
   one zone added a formatter per request, without limit. */
describe('the zone formatter cache', () => {
  it('keeps one entry per zone, however its name is spelled', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true)
    const before = cachedZoneCount()
    for (const spelling of ['america/chicago', 'AMERICA/CHICAGO', 'America/chicago', 'aMeRiCa/ChIcAgO']) {
      expect(isValidTimeZone(spelling)).toBe(true)
    }
    expect(cachedZoneCount()).toBe(before)
  })

  it('reads a misspelt zone exactly as the real one', () => {
    const t = utc(2026, 6, 1, 12)
    expect(offsetMinutesAt('asia/tokyo', t)).toBe(540)
    expect(offsetMinutesAt('AMERICA/NEW_YORK', t)).toBe(offsetMinutesAt('America/New_York', t))
  })

  it('never holds more than its cap, however many zones arrive', () => {
    const zones = Intl.supportedValuesOf('timeZone')
    expect(zones.length).toBeGreaterThan(MAX_CACHED_ZONES) // otherwise this proves nothing
    for (const zone of zones) {
      expect(isValidTimeZone(zone)).toBe(true)
      expect(cachedZoneCount()).toBeLessThanOrEqual(MAX_CACHED_ZONES)
    }
    // And it still answers once it has started over.
    expect(offsetMinutesAt('Asia/Tokyo', utc(2026, 0, 1))).toBe(540)
  })

  it('caches nothing for a name Intl rejects', () => {
    const before = cachedZoneCount()
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(cachedZoneCount()).toBe(before)
  })
})

describe('zoneFromTzOffset — getTimezoneOffset() has the opposite sign to an ISO offset', () => {
  it('turns New York summer (240: add four hours to reach UTC) into UTC-04:00', () => {
    expect(zoneFromTzOffset(240)).toEqual({ utcOffsetMinutes: -240 })
  })

  it('turns Tokyo (-540) into UTC+09:00', () => {
    expect(zoneFromTzOffset(-540)).toEqual({ utcOffsetMinutes: 540 })
  })

  it('keeps zero as zero', () => {
    expect(zoneFromTzOffset(0)).toEqual({ utcOffsetMinutes: 0 })
  })

  it('returns null for something that is not a number', () => {
    expect(zoneFromTzOffset(null)).toBeNull()
    expect(zoneFromTzOffset(undefined)).toBeNull()
    expect(zoneFromTzOffset('soon')).toBeNull()
  })
})

describe('resolveUserZone', () => {
  it('prefers a recorded IANA name', () => {
    expect(resolveUserZone([{ time_zone: 'Asia/Tokyo', tz_offset: -540 }])).toBe('Asia/Tokyo')
  })

  it('accepts a single row as well as a list', () => {
    expect(resolveUserZone({ time_zone: 'Europe/Berlin', tz_offset: -120 })).toBe('Europe/Berlin')
  })

  it('falls back to the fixed offset when no row has a usable name', () => {
    // An old client never sent one; a bad one is no better than none.
    expect(resolveUserZone([{ time_zone: null, tz_offset: 240 }])).toEqual({ utcOffsetMinutes: -240 })
    expect(resolveUserZone([{ time_zone: 'Mars/Olympus', tz_offset: 300 }])).toEqual({ utcOffsetMinutes: -300 })
  })

  it('falls back to UTC when there is nothing to go on', () => {
    expect(resolveUserZone([])).toBe('UTC')
    expect(resolveUserZone(undefined)).toBe('UTC')
    expect(resolveUserZone([{ time_zone: null, tz_offset: 0 }])).toBe('UTC')
    expect(resolveUserZone([{ time_zone: null, tz_offset: null }])).toBe('UTC')
  })

  it('lets one device with a name win over others with only an offset', () => {
    const rows = [
      { time_zone: null, tz_offset: 0 },
      { time_zone: null, tz_offset: 0 },
      { time_zone: 'America/Chicago', tz_offset: 300 },
    ]
    expect(resolveUserZone(rows)).toBe('America/Chicago')
  })

  it('picks the zone most devices agree on, whatever order the rows arrive in', () => {
    const rows = [
      { time_zone: 'Asia/Tokyo' },
      { time_zone: 'America/New_York' },
      { time_zone: 'America/New_York' },
    ]
    expect(resolveUserZone(rows)).toBe('America/New_York')
    expect(resolveUserZone([...rows].reverse())).toBe('America/New_York')
  })

  // The dedup key of a reminder includes its fire time, so a choice that flipped
  // between scans would push the same reminder twice.
  it('breaks a tie the same way every time', () => {
    const a = [{ time_zone: 'Asia/Tokyo' }, { time_zone: 'America/New_York' }]
    expect(resolveUserZone(a)).toBe('America/New_York')
    expect(resolveUserZone([...a].reverse())).toBe('America/New_York')
  })
})

describe('offsetMinutesAt', () => {
  it('follows each zone’s own DST rules', () => {
    expect(offsetMinutesAt('America/New_York', utc(2026, 6, 1, 12))).toBe(-240)
    expect(offsetMinutesAt('America/New_York', utc(2026, 0, 15, 12))).toBe(-300)
    expect(offsetMinutesAt('Europe/Berlin', utc(2026, 6, 1, 12))).toBe(120)
    expect(offsetMinutesAt('Europe/Berlin', utc(2026, 0, 15, 12))).toBe(60)
    expect(offsetMinutesAt('Asia/Tokyo', utc(2026, 6, 1, 12))).toBe(540)
  })

  it('flips at the transition instant itself', () => {
    // New York springs forward at 07:00Z on 8 March 2026.
    expect(offsetMinutesAt('America/New_York', utc(2026, 2, 8, 6, 59))).toBe(-300)
    expect(offsetMinutesAt('America/New_York', utc(2026, 2, 8, 7, 0))).toBe(-240)
  })

  it('ignores a sub-minute remainder in the instant', () => {
    expect(offsetMinutesAt('Asia/Tokyo', utc(2026, 6, 1, 12) + 59_999)).toBe(540)
  })

  it('reads a fixed-offset zone back as-is', () => {
    expect(offsetMinutesAt({ utcOffsetMinutes: -240 }, utc(2026, 0, 15))).toBe(-240)
  })

  it('returns null for an unrecognised zone', () => {
    expect(offsetMinutesAt('Not/AZone', utc(2026, 0, 15))).toBeNull()
    expect(offsetMinutesAt({ utcOffsetMinutes: 'east' }, utc(2026, 0, 15))).toBeNull()
  })
})

describe('floatingToMs — a floating time, read in a named zone', () => {
  describe('ordinary times', () => {
    it('reads 9am in New York as 13:00Z in summer and 14:00Z in winter', () => {
      expect(floatingToMs('2026-10-08T09:00:00', 'America/New_York')).toBe(utc(2026, 9, 8, 13))
      expect(floatingToMs('2026-01-15T09:00:00', 'America/New_York')).toBe(utc(2026, 0, 15, 14))
    })

    it('reads 9am in Tokyo as midnight UTC — the case the process zone cannot fake', () => {
      expect(floatingToMs('2026-10-08T09:00:00', 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 0))
      expect(floatingToMs('2026-10-08T08:00:00', 'Asia/Tokyo')).toBe(utc(2026, 9, 7, 23))
    })

    it('reads 9am in Berlin as 07:00Z in summer and 08:00Z in winter', () => {
      expect(floatingToMs('2026-07-01T09:00:00', 'Europe/Berlin')).toBe(utc(2026, 6, 1, 7))
      expect(floatingToMs('2026-01-15T09:00:00', 'Europe/Berlin')).toBe(utc(2026, 0, 15, 8))
    })

    it('accepts a time without seconds, and with a fraction', () => {
      expect(floatingToMs('2026-10-08T09:00', 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 0))
      expect(floatingToMs('2026-10-08T09:00:00.500', 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 0) + 500)
    })

    it('reads a bare date as local midnight in the zone', () => {
      expect(floatingToMs('2026-10-08', 'America/New_York')).toBe(utc(2026, 9, 8, 4))
      expect(floatingToMs('2026-10-08', 'Asia/Tokyo')).toBe(utc(2026, 9, 7, 15))
      expect(floatingToMs('2026-10-08', 'UTC')).toBe(utc(2026, 9, 8))
    })

    it('reads a fixed-offset zone with no DST at all', () => {
      expect(floatingToMs('2026-01-15T09:00:00', { utcOffsetMinutes: -240 })).toBe(utc(2026, 0, 15, 13))
      expect(floatingToMs('2026-07-15T09:00:00', { utcOffsetMinutes: -240 })).toBe(utc(2026, 6, 15, 13))
    })
  })

  describe('around DST — America/New_York', () => {
    it('uses the right offset on each side of the spring-forward night', () => {
      expect(floatingToMs('2026-03-07T09:00:00', 'America/New_York')).toBe(utc(2026, 2, 7, 14))
      expect(floatingToMs('2026-03-09T09:00:00', 'America/New_York')).toBe(utc(2026, 2, 9, 13))
      expect(floatingToMs('2026-03-08T01:59:00', 'America/New_York')).toBe(utc(2026, 2, 8, 6, 59))
      expect(floatingToMs('2026-03-08T03:00:00', 'America/New_York')).toBe(utc(2026, 2, 8, 7))
    })

    it('moves a time in the nonexistent hour forward, as new Date() does', () => {
      // 02:30 on 8 March never happens in New York; it is read as 03:30 EDT.
      const ms = floatingToMs('2026-03-08T02:30:00', 'America/New_York')
      expect(ms).toBe(utc(2026, 2, 8, 7, 30))
      // The test process runs in New York, so the browser's own answer is right here.
      expect(ms).toBe(new Date('2026-03-08T02:30:00').getTime())
    })

    it('takes the earlier of the two 01:30s on the fall-back night, as new Date() does', () => {
      const ms = floatingToMs('2026-11-01T01:30:00', 'America/New_York')
      expect(ms).toBe(utc(2026, 10, 1, 5, 30)) // 01:30 EDT, not 01:30 EST
      expect(ms).toBe(new Date('2026-11-01T01:30:00').getTime())
    })

    it('is unambiguous again either side of the repeated hour', () => {
      expect(floatingToMs('2026-11-01T00:59:00', 'America/New_York')).toBe(utc(2026, 10, 1, 4, 59))
      expect(floatingToMs('2026-11-01T02:00:00', 'America/New_York')).toBe(utc(2026, 10, 1, 7))
    })
  })

  describe('around DST — Europe/Berlin, east of UTC', () => {
    it('moves 02:30 on the spring-forward night to 03:30 CEST', () => {
      expect(floatingToMs('2026-03-29T02:30:00', 'Europe/Berlin')).toBe(utc(2026, 2, 29, 1, 30))
    })

    it('takes the earlier (CEST) 02:30 on the fall-back night', () => {
      expect(floatingToMs('2026-10-25T02:30:00', 'Europe/Berlin')).toBe(utc(2026, 9, 25, 0, 30))
      expect(floatingToMs('2026-10-25T03:00:00', 'Europe/Berlin')).toBe(utc(2026, 9, 25, 2))
    })

    it('reads midnight on the spring-forward day in winter time', () => {
      expect(floatingToMs('2026-03-29', 'Europe/Berlin')).toBe(utc(2026, 2, 28, 23))
    })
  })

  it('handles a zone whose midnight itself did not exist', () => {
    // São Paulo sprang forward at 00:00 on 4 Nov 2018, so that day began at 01:00 -02.
    expect(floatingToMs('2018-11-04', 'America/Sao_Paulo')).toBe(utc(2018, 10, 4, 3))
  })

  describe('values that are already instants', () => {
    it('parses a Z value as-is, whatever the zone', () => {
      expect(floatingToMs('2026-10-08T13:00:00Z', 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 13))
      expect(floatingToMs('2026-10-08T13:00:00.000Z', 'America/New_York')).toBe(utc(2026, 9, 8, 13))
    })

    it('parses an explicit offset as-is', () => {
      expect(floatingToMs('2026-10-08T09:00:00-04:00', 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 13))
      expect(floatingToMs('2026-10-08T09:00:00+09:00', 'America/New_York')).toBe(utc(2026, 9, 8, 0))
    })
  })

  describe('invalid input', () => {
    it('returns null for unreadable values', () => {
      for (const v of ['nonsense', '', '2026-13-01', '2026-02-30', '2026-10-08T25:00', '2026-10-08T09:60', '10/08/2026']) {
        expect(floatingToMs(v, 'America/New_York')).toBeNull()
      }
      expect(floatingToMs(null, 'America/New_York')).toBeNull()
      expect(floatingToMs(undefined, 'America/New_York')).toBeNull()
    })

    it('returns null for a floating value in an unrecognised zone', () => {
      expect(floatingToMs('2026-10-08T09:00:00', 'Not/AZone')).toBeNull()
    })
  })

  describe('with no zone — exactly what new Date() does, so client callers are unchanged', () => {
    it('reads a floating value in the process’s own zone', () => {
      expect(floatingToMs('2026-10-08T09:00:00')).toBe(new Date('2026-10-08T09:00:00').getTime())
      expect(floatingToMs('2026-10-08T09:00:00')).toBe(utc(2026, 9, 8, 13)) // New York
    })

    it('keeps JavaScript’s own reading of a bare date as UTC midnight', () => {
      expect(floatingToMs('2026-10-08')).toBe(utc(2026, 9, 8))
    })

    it('returns null where new Date() would give NaN, or 1970 for an empty value', () => {
      expect(floatingToMs('nonsense')).toBeNull()
      expect(floatingToMs('')).toBeNull()
      expect(floatingToMs(null)).toBeNull()
    })
  })
})

describe('zonedWallToMs', () => {
  it('takes the wall time written as if it were UTC', () => {
    expect(zonedWallToMs(utc(2026, 9, 8, 9), 'Asia/Tokyo')).toBe(utc(2026, 9, 8, 0))
  })

  it('returns null for an unrecognised zone or an unreadable time', () => {
    expect(zonedWallToMs(utc(2026, 9, 8, 9), 'Not/AZone')).toBeNull()
    expect(zonedWallToMs(NaN, 'Asia/Tokyo')).toBeNull()
  })
})

describe('dateStrInZone', () => {
  it('names the calendar day in the zone, not in UTC or the process', () => {
    const t = utc(2026, 9, 8, 3) // 03:00Z on the 8th
    expect(dateStrInZone(t, 'America/New_York')).toBe('2026-10-07') // 11pm the night before
    expect(dateStrInZone(t, 'Asia/Tokyo')).toBe('2026-10-08')
    expect(dateStrInZone(t, 'Europe/Berlin')).toBe('2026-10-08')
    expect(dateStrInZone(utc(2026, 9, 8, 23, 30), 'Asia/Tokyo')).toBe('2026-10-09')
  })

  it('is DST-correct where a fixed offset is an hour out', () => {
    // 04:30Z on 2 Nov is 23:30 EST on the 1st; a summer offset would call it the 2nd.
    const t = utc(2026, 10, 2, 4, 30)
    expect(dateStrInZone(t, 'America/New_York')).toBe('2026-11-01')
    expect(dateStrInZone(t, { utcOffsetMinutes: -240 })).toBe('2026-11-02')
  })

  it('accepts a Date', () => {
    expect(dateStrInZone(new Date(utc(2026, 9, 8, 3)), 'Asia/Tokyo')).toBe('2026-10-08')
  })

  it('uses the process’s own calendar when no zone is given', () => {
    expect(dateStrInZone(utc(2026, 9, 8, 3))).toBe('2026-10-07') // New York
  })

  it('returns an empty string for an unreadable instant or zone', () => {
    expect(dateStrInZone(NaN, 'Asia/Tokyo')).toBe('')
    expect(dateStrInZone(utc(2026, 9, 8), 'Not/AZone')).toBe('')
  })
})

describe('localDateOf', () => {
  it('returns a bare date untouched', () => {
    expect(localDateOf('2026-10-08', 'Asia/Tokyo')).toBe('2026-10-08')
  })

  it('reads a floating time’s own date digits, whatever the zone', () => {
    expect(localDateOf('2026-10-08T23:30:00', 'Asia/Tokyo')).toBe('2026-10-08')
    expect(localDateOf('2026-10-08T00:30:00', 'America/Los_Angeles')).toBe('2026-10-08')
  })

  it('converts an instant onto the zone’s calendar', () => {
    expect(localDateOf('2026-10-08T23:30:00Z', 'America/New_York')).toBe('2026-10-08')
    expect(localDateOf('2026-10-08T23:30:00Z', 'Asia/Tokyo')).toBe('2026-10-09')
  })

  it('returns an empty string for anything unreadable', () => {
    expect(localDateOf('nonsense', 'Asia/Tokyo')).toBe('')
    expect(localDateOf(null, 'Asia/Tokyo')).toBe('')
    expect(localDateOf(20261008, 'Asia/Tokyo')).toBe('')
  })
})

describe('addDaysToDateStr', () => {
  it('moves across months, years and DST nights by whole calendar days', () => {
    expect(addDaysToDateStr('2026-10-08', 7)).toBe('2026-10-15')
    expect(addDaysToDateStr('2026-10-28', 7)).toBe('2026-11-04')
    expect(addDaysToDateStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDateStr('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDaysToDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('returns an empty string for something that is not a bare date', () => {
    expect(addDaysToDateStr('2026-10-08T09:00:00', 1)).toBe('')
    expect(addDaysToDateStr('soon', 1)).toBe('')
  })
})

describe('formatWallTime', () => {
  const fmt = (...args) => {
    const { date, time } = formatWallTime(...args)
    return { date: plain(date), time: plain(time) }
  }

  it('formats a floating time from its own digits, with no zone conversion', () => {
    // The server is UTC; converting 09:00 "from UTC" into Tokyo would say 6:00 PM.
    expect(fmt('2026-10-08T09:00:00', 'Asia/Tokyo')).toEqual({ date: 'Thu, Oct 8', time: '9:00 AM' })
    expect(fmt('2026-10-08T21:15:00', 'America/Los_Angeles')).toEqual({ date: 'Thu, Oct 8', time: '9:15 PM' })
  })

  it('formats a bare date as a date on its own day — not the day before west of UTC', () => {
    expect(fmt('2026-10-08', 'America/Los_Angeles')).toEqual({ date: 'Thu, Oct 8', time: null })
  })

  it('converts a Z value into the reader’s zone', () => {
    expect(fmt('2026-10-08T13:00:00Z', 'America/New_York')).toEqual({ date: 'Thu, Oct 8', time: '9:00 AM' })
    expect(fmt('2026-10-08T03:00:00Z', 'America/Los_Angeles')).toEqual({ date: 'Wed, Oct 7', time: '8:00 PM' })
    expect(fmt('2026-10-08T13:00:00Z', { utcOffsetMinutes: 540 })).toEqual({ date: 'Thu, Oct 8', time: '10:00 PM' })
  })

  it('reads a Z value in UTC when the zone is unknown, rather than failing', () => {
    expect(fmt('2026-10-08T13:00:00Z', 'Not/AZone')).toEqual({ date: 'Thu, Oct 8', time: '1:00 PM' })
    expect(fmt('2026-10-08T13:00:00Z')).toEqual({ date: 'Thu, Oct 8', time: '1:00 PM' })
  })

  it('returns nulls for anything unreadable', () => {
    expect(formatWallTime('nonsense', 'Asia/Tokyo')).toEqual({ date: null, time: null })
    expect(formatWallTime('', 'Asia/Tokyo')).toEqual({ date: null, time: null })
    expect(formatWallTime(undefined, 'Asia/Tokyo')).toEqual({ date: null, time: null })
  })
})
