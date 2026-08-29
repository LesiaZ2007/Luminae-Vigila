/**
 * The colour a Canvas course is drawn in.
 *
 * Lived in CoursesPanel until the Courses tab was folded into My Classes. It was
 * always the odd thing in there — four unrelated modules imported a colour helper
 * from a panel component, which meant importing a panel to draw a dot.
 *
 * A user-chosen colour always wins. The fallback is derived from the course id
 * rather than from its position in a list, so a course keeps its colour when
 * another is added, dropped, or finishes.
 */

export const COURSE_PALETTE = [
  '#3a6fa8', '#10b981', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
]

/** Canvas's own orange, for chrome that is about Canvas rather than about a course. */
export const CANVAS_COLOR = '#E8751A'

export function getCourseColor(courseId, courseColors) {
  if (courseColors?.[courseId]) return courseColors[courseId]
  return COURSE_PALETTE[Math.abs(Number(courseId) || 0) % COURSE_PALETTE.length]
}
