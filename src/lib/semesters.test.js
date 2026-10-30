import { describe, it, expect } from 'vitest'
import {
  defaultSemesterName, semesterOf, semesterKey, semestersFrom, isSemesterOver,
  defaultSemester, semesterRangeLabel, moveSemester,
} from './semesters'

/** Three named semesters, and classes that sit in them. */
const SPRING = { semesterName: 'Spring 2026', semesterStart: '2026-01-12', semesterEnd: '2026-05-08' }
const FALL   = { semesterName: 'Fall 2026',   semesterStart: '2026-08-24', semesterEnd: '2026-12-11' }
const LAST   = { semesterName: 'Fall 2025',   semesterStart: '2025-08-25', semesterEnd: '2025-12-12' }

const CHEM    = { id: 'chem', courseName: 'Organic Chemistry', ...SPRING }
const CALC    = { id: 'calc', courseName: 'Calculus II',       ...SPRING }
const ART     = { id: 'art',  courseName: 'Studio Art',        ...FALL }
const OLD     = { id: 'old',  courseName: 'Intro Biology',     ...LAST }
const UNDATED = { id: 'x',    courseName: 'Someday' }

/** Same dates as the spring, but no name saved. */
const UNNAMED = { id: 'h', courseName: 'Old Spring Class', semesterStart: '2026-01-12', semesterEnd: '2026-05-08' }

/** Where a semester gets moved to. */
const MOVED = { name: 'Spring Term 2026', start: '2026-01-19', end: '2026-05-15' }

describe('defaultSemesterName', () => {
  it('names a January start Spring', () => {
    expect(defaultSemesterName('2026-01-12')).toBe('Spring 2026')
  })

  it('keeps April in Spring', () => {
    expect(defaultSemesterName('2026-04-30')).toBe('Spring 2026')
  })

  it('names May through July Summer', () => {
    expect(defaultSemesterName('2026-05-01')).toBe('Summer 2026')
    expect(defaultSemesterName('2026-07-31')).toBe('Summer 2026')
  })

  it('names August on Fall', () => {
    expect(defaultSemesterName('2026-08-01')).toBe('Fall 2026')
    expect(defaultSemesterName('2026-12-15')).toBe('Fall 2026')
  })

  it('is empty for no date', () => {
    expect(defaultSemesterName('')).toBe('')
    expect(defaultSemesterName(null)).toBe('')
    expect(defaultSemesterName(undefined)).toBe('')
  })

  it('is empty for garbage', () => {
    expect(defaultSemesterName('soon')).toBe('')
    expect(defaultSemesterName('2026')).toBe('')
    expect(defaultSemesterName('abc-def')).toBe('')
  })
})

describe('semesterKey', () => {
  it('joins the name and both dates', () => {
    expect(semesterKey({ name: 'Fall 2026', start: '2026-08-24', end: '2026-12-11' }))
      .toBe('Fall 2026|2026-08-24|2026-12-11')
  })
})

describe('semesterOf', () => {
  it('reads the saved name and dates', () => {
    expect(semesterOf(CHEM)).toEqual({
      key: 'Spring 2026|2026-01-12|2026-05-08',
      name: 'Spring 2026',
      start: '2026-01-12',
      end: '2026-05-08',
    })
  })

  it('names an unnamed class from its start month', () => {
    expect(semesterOf(UNNAMED).name).toBe('Spring 2026')
  })

  it('treats a blank name as no name', () => {
    expect(semesterOf({ ...CHEM, semesterName: '   ' }).name).toBe('Spring 2026')
  })

  it('trims the saved name', () => {
    expect(semesterOf({ ...FALL, semesterName: '  Fall 2026 ' }).name).toBe('Fall 2026')
  })

  it('gives an unnamed class the same key as a named one with those dates', () => {
    expect(semesterOf(UNNAMED).key).toBe(semesterOf(CHEM).key)
  })

  it('is null without dates', () => {
    expect(semesterOf(UNDATED)).toBeNull()
    expect(semesterOf({ id: 'y', semesterStart: '2026-01-12' })).toBeNull()
    expect(semesterOf({ id: 'z', semesterEnd: '2026-05-08' })).toBeNull()
    expect(semesterOf(null)).toBeNull()
  })
})

