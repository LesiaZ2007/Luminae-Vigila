import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'

/**
 * POST — fetch manually-posted calendar events for given courses.
 * Body: { courseIds: number[], startDate: string, endDate: string }
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

  const { courseIds = [], startDate, endDate } = body
  if (!courseIds.length) return Response.json({ events: [] })

  const { token, baseUrl } = cred

  const contextCodes = courseIds.map(id => `course_${id}`).join('&context_codes[]=')
  const url = `${baseUrl}/api/v1/calendar_events`
    + `?context_codes[]=${contextCodes}`
    + `&type[]=event`
    + (startDate ? `&start_date=${startDate}` : '')
    + (endDate   ? `&end_date=${endDate}`     : '')
    + `&per_page=100`

  let res
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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

  // Follow pagination
  let allItems = Array.isArray(data) ? [...data] : []
  let linkHeader = res.headers.get('Link') ?? ''
  while (true) {
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    if (!match) break
    try {
      const nextRes = await fetch(match[1], { headers: { Authorization: `Bearer ${token}` } })
      if (!nextRes.ok) break
      const nextPage = await nextRes.json()
      if (Array.isArray(nextPage)) allItems.push(...nextPage)
      linkHeader = nextRes.headers.get('Link') ?? ''
    } catch { break }
  }

  const events = allItems.map(e => {
    const startAt = e.start_at ?? null
    const endAt   = e.end_at   ?? null
    const courseIdMatch = (e.context_code ?? '').match(/^course_(\d+)$/)
    const courseId = courseIdMatch ? Number(courseIdMatch[1]) : null

    return {
      id:    `canvascal_${courseId}_${e.id}`,
      title: e.title ?? '(No title)',
      start: startAt,
      end:   endAt,
      allDay: !startAt?.includes('T'),
      color:  null,
      extendedProps: {
        source:       'canvas-cal',
        courseId,
        htmlUrl:      e.html_url     ?? null,
        description:  e.description  ?? '',
        locationName: e.location_name ?? null,
      },
    }
  }).filter(e => e.start)

  return Response.json({ events })
}
