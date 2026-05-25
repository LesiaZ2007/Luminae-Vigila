import { google }           from 'googleapis'
import { getAccount }       from '@/lib/googleTokenStore'
import { clientForAccount } from '@/lib/googleAuth'
import { getSession }       from '@/lib/session'

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { requests = [] } = await request.json()

  // Fetch events from -14 days to +60 days
  const now     = new Date()
  const timeMin = new Date(now); timeMin.setDate(timeMin.getDate() - 14)
  const timeMax = new Date(now); timeMax.setDate(timeMax.getDate() + 60)

  const allEvents = []

  for (const req of requests) {
    const { accountId, calendarIds = [], calendarColors = {} } = req

    // Scope account lookup to the current user — prevents cross-user access
    const account = await getAccount(accountId, session.userId)
    if (!account) continue

    let auth
    try {
      auth = clientForAccount(account)
    } catch { continue }

    const calApi = google.calendar({ version: 'v3', auth })

    for (const calId of calendarIds) {
      try {
        const color    = calendarColors[calId] ?? '#4285f4'
        const { data } = await calApi.events.list({
          calendarId:   calId,
          timeMin:      timeMin.toISOString(),
          timeMax:      timeMax.toISOString(),
          singleEvents: true,
          orderBy:      'startTime',
          maxResults:   500,
        })

        for (const ev of (data.items ?? [])) {
          if (ev.status === 'cancelled') continue
          const start = ev.start?.dateTime ?? ev.start?.date
          const end   = ev.end?.dateTime   ?? ev.end?.date
          if (!start) continue

          const safeId = `gc_${accountId.slice(0, 8)}_${calId.replace(/[^\w]/g, '_').slice(0, 20)}_${ev.id}`.slice(0, 128)

          allEvents.push({
            id:    safeId,
            title: ev.summary ?? '(No title)',
            start,
            end,
            allDay:        !ev.start?.dateTime,
            color,
            extendedProps: {
              source:      'google',
              accountId,
              calendarId:  calId,
              googleId:    ev.id,
              description: ev.description ?? '',
              location:    ev.location    ?? '',
            },
          })
        }
      } catch (err) {
        console.error(`Error fetching calendar ${calId}:`, err.message)
      }
    }
  }

  return Response.json({ events: allEvents })
}
