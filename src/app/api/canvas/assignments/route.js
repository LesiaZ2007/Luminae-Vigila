import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'
import { canvasFetchAll, mapLimit } from '@/lib/canvasFetch'

// Canvas rate-limits per token, so this is a cap on how many courses are ever in flight
// at once, not a cap on total courses.
const CONCURRENCY = 4

/**
 * POST — fetch assignments for a list of courses.
 * Body: { courses: [{ id: number, name: string }] }
 */
export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cred = await getCredential(session.userId)
  if (!cred) return Response.json({ error: 'Not connected' }, { status: 401 })

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { courses = [] } = body
  if (!courses.length) return Response.json({ assignments: [] })

  const { token, baseUrl } = cred

  /* One request per course used to run sequentially, so a student with 6 courses waited
     for 6 round trips back to back. mapLimit keeps a few in flight at once and still
     hands back results in course order, so the shape of the response is unchanged. */
  const perCourse = await mapLimit(courses, CONCURRENCY, async (course) => {
    const results = []
    try {
      const url = `${baseUrl}/api/v1/courses/${course.id}/assignments`
        + `?include[]=submission&order_by=due_at&per_page=100`

      const raw = await canvasFetchAll(url, token, {
        onPageError: err => console.error(`Canvas assignments error for course ${course.id}:`, err.message),
      })

      for (const a of raw) {
        if (Array.isArray(a.submission_types) && a.submission_types.length === 1 && a.submission_types[0] === 'not_graded') continue
        if (a.lock_at && new Date(a.lock_at) < new Date()) continue

        const sub = a.submission ?? null

        results.push({
          id:               `canvas_${a.id}`,
          canvasId:         a.id,
          courseId:         course.id,
          courseName:       course.name,
          title:            a.name ?? '(No title)',
          dueAt:            a.due_at ?? null,
          htmlUrl:          a.html_url ?? null,
          description:      a.description ?? '',
          pointsPossible:   a.points_possible ?? null,
          score:            sub?.score ?? null,
          submissionTypes:  a.submission_types ?? [],
          submittedAt:      sub?.submitted_at ?? null,
          gradedAt:         sub?.graded_at ?? null,
          submissionState:  sub?.workflow_state ?? null,
          syncedAt:         new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error(`Canvas assignments error for course ${course.id}:`, err.message)
    }
    return results
  })

  return Response.json({ assignments: perCourse.flat() })
}