describe('semestersFrom', () => {
  it('lists a semester once however many classes share it', () => {
    expect(semestersFrom([CHEM, CALC])).toHaveLength(1)
  })

  it('lists the newest semester first', () => {
    expect(semestersFrom([OLD, CHEM, ART]).map(s => s.name))
      .toEqual(['Fall 2026', 'Spring 2026', 'Fall 2025'])
  })

  it('skips classes with no dates', () => {
    expect(semestersFrom([UNDATED, CHEM]).map(s => s.name)).toEqual(['Spring 2026'])
  })

  it('groups an unnamed class with the named one it matches', () => {
    expect(semestersFrom([CHEM, UNNAMED])).toHaveLength(1)
  })

  it('keeps same-named semesters with different dates apart', () => {
    const later = { ...CHEM, semesterStart: '2026-02-01', semesterEnd: '2026-06-01' }
    expect(semestersFrom([CHEM, later])).toHaveLength(2)
  })

  it('is empty for no classes', () => {
    expect(semestersFrom()).toEqual([])
    expect(semestersFrom([])).toEqual([])
  })
})

describe('isSemesterOver', () => {
  it('is true once the semester has ended', () => {
    expect(isSemesterOver(CHEM, '2026-05-09')).toBe(true)
  })

  it('is false on the last day', () => {
    expect(isSemesterOver(CHEM, '2026-05-08')).toBe(false)
  })

  it('is false while the semester runs', () => {
    expect(isSemesterOver(CHEM, '2026-03-01')).toBe(false)
  })

  it('is false without an end date', () => {
    expect(isSemesterOver(UNDATED, '2026-03-01')).toBe(false)
  })
})

describe('defaultSemester', () => {
  const semesters = semestersFrom([OLD, CHEM, ART])

  it('picks the one running today', () => {
    expect(defaultSemester(semesters, '2026-03-01').name).toBe('Spring 2026')
  })

  it('counts the first day as running', () => {
    expect(defaultSemester(semesters, '2026-01-12').name).toBe('Spring 2026')
  })

  it('counts the last day as running', () => {
    expect(defaultSemester(semesters, '2026-05-08').name).toBe('Spring 2026')
  })

  it('falls back to the next one to start between semesters', () => {
    expect(defaultSemester(semesters, '2026-06-15').name).toBe('Fall 2026')
  })

  it('picks the earliest upcoming one before any semester starts', () => {
    expect(defaultSemester(semesters, '2025-06-01').name).toBe('Fall 2025')
  })

  it('never picks a finished semester', () => {
    expect(defaultSemester(semestersFrom([OLD]), '2026-03-01')).toBeNull()
  })

  it('is null when nothing is running or coming', () => {
    expect(defaultSemester(semesters, '2027-01-01')).toBeNull()
    expect(defaultSemester([], '2026-03-01')).toBeNull()
  })
})

describe('semesterRangeLabel', () => {
  it('reads as month and day, with the year at the end', () => {
    expect(semesterRangeLabel({ start: '2026-01-12', end: '2026-05-08' }))
      .toBe('Jan 12 – May 8, 2026')
  })

  it('drops the leading zero on the day', () => {
    expect(semesterRangeLabel({ start: '2026-08-04', end: '2026-12-01' }))
      .toBe('Aug 4 – Dec 1, 2026')
  })
})

describe('moveSemester', () => {
  const from = semesterOf(CHEM)

  it('rewrites only the classes in that semester', () => {
    const moved = moveSemester([CHEM, CALC, ART], from, MOVED)
    expect(moved.map(c => c.id)).toEqual(['chem', 'calc'])
    expect(moved.every(c => c.semesterName === 'Spring Term 2026')).toBe(true)
    expect(moved.every(c => c.semesterStart === '2026-01-19')).toBe(true)
    expect(moved.every(c => c.semesterEnd === '2026-05-15')).toBe(true)
  })

  it('moves an unnamed class that falls in that semester', () => {
    const moved = moveSemester([UNNAMED, ART], from, MOVED)
    expect(moved.map(c => c.id)).toEqual(['h'])
  })

  it('leaves the class being saved alone', () => {
    const moved = moveSemester([CHEM, CALC], from, MOVED, 'chem')
    expect(moved.map(c => c.id)).toEqual(['calc'])
  })

  it('compares ids as strings', () => {
    const classes = [{ ...CHEM, id: 7 }, { ...CALC, id: 8 }]
    expect(moveSemester(classes, from, MOVED, '7').map(c => c.id)).toEqual([8])
  })

  it('skips undated classes', () => {
    expect(moveSemester([UNDATED, CHEM], from, MOVED).map(c => c.id)).toEqual(['chem'])
  })

  it('moves nothing when no class is in that semester', () => {
    expect(moveSemester([ART, OLD], from, MOVED)).toEqual([])
  })

  it('returns copies and leaves the originals untouched', () => {
    const before = CHEM.semesterStart
    const moved = moveSemester([CHEM], from, MOVED)
    expect(moved[0]).not.toBe(CHEM)
    expect(CHEM.semesterStart).toBe(before)
    expect(CHEM.semesterName).toBe('Spring 2026')
  })
})
