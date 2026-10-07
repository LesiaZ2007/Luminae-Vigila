import { getCredential } from '@/lib/canvasTokenStore'
import { getSession }    from '@/lib/session'
import { canvasGet, canvasFetchAll, nextLinkFrom } from '@/lib/canvasFetch'

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

  const first = await canvasGet(url, token)

  if (!first.ok) {
    if (first.kind === 'network')      return Response.json({ error: `Could not reach Canvas: ${first.error.message}` }, { status: 502 })
    if (first.kind === 'unauthorized') return Response.json({ error: 'Canvas token expired or invalid.' }, { status: 401 })
    if (first.kind === 'badJson')      return Response.json({ error: 'Unexpected response from Canvas.' }, { status: 502 })
    return Response.json({ error: `Canvas returned status ${first.status}` }, { status: 502 })
  }

  // Pagination beyond the first page is best-effort, same as assignments' walk: a page
  // that fails simply ends the list rather than failing the whole request, since the
  // first (already-validated) page's events are worth returning either way.
  const firstItems = Array.isArray(first.data) ? first.data : []
  const nextUrl     = nextLinkFrom(first.res.headers.get('Link'))
  const restItems   = nextUrl ? await canvasFetchAll(nextUrl, token) : []
  const allItems    = [...firstItems, ...restItems]

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
