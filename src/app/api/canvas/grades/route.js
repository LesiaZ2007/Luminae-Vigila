import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'
import { canvasGet, mapLimit } from '@/lib/canvasFetch'

// Canvas rate-limits per token, so this is a cap on how many courses are ever in flight
// at once, not a cap on total courses.
const CONCURRENCY = 4

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

  /* One request per course used to run sequentially. mapLimit keeps a few in flight at
     once and still hands results back in the order courseIds was given, same as before. */
  const grades = await mapLimit(courseIds, CONCURRENCY, async (courseId) => {
    const blank = { courseId, currentScore: null, finalScore: null, currentGrade: null, finalGrade: null }
    try {
      // Canvas: GET /api/v1/courses/:id/enrollments?user_id=self&type[]=StudentEnrollment
      const url = `${baseUrl}/api/v1/courses/${courseId}/enrollments`
        + `?user_id=self&type[]=StudentEnrollment&per_page=1`

      const result = await canvasGet(url, token)
      if (!result.ok) {
        // A non-ok status is quiet — one course's grades just come back blank. A
        // network failure or an unparseable body is logged, same as the catch below.
        if (result.kind === 'network' || result.kind === 'badJson') {
          console.error(`Canvas grades error for course ${courseId}:`, result.error.message)
        }
        return blank
      }

      const enrollments = result.data
      const enrollment  = Array.isArray(enrollments) ? enrollments[0] : null
      const g           = enrollment?.grades ?? {}

      return {
        courseId,
        currentScore: g.current_score ?? null,   // number, e.g. 87.4
        finalScore:   g.final_score   ?? null,
        currentGrade: g.current_grade ?? null,   // letter, e.g. "B+"
        finalGrade:   g.final_grade   ?? null,
      }
    } catch (err) {
      console.error(`Canvas grades error for course ${courseId}:`, err.message)
      return blank
    }
  })

  return Response.json({ grades })
}
