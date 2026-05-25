import { getCredential } from '@/lib/canvasTokenStore'

/**
 * POST — fetch manually-posted calendar events (not assignments) for given courses.
 * Body: { courseIds: number[], startDate: string (YYYY-MM-DD), endDate: string (YYYY-MM-DD) }
 * Returns: { events: NormalizedCalendarEvent[] }
 *
 * Uses &type[]=event to exclude assignment-type events (those are handled separately).
 */
export async function POST(request) {
  const cred = await getCredential()
  if (!cred) return Response.json({ error: 'Not connected' }, { status: 401 })

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { courseIds = [], startDate, endDate } = body
  if (!courseIds.length) return Response.json({ events: [] })

  const { token, baseUrl } = cred

  // Build context_codes array: course_12345 for each course
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
    // Determine courseId from context_code (format: "course_12345")
    const courseIdMatch = (e.context_code ?? '').match(/^course_(\d+)$/)
    const courseId = courseIdMatch ? Number(courseIdMatch[1]) : null

    return {
      id:    `canvascal_${courseId}_${e.id}`,
      title: e.title ?? '(No title)',
      start: startAt,
      end:   endAt,
      allDay: !startAt?.includes('T'),
      color:  null, // client applies course color from prefs
      extendedProps: {
        source:       'canvas-cal',
        courseId,
        htmlUrl:      e.html_url     ?? null,
        description:  e.description  ?? '',
        locationName: e.location_name ?? null,
      },
    }
  }).filter(e => e.start) // drop events with no start time

  return Response.json({ events })
}
