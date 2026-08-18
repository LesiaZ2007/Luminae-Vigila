import { describe, it, expect } from 'vitest'
import {
  buildReminder, reminderLabelForMs, absoluteReminderLabel, describeReminder,
  EVENT_REMINDER_PRESETS, TASK_REMINDER_PRESETS,
} from '@/lib/reminders'

describe('buildReminder — relative offsets', () => {
  it('turns minutes into the ms the push cron subtracts', () => {
    expect(buildReminder({ minutesBefore: 30 })).toEqual({ ms: 1_800_000, label: '30 min before' })
  })

  it('matches the dropdown labels exactly, so assistant-made reminders look hand-made', () => {
    for (const p of EVENT_REMINDER_PRESETS) {
      expect(buildReminder({ minutesBefore: p.ms / 60_000 })).toEqual({ ms: p.ms, label: p.label })
    }
  })

  it('uses the task preset list when asked, where 1 day is the shortest offer', () => {
    expect(buildReminder({ minutesBefore: 1440, isTask: true })).toEqual({ ms: 86_400_000, label: '1 day before' })
    expect(buildReminder({ minutesBefore: 10080, isTask: true })).toEqual({ ms: 604_800_000, label: '1 week before' })
  })

  // The cron accepts any offset, so Corvus is not limited to the five presets —
  // but an off-preset value must not be mislabelled as a nearby one.
  it('composes an honest label for an offset with no preset', () => {
    expect(buildReminder({ minutesBefore: 40 }).label).toBe('40 min before')
    expect(buildReminder({ minutesBefore: 180 }).label).toBe('3 hrs before')
    expect(buildReminder({ minutesBefore: 3 * 1440 }).label).toBe('3 days before')
    expect(buildReminder({ minutesBefore: 14 * 1440 }).label).toBe('2 weeks before')
  })

  it('treats zero and negatives as no reminder — 0 is how an edit clears one', () => {
    expect(buildReminder({ minutesBefore: 0 })).toBeNull()
    expect(buildReminder({ minutesBefore: -30 })).toBeNull()
  })

  it('returns null for junk rather than producing NaN ms', () => {
    expect(buildReminder({ minutesBefore: 'soon' })).toBeNull()
    expect(buildReminder({})).toBeNull()
    expect(buildReminder()).toBeNull()
  })
})

describe('buildReminder — absolute times', () => {
  it('keeps local wall-clock time instead of shifting to UTC', () => {
    // toISOString() would move this by the machine's offset and fire at the wrong
    // hour for anyone not on UTC — the cron parses `at` with new Date().
    const r = buildReminder({ at: '2026-08-21T17:00' })
    expect(r.at).toBe('2026-08-21T17:00:00')
    expect(r.ms).toBe(0)
    expect(r.label).toBe(absoluteReminderLabel('2026-08-21T17:00:00'))
  })

  it('defaults a bare date to 9am rather than midnight', () => {
    expect(buildReminder({ at: '2026-08-21' }).at).toBe('2026-08-21T09:00:00')
  })

  it('lets an absolute time win over an offset, being the more specific instruction', () => {
    const r = buildReminder({ at: '2026-08-21T17:00', minutesBefore: 30 })
    expect(r.at).toBe('2026-08-21T17:00:00')
    expect(r.ms).toBe(0)
  })

  it('returns null for an unparseable time', () => {
    expect(buildReminder({ at: 'next tuesday-ish' })).toBeNull()
  })
})

describe('reminderLabelForMs', () => {
  it('prefers an exact preset', () => {
    expect(reminderLabelForMs(60 * 60_000)).toBe('1 hr before')
  })

  it('singularises correctly', () => {
    expect(reminderLabelForMs(24 * 60 * 60_000, TASK_REMINDER_PRESETS)).toBe('1 day before')
    expect(reminderLabelForMs(2 * 24 * 60 * 60_000, TASK_REMINDER_PRESETS)).toBe('2 days before')
  })
})

describe('describeReminder', () => {
  it('is empty for no reminder, so preview cards can hide the row', () => {
    expect(describeReminder(null)).toBe('')
    expect(describeReminder(undefined)).toBe('')
  })

  it('prefers the stored label so hand-made reminders read back verbatim', () => {
    expect(describeReminder({ ms: 1_800_000, label: '30 min before' })).toBe('30 min before')
  })

  it('derives a label for a reminder saved without one', () => {
    expect(describeReminder({ ms: 1_800_000 })).toBe('30 min before')
    expect(describeReminder({ at: '2026-08-21T17:00:00' })).toContain('Aug 21')
  })
})
