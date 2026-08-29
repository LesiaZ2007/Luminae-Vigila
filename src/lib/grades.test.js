import { describe, it, expect } from 'vitest'
import {
  GPA_SCALE, pctToGrade, gradeColor, courseGradeSummary, neededForTarget,
} from '@/lib/grades'

const a = (score, pointsPossible) => ({ id: String(Math.random()), score, pointsPossible })

describe('pctToGrade', () => {
  it('takes the highest band the score reaches', () => {
    expect(pctToGrade(95).letter).toBe('A')
    expect(pctToGrade(93).letter).toBe('A')
    expect(pctToGrade(92.9).letter).toBe('A-')
    expect(pctToGrade(70).letter).toBe('C-')
    expect(pctToGrade(0).letter).toBe('F')
  })

  it('reads junk and negatives as F rather than returning undefined', () => {
    expect(pctToGrade(-5).letter).toBe('F')
    expect(pctToGrade(NaN).letter).toBe('F')
    expect(pctToGrade(undefined).letter).toBe('F')
  })

  it('covers every percentage — the scale bottoms out at zero', () => {
    expect(GPA_SCALE[GPA_SCALE.length - 1].min).toBe(0)
  })
})

describe('gradeColor', () => {
  it('groups by letter family, not by exact grade', () => {
    expect(gradeColor('A-')).toBe(gradeColor('A'))
    expect(gradeColor('B+')).toBe(gradeColor('B'))
    expect(gradeColor('D')).toBe(gradeColor('F'))
  })

  it('does not throw on a missing letter', () => {
    expect(gradeColor(undefined)).toBe('#ef4444')
  })
})

describe('courseGradeSummary', () => {
  // A course with no scores yet has no grade. Rendering 0% would read as an F
  // rather than as "not started".
  it('is null when nothing has been graded', () => {
    expect(courseGradeSummary([])).toBeNull()
    expect(courseGradeSummary([{ pointsPossible: 100 }])).toBeNull()
    expect(courseGradeSummary()).toBeNull()
  })

  it('divides points earned by points graded', () => {
    const s = courseGradeSummary([a(45, 50), a(40, 50)])
    expect(s.earnedPts).toBe(85)
    expect(s.possiblePts).toBe(100)
    expect(s.pct).toBe(85)
    expect(s.grade.letter).toBe('B')
  })

  // The bug this file exists to settle: averaging each assignment's percentage
  // weights a 5-point warm-up the same as a 200-point final.
  it('weights by points, not by assignment count', () => {
    const s = courseGradeSummary([a(5, 5), a(100, 200)])
    expect(s.pct).toBeCloseTo((105 / 205) * 100, 6)   // 51.2%, not (100% + 50%) / 2
  })

  it('carries the current rate across work that is not graded yet', () => {
    const s = courseGradeSummary([a(90, 100), { pointsPossible: 100 }])
    expect(s.pct).toBe(90)
    expect(s.projected).toBeCloseTo(90, 6)
    expect(s.totalPossible).toBe(200)
  })

  it('projects the same number as the current grade once everything is graded', () => {
    const s = courseGradeSummary([a(90, 100), a(80, 100)])
    expect(s.projected).toBeCloseTo(s.pct, 6)
  })

  it('ignores zero-point and unweighted assignments in both totals', () => {
    const s = courseGradeSummary([a(90, 100), a(0, 0), { score: 10 }])
    expect(s.totalPossible).toBe(100)
    expect(s.totalCount).toBe(1)
  })

  it('counts a zero score, which is a grade and not a missing one', () => {
    const s = courseGradeSummary([a(0, 100), a(100, 100)])
    expect(s.gradedCount).toBe(2)
    expect(s.pct).toBe(50)
  })
})

describe('neededForTarget', () => {
  it('says what the remaining points have to average', () => {
    // 90/100 earned, 100 points outstanding, want 90% of 200 = 180 → need 90 more.
    const s = courseGradeSummary([a(90, 100), { pointsPossible: 100 }])
    expect(neededForTarget(s, 90)).toBeCloseTo(90, 6)
  })

  // Not clamped on purpose: "you need 112%" is the honest answer, and the caller
  // has the context to present it as out of reach.
  it('returns an impossible number rather than hiding one', () => {
    const s = courseGradeSummary([a(50, 100), { pointsPossible: 100 }])
    expect(neededForTarget(s, 90)).toBeGreaterThan(100)
  })

  it('is null when the grade is already final', () => {
    const s = courseGradeSummary([a(90, 100)])
    expect(neededForTarget(s, 95)).toBeNull()
    expect(neededForTarget(null, 95)).toBeNull()
  })
})
