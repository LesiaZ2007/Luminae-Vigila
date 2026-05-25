import { getCredential } from '@/lib/canvasTokenStore'

/** GET — fetch active student course enrollments */
export async function GET() {
  const cred = await getCredential()
  if (!cred) return Response.json({ error: 'Not connected' }, { status: 401 })

  const { token, baseUrl } = cred

  let res
  try {
    res = await fetch(
      `${baseUrl}/api/v1/courses?enrollment_state=active&enrollment_type[]=student&per_page=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
  } catch (err) {
    return Response.json({ error: `Could not reach Canvas: ${err.message}` }, { status: 502 })
  }

  if (res.status === 401) {
    return Response.json({ error: 'Canvas token expired or invalid.' }, { status: 401 })
  }
  if (!res.ok) {
    return Response.json({ error: `Canvas returned status ${res.status}` }, { status: 502 })
  }

  let data
  try { data = await res.json() } catch {
    return Response.json({ error: 'Unexpected response from Canvas.' }, { status: 502 })
  }

  const courses = (Array.isArray(data) ? data : []).map(c => ({
    id:         c.id,
    name:       c.name,
    courseCode: c.course_code ?? '',
  }))

  return Response.json({ courses })
}
