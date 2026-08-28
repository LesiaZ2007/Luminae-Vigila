import { describe, it, expect } from 'vitest'
import {
  isDateStr, getExceptions, isCancelled, cancelInstance, restoreInstance,
  addInstance, removeInstance, eventDate, applyExceptions,
  examFor, setExamInstance, clearExamInstance,
} from './classInstances'

const CLS = { id: 'cls1', courseName: 'Physics 101', days: [1, 3, 5], startTime: '09:00', endTime: '09:50' }

describe('isDateStr', () => {
  it('accepts a local calendar date', () => {
    expect(isDateStr('2026-08-25')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const v of ['2026-8-25', '2026-13-01', '2026-00-10', '2026-08-32', '', null, 42]) {
      expect(isDateStr(v), String(v)).toBe(false)
    }
  })
})

describe('cancelInstance', () => {
  it('marks one date as cancelled without touching the pattern', () => {
    const out = cancelInstance(CLS, '2026-08-25')
    expect(isCancelled(out, '2026-08-25')).toBe(true)
    expect(out.days).toEqual([1, 3, 5])
    expect(out.startTime).toBe('09:00')
  })

  it('stamps updatedAt so the change survives the sync merge', () => {
    expect(cancelInstance(CLS, '2026-08-25').updatedAt).toBeTruthy()
  })

  it('is idempotent and returns the same object when nothing changes', () => {
    const once = cancelInstance(CLS, '2026-08-25')
    expect(cancelInstance(once, '2026-08-25')).toBe(once)
  })

  it('ignores a malformed date', () => {
    expect(cancelInstance(CLS, 'tuesday')).toBe(CLS)
  })

  it('keeps cancelled dates sorted', () => {
    let c = cancelInstance(CLS, '2026-09-01')
    c = cancelInstance(c, '2026-08-25')
    expect(getExceptions(c).cancelled).toEqual(['2026-08-25', '2026-09-01'])
  })
})

describe('restoreInstance', () => {
  it('puts a cancelled meeting back', () => {
    const c = restoreInstance(cancelInstance(CLS, '2026-08-25'), '2026-08-25')
    expect(isCancelled(c, '2026-08-25')).toBe(false)
  })

  it('does nothing for a date that was never cancelled', () => {
    expect(restoreInstance(CLS, '2026-08-25')).toBe(CLS)
  })
})

