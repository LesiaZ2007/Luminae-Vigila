/**
 * Turning a pile of graded assignments into a grade.
 *
 * The same arithmetic was written three times — the GPA card, the Grades rail beside
 * the Courses tab, and now a class card in My Classes — and the three had already
 * begun to disagree. `GradesPanel` averaged each assignment's *percentage* and applied
 * that average to the ungraded remainder; `GpaPanel` summed points. On a course with
 * one 5-point warm-up and one 200-point final those give visibly different answers,
 * and nothing said which was the app's opinion.
 *
 * It is points, everywhere. A grade book adds up points earned over points possible;
 * averaging percentages silently reweights a quiz to the size of a final.
 *
 * Two numbers come out of it, and they answer different questions:
 *
 *   pct        what you have earned so far, out of what has been graded so far.
 *              This is "your grade right now" and it ignores unsubmitted work.
 *   projected  the same rate carried across everything still outstanding. This is
 *              "your grade at the end if nothing changes", and it is only meaningful
 *              when the course has assignments that are not graded yet.
 */

/** Standard US letter bands. Highest first — `pctToGrade` takes the first match. */
export const GPA_SCALE = [
  { min: 93, letter: 'A',  points: 4.0 },
  { min: 90, letter: 'A-', points: 3.7 },
  { min: 87, letter: 'B+', points: 3.3 },
  { min: 83, letter: 'B',  points: 3.0 },
  { min: 80, letter: 'B-', points: 2.7 },
  { min: 77, letter: 'C+', points: 2.3 },
  { min: 73, letter: 'C',  points: 2.0 },
  { min: 70, letter: 'C-', points: 1.7 },
  { min: 67, letter: 'D+', points: 1.3 },
  { min: 63, letter: 'D',  points: 1.0 },
  { min: 60, letter: 'D-', points: 0.7 },
  { min: 0,  letter: 'F',  points: 0.0 },
]

/** The band a percentage falls in. Anything below zero or non-numeric reads as F. */
export function pctToGrade(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return GPA_SCALE[GPA_SCALE.length - 1]
  return GPA_SCALE.find(g => n >= g.min) ?? GPA_SCALE[GPA_SCALE.length - 1]
}

/** Green / blue / amber / red, matching the app's palette rather than a gradient. */
export function gradeColor(letter) {
  if (typeof letter !== 'string') return '#ef4444'
  if (letter.startsWith('A')) return '#10b981'
  if (letter.startsWith('B')) return '#3a6fa8'
  if (letter.startsWith('C')) return '#f59e0b'
  return '#ef4444'
}

/** An assignment counts toward the total only if it is worth something. */
function isWeighted(a) {
  return a?.pointsPossible != null && Number(a.pointsPossible) > 0
}

/** …and toward your current grade only once it has a score. */
function isGraded(a) {
  return isWeighted(a) && a.score != null && Number.isFinite(Number(a.score))
}

/**
 * Summarise one course's assignments.
 *
 * Returns `null` when nothing has been graded — a course with no scores yet has no
 * grade, and rendering 0% for it would read as an F rather than as "not started".
 *
 * @returns {{earnedPts, possiblePts, totalPossible, pct, projected, grade, gradedCount, totalCount}|null}
 */
export function courseGradeSummary(assignments = []) {
  const weighted = (assignments ?? []).filter(isWeighted)
  const graded   = weighted.filter(isGraded)
  if (graded.length === 0) return null

  const earnedPts     = graded.reduce((s, a) => s + Number(a.score), 0)
  const possiblePts   = graded.reduce((s, a) => s + Number(a.pointsPossible), 0)
  const totalPossible = weighted.reduce((s, a) => s + Number(a.pointsPossible), 0)
  const pct           = possiblePts > 0 ? (earnedPts / possiblePts) * 100 : 0

  // Carrying the current rate over the outstanding work. When everything is graded
  // this is just `pct`, which is correct rather than a special case.
  const outstanding = Math.max(0, totalPossible - possiblePts)
  const projected   = totalPossible > 0
    ? ((earnedPts + (pct / 100) * outstanding) / totalPossible) * 100
    : pct

  return {
    earnedPts, possiblePts, totalPossible,
    pct, projected,
    grade: pctToGrade(pct),
    gradedCount: graded.length,
    totalCount:  weighted.length,
  }
}

/**
 * What you need on the remaining points to finish at `targetPct`.
 *
 * Returns null when there is nothing left to earn — the grade is already final and
 * "you need 0%" would be a strange thing to say about it. The result is deliberately
 * not clamped: being told you need 112% is the honest answer, and the caller can
 * present that as "not reachable" with more context than this has.
 */
export function neededForTarget(summary, targetPct) {
  if (!summary) return null
  const outstanding = summary.totalPossible - summary.possiblePts
  if (outstanding <= 0) return null
  const need = (targetPct / 100) * summary.totalPossible - summary.earnedPts
  return (need / outstanding) * 100
}
