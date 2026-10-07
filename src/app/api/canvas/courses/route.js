import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'
import { canvasGet }     from '@/lib/canvasFetch'

/** GET — fetch active student course enrollments */
export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const cred = await getCredential(session.userId)
  if (!cred) return Response.json({ error: 'Not connected' }, { status: 401 })

  const { token, baseUrl } = cred

  const result = await canvasGet(
    `${baseUrl}/api/v1/courses?enrollment_state=active&enrollment_type[]=student&per_page=50`,
    token,
  )

  if (!result.ok) {
    if (result.kind === 'network')      return Response.json({ error: `Could not reach Canvas: ${result.error.message}` }, { status: 502 })
    if (result.kind === 'unauthorized') return Response.json({ error: 'Canvas token expired or invalid.' }, { status: 401 })
    if (result.kind === 'badJson')      return Response.json({ error: 'Unexpected response from Canvas.' }, { status: 502 })
    return Response.json({ error: `Canvas returned status ${result.status}` }, { status: 502 })
  }

  const courses = (Array.isArray(result.data) ? result.data : []).map(c => ({
    id:         c.id,
    name:       c.name,
    courseCode: c.course_code ?? '',
  }))

  return Response.json({ courses })
}