describe('addInstance', () => {
  it('adds a one-off meeting', () => {
    const c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    expect(getExceptions(c).added).toEqual([{ date: '2026-08-26', startTime: '14:00', endTime: '15:00' }])
  })

  it('keeps an optional location and note', () => {
    const c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00', location: 'Lab 2', note: 'Review' })
    expect(getExceptions(c).added[0]).toMatchObject({ location: 'Lab 2', note: 'Review' })
  })

  it('replaces rather than stacks a second extra on the same day', () => {
    let c = addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    c = addInstance(c, { date: '2026-08-26', startTime: '16:00', endTime: '17:00' })
    const { added } = getExceptions(c)
    expect(added).toHaveLength(1)
    expect(added[0].startTime).toBe('16:00')
  })

  it('refuses an end at or before the start', () => {
    expect(addInstance(CLS, { date: '2026-08-26', startTime: '15:00', endTime: '15:00' })).toBe(CLS)
    expect(addInstance(CLS, { date: '2026-08-26', startTime: '16:00', endTime: '15:00' })).toBe(CLS)
  })

  it('refuses an incomplete entry', () => {
    expect(addInstance(CLS, { date: '2026-08-26' })).toBe(CLS)
    expect(addInstance(CLS, {})).toBe(CLS)
    expect(addInstance(CLS)).toBe(CLS)
  })

  it('keeps extras sorted by date', () => {
    let c = addInstance(CLS, { date: '2026-09-02', startTime: '14:00', endTime: '15:00' })
    c = addInstance(c, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' })
    expect(getExceptions(c).added.map(a => a.date)).toEqual(['2026-08-26', '2026-09-02'])
  })
})

describe('removeInstance', () => {
  it('drops a one-off meeting', () => {
    const c = removeInstance(addInstance(CLS, { date: '2026-08-26', startTime: '14:00', endTime: '15:00' }), '2026-08-26')
    expect(getExceptions(c).added).toEqual([])
  })

  it('does nothing when there is no extra that day', () => {
    expect(removeInstance(CLS, '2026-08-26')).toBe(CLS)
  })
})

describe('getExceptions', () => {
  it('copes with a class that has never had an exception', () => {
    expect(getExceptions(CLS)).toEqual({ cancelled: [], added: [], exams: [] })
    expect(getExceptions(undefined)).toEqual({ cancelled: [], added: [], exams: [] })
  })

  it('discards malformed entries rather than trusting stored data', () => {
    const messy = { exceptions: { cancelled: ['2026-08-25', 'nope', null], added: [{ date: 'bad' }, { date: '2026-08-26' }] } }
    expect(getExceptions(messy).cancelled).toEqual(['2026-08-25'])
    expect(getExceptions(messy).added).toHaveLength(1)
  })

  it('copes with the field being the wrong type entirely', () => {
    expect(getExceptions({ exceptions: { cancelled: 'no', added: 7, exams: {} } })).toEqual({ cancelled: [], added: [], exams: [] })
  })
})

describe('eventDate', () => {
  it('reads the day off an ISO string without timezone drift', () => {
    expect(eventDate({ start: '2026-08-25T23:30:00' })).toBe('2026-08-25')
  })

  it('reads the day off a Date in local time', () => {
    expect(eventDate({ start: new Date(2026, 7, 25, 23, 30) })).toBe('2026-08-25')
  })

  it('returns null with no start', () => {
    expect(eventDate({})).toBeNull()
  })
})

describe('applyExceptions', () => {
  const expanded = [
    { id: 'a', start: '2026-08-24T09:00:00' },
    { id: 'b', start: '2026-08-25T09:00:00' },
    { id: 'c', start: '2026-08-26T09:00:00' },
  ]
  const makeExtra = a => ({ id: 'extra_' + a.date, start: a.date + 'T' + a.startTime + ':00' })

  it('drops cancelled meetings', () => {
    const c = cancelInstance(CLS, '2026-08-25')
    expect(applyExceptions(c, expanded, makeExtra).map(e => e.id)).toEqual(['a', 'c'])
  })

  it('appends extras', () => {
    const c = addInstance(CLS, { date: '2026-08-29', startTime: '14:00', endTime: '15:00' })
    expect(applyExceptions(c, expanded, makeExtra).map(e => e.id)).toContain('extra_2026-08-29')
  })

  it('allows an extra on a cancelled date, which is how a moved class is expressed', () => {
    let c = cancelInstance(CLS, '2026-08-25')
    c = addInstance(c, { date: '2026-08-25', startTime: '14:00', endTime: '15:00' })
    const ids = applyExceptions(c, expanded, makeExtra).map(e => e.id)
    expect(ids).not.toContain('b')
    expect(ids).toContain('extra_2026-08-25')
  })

  it('leaves an untouched class exactly as expanded', () => {
    expect(applyExceptions(CLS, expanded, makeExtra)).toHaveLength(3)
  })
})

describe('exam blocks', () => {
  const ev = (date) => ({ id: `e-${date}`, start: `${date}T09:00:00`, end: `${date}T09:50:00`, title: 'Physics 101' })

  it('marks a period as an exam', () => {
    const c = setExamInstance(CLS, { date: '2026-09-14', title: 'Midterm 1' })
    expect(examFor(c, '2026-09-14')).toEqual({ date: '2026-09-14', title: 'Midterm 1' })
  })

  it('leaves out the fields that were not given, so the exam follows the class', () => {
    // An omitted time must not be frozen to today's schedule — if the period later
    // moves to 10:00 the exam has to move with it.
    const c = setExamInstance(CLS, { date: '2026-09-14' })
    expect(examFor(c, '2026-09-14')).toEqual({ date: '2026-09-14' })
  })

  it('keeps the given time when there is one', () => {
    const c = setExamInstance(CLS, { date: '2026-09-14', startTime: '09:00', endTime: '11:00', location: 'Gym' })
    expect(examFor(c, '2026-09-14')).toMatchObject({ startTime: '09:00', endTime: '11:00', location: 'Gym' })
  })

  it('refuses a backwards time range', () => {
    expect(setExamInstance(CLS, { date: '2026-09-14', startTime: '11:00', endTime: '09:00' })).toBe(CLS)
  })

  it('refuses a bad date', () => {
    expect(setExamInstance(CLS, { date: 'next Tuesday' })).toBe(CLS)
    expect(setExamInstance(CLS, {})).toBe(CLS)
  })

  it('replaces an exam on the same date rather than stacking one', () => {
    let c = setExamInstance(CLS, { date: '2026-09-14', title: 'Midterm' })
    c = setExamInstance(c, { date: '2026-09-14', title: 'Midterm (rescheduled)' })
    expect(getExceptions(c).exams).toHaveLength(1)
    expect(examFor(c, '2026-09-14').title).toBe('Midterm (rescheduled)')
  })

  it('un-cancels the date, because an exam is a meeting', () => {
    // Otherwise the exam is filed and the calendar shows nothing that day.
    const cancelled = cancelInstance(CLS, '2026-09-14')
    const c = setExamInstance(cancelled, { date: '2026-09-14' })
    expect(isCancelled(c, '2026-09-14')).toBe(false)
  })

  it('clears back to an ordinary period', () => {
    const c = clearExamInstance(setExamInstance(CLS, { date: '2026-09-14' }), '2026-09-14')
    expect(examFor(c, '2026-09-14')).toBeNull()
  })

  it('returns the same object when there is nothing to clear', () => {
    expect(clearExamInstance(CLS, '2026-09-14')).toBe(CLS)
  })

  it('stamps updatedAt so the change survives a sync', () => {
    expect(setExamInstance(CLS, { date: '2026-09-14' }).updatedAt).toBeTruthy()
    expect(clearExamInstance(setExamInstance(CLS, { date: '2026-09-14' }), '2026-09-14').updatedAt).toBeTruthy()
  })

  it('does not drop the other exception lists on the way past', () => {
    // Each writer touches one list; a rebuild rather than a merge silently lost the rest.
    let c = cancelInstance(CLS, '2026-09-01')
    c = addInstance(c, { date: '2026-09-08', startTime: '13:00', endTime: '14:00' })
    c = setExamInstance(c, { date: '2026-09-14' })
    const ex = getExceptions(c)
    expect(ex.cancelled).toEqual(['2026-09-01'])
    expect(ex.added).toHaveLength(1)
    expect(ex.exams).toHaveLength(1)

    const after = cancelInstance(c, '2026-09-21')
    expect(getExceptions(after).exams).toHaveLength(1)
    expect(getExceptions(after).added).toHaveLength(1)
  })

  it('ignores a stored exams value that is not a list of dated entries', () => {
    expect(getExceptions({ exceptions: { exams: 'nope' } }).exams).toEqual([])
    expect(getExceptions({ exceptions: { exams: [{ title: 'no date' }] } }).exams).toEqual([])
  })
})

describe('applyExceptions with exams', () => {
  const ev = (date) => ({ id: `e-${date}`, start: `${date}T09:00:00`, title: 'Physics 101' })
  const asExam = (event, exam) => ({ ...event, title: exam.title ?? `${event.title} — Exam`, isExam: true })

  it('transforms the meeting on that date and leaves the rest alone', () => {
    const c = setExamInstance(CLS, { date: '2026-09-14', title: 'Midterm 1' })
    const out = applyExceptions(c, [ev('2026-09-11'), ev('2026-09-14')], () => ({}), asExam)
    expect(out.find(e => e.id === 'e-2026-09-14')).toMatchObject({ title: 'Midterm 1', isExam: true })
    expect(out.find(e => e.id === 'e-2026-09-11').isExam).toBeUndefined()
  })

  it('is a no-op without a transform, so existing callers are unaffected', () => {
    const c = setExamInstance(CLS, { date: '2026-09-14' })
    const out = applyExceptions(c, [ev('2026-09-14')], () => ({}))
    expect(out[0].isExam).toBeUndefined()
  })

  it('can turn an added one-off into the exam', () => {
    let c = addInstance(CLS, { date: '2026-09-20', startTime: '13:00', endTime: '15:00' })
    c = setExamInstance(c, { date: '2026-09-20' })
    const out = applyExceptions(c, [], a => ({ id: `x-${a.date}`, start: `${a.date}T13:00:00`, title: 'Physics 101' }), asExam)
    expect(out[0].isExam).toBe(true)
  })

  it('carries an exam whose meeting no longer exists rather than discarding it', () => {
    // Marked, then the date was cancelled from elsewhere. Restoring the date has to
    // bring the exam back, which it cannot do if marking had been destructive.
    let c = setExamInstance(CLS, { date: '2026-09-14' })
    c = { ...c, exceptions: { ...c.exceptions, cancelled: ['2026-09-14'] } }
    expect(applyExceptions(c, [ev('2026-09-14')], () => ({}), asExam)).toEqual([])
    expect(examFor(c, '2026-09-14')).toBeTruthy()
  })
})
