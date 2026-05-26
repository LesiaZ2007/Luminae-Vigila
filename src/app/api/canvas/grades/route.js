import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'

/**
 * GET /api/canvas/grades
 *
 * Fetches the current and final grades for each enabled Canvas course by
 * querying the Canvas enrollments endpoint.  Uses the same credential +
 * session pattern as the other Canvas routes.
 *
 * Query param: courseIds=101,102,103   (comma-separated list of course IDs)
 *
 * Returns:
 *   { grades: [{ courseId, currentScore, finalScore, currentGrade, finalGrade }] }
 */
export async function GET(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cred = await getCredential(session.userId)
  if (!cred) return Response.json({ error: 'Not connected' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('courseIds') ?? ''
  const courseIds = idsParam
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n))

  if (!courseIds.length) return Response.json({ grades: [] })

  const { token, baseUrl } = cred
  const grades = []

  for (const courseId of courseIds) {
    try {
      // Canvas: GET /api/v1/courses/:id/enrollments?user_id=self&type[]=StudentEnrollment
      const url = `${baseUrl}/api/v1/courses/${courseId}/enrollments`
        + `?user_id=self&type[]=StudentEnrollment&per_page=1`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        grades.push({ courseId, currentScore: null, finalScore: null, currentGrade: null, finalGrade: null })
        continue
      }

      const enrollments = await res.json()
      const enrollment  = Array.isArray(enrollments) ? enrollments[0] : null
      const g           = enrollment?.grades ?? {}

      grades.push({
        courseId,
        currentScore: g.current_score ?? null,   // number, e.g. 87.4
        finalScore:   g.final_score   ?? null,
        currentGrade: g.current_grade ?? null,   // letter, e.g. "B+"
        finalGrade:   g.final_grade   ?? null,
      })
    } catch (err) {
      console.error(`Canvas grades error for course ${courseId}:`, err.message)
      grades.push({ courseId, currentScore: null, finalScore: null, currentGrade: null, finalGrade: null })
    }
  }

  return Response.json({ grades })
}
