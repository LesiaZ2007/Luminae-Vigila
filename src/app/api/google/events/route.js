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
  // Accounts whose token is dead (revoked / expired refresh token). Surfaced to
  // the client so it can prompt the user to reconnect instead of silently
  // showing an empty calendar — the root cause of "Google keeps disconnecting".
  const disconnected = []

  // A Google API error that means the account needs to re-authenticate.
  function isAuthError(err) {
    const status = err?.response?.status ?? err?.code
    const body   = JSON.stringify(err?.response?.data ?? '')
    return status === 401 || status === 403 ||
      /invalid_grant|invalid_credentials|no_refresh_token|unauthorized|Token has been expired or revoked/i.test(`${err?.message ?? ''} ${body}`)
  }

  for (const req of requests) {
    const { accountId, calendarIds = [], calendarColors = {} } = req

    // Scope account lookup to the current user — prevents cross-user access
    const account = await getAccount(accountId, session.userId)
    if (!account) continue

    // No refresh token means we can never silently re-auth — flag immediately.
    if (!account.refreshToken) {
      disconnected.push({ accountId, email: account.email })
      continue
    }

    let auth
    try {
      auth = clientForAccount(account)
    } catch {
      disconnected.push({ accountId, email: account.email })
      continue
    }

    const calApi = google.calendar({ version: 'v3', auth })
    let accountAuthFailed = false

    for (const calId of calendarIds) {
      if (accountAuthFailed) break
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
        if (isAuthError(err)) {
          // Token is dead for this whole account — stop and flag for reconnect.
          accountAuthFailed = true
          if (!disconnected.some(d => d.accountId === accountId)) {
            disconnected.push({ accountId, email: account.email })
          }
        } else {
          console.error(`Error fetching calendar ${calId}:`, err.message)
        }
      }
    }
  }

  return Response.json({ events: allEvents, disconnected })
}
