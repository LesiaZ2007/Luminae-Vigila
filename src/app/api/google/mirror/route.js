/**
 * POST /api/google/mirror — push this user's events and due-dated tasks into a Google
 * Calendar so they surface in At a Glance, lock-screen glances, Assistant, and Wear.
 *
 * GET  /api/google/mirror — report whether the mirror is set up and reachable, without
 * writing anything. Used by the settings panel and for diagnosing a stale consent.
 *
 * Reads the app's own data from Neon rather than trusting a client payload: the client
 * already syncs, and re-sending the whole planner just to mirror it would double the
 * upload. See lib/googleMirror.js for why this cannot loop back into the importer.
 */
import { google }           from 'googleapis'
import { getSession }       from '@/lib/session'
import { getAccounts, getMirrorCalendarId, setMirrorCalendarId } from '@/lib/googleTokenStore'
import { clientForAccount } from '@/lib/googleAuth'
import sql                  from '@/lib/db'
import {
  buildDesiredEvents, diffMirror, MIRROR_CALENDAR_NAME, MIRROR_SCOPE,
} from '@/lib/googleMirror'

/**
 * The account to mirror into: the first one connected.
 *
 * Deliberately not "all of them" — mirroring the same schedule into three Google
 * accounts would put three copies of every event on any device signed into more than
 * one, which is worse than not mirroring at all.
 */
async function mirrorAccount(userId) {
  const accounts = await getAccounts(userId)
  return accounts.find(a => a.refreshToken) ?? accounts[0] ?? null
}

/**
 * Find or create the app's own calendar and remember its id.
 *
 * Verifies a remembered id still resolves, because the user can delete the calendar
 * from Google's UI at any time and a stale id would make every write 404 forever.
 */
async function ensureMirrorCalendar(calApi, account) {
  const remembered = await getMirrorCalendarId(account.id, account.userId)

  if (remembered) {
    try {
      await calApi.calendars.get({ calendarId: remembered })
      return remembered
    } catch {
      // Deleted or no longer ours — fall through and make a new one.
    }
  }

  const { data } = await calApi.calendars.insert({
    requestBody: {
      summary:     MIRROR_CALENDAR_NAME,
      description: 'Events and due tasks mirrored from luminaeVigila. Managed automatically — edits here are overwritten.',
    },
  })

  await setMirrorCalendarId(account.id, account.userId, data.id)
  return data.id
}

/** Everything currently on the mirror calendar, following pagination. */
async function listMirrored(calApi, calendarId) {
  const out = []
  let pageToken
  do {
    const { data } = await calApi.events.list({
      calendarId,
      maxResults:  2500,
      showDeleted: false,
      singleEvents: false,
      pageToken,
    })
    out.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/** A Google error meaning the grant no longer covers what we are asking for. */
function needsReconsent(err) {
  const status = err?.response?.status ?? err?.code
  const body   = JSON.stringify(err?.response?.data ?? '')
  return status === 401 || status === 403 ||
    /insufficient|invalid_grant|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(`${err?.message ?? ''} ${body}`)
}

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await mirrorAccount(session.userId)
  if (!account) return Response.json({ connected: false, reason: 'No Google account is connected.' })

  const remembered = await getMirrorCalendarId(account.id, account.userId)

  try {
    const auth   = clientForAccount(account)
    const calApi = google.calendar({ version: 'v3', auth })

    // Ask what the grant actually covers, rather than inferring it from a call that
    // would succeed either way. Listing calendars needs only `calendar.readonly`, so
    // using it as a readiness probe would report a mirror that cannot possibly write
    // as ready — and this account really is in that state until it is reconnected.
    const { token } = await auth.getAccessToken()
    const info      = await auth.getTokenInfo(token)
    const scopes    = info.scopes ?? []
    const canWrite  = scopes.includes(MIRROR_SCOPE)

    let calendarOk = false
    if (remembered) {
      try { await calApi.calendars.get({ calendarId: remembered }); calendarOk = true } catch {}
    }

    return Response.json({
      connected: true,
      email: account.email,
      calendarId: remembered,
      calendarOk,
      ready: canWrite,
      needsReconsent: !canWrite,
      reason: canWrite ? null
        : 'Disconnect and reconnect this Google account. Sending to Google needs permission to create its own calendar, which was added after this account was connected.',
    })
  } catch (err) {
    return Response.json({
      connected: true,
      email: account.email,
      ready: false,
      needsReconsent: needsReconsent(err),
      reason: needsReconsent(err)
        ? 'Reconnect this Google account — the mirror needs permission to create its own calendar, which was granted after you last connected.'
        : `Google error: ${err.message}`,
    })
  }
}

export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await mirrorAccount(session.userId)
  if (!account) {
    return Response.json({ error: 'No Google account is connected.' }, { status: 400 })
  }

  const [evRows, tdRows] = await Promise.all([
    sql`SELECT data FROM events WHERE user_id = ${session.userId}`,
    sql`SELECT data FROM todos  WHERE user_id = ${session.userId}`,
  ])

  try {
    const calApi     = google.calendar({ version: 'v3', auth: clientForAccount(account) })
    const calendarId = await ensureMirrorCalendar(calApi, account)

    // The calendar's own zone is the right one for naive local datetimes: it is what
    // Google shows the events in, and the app stores wall-clock times with no offset.
    const { data: cal } = await calApi.calendars.get({ calendarId })
    const timeZone = cal.timeZone || 'UTC'

    const desired  = buildDesiredEvents({
      events: evRows.map(r => r.data),
      todos:  tdRows.map(r => r.data),
      timeZone,
    })
    const existing = await listMirrored(calApi, calendarId)
    const { inserts, updates, deletes, unchanged } = diffMirror(desired, existing)

    let inserted = 0, updated = 0, deleted = 0
    const errors = []

    for (const ev of inserts) {
      try {
        await calApi.events.insert({ calendarId, requestBody: ev })
        inserted++
      } catch (err) {
        // 409 means the id already exists — most likely a previous run that wrote the
        // event and failed before we saw it. Patch rather than treating it as failure.
        if ((err?.response?.status ?? err?.code) === 409) {
          try { await calApi.events.patch({ calendarId, eventId: ev.id, requestBody: ev }); updated++ }
          catch (e2) { errors.push(`${ev.summary}: ${e2.message}`) }
        } else {
          errors.push(`${ev.summary}: ${err.message}`)
        }
      }
    }

    for (const ev of updates) {
      const { googleId, ...body } = ev
      try { await calApi.events.patch({ calendarId, eventId: googleId, requestBody: body }); updated++ }
      catch (err) { errors.push(`${ev.summary}: ${err.message}`) }
    }

    for (const id of deletes) {
      try { await calApi.events.delete({ calendarId, eventId: id }); deleted++ }
      catch (err) {
        // Already gone is the desired end state, not an error.
        if ((err?.response?.status ?? err?.code) !== 410 && (err?.response?.status ?? err?.code) !== 404) {
          errors.push(`delete ${id}: ${err.message}`)
        }
      }
    }

    return Response.json({
      ok: true, calendarId, timeZone,
      inserted, updated, deleted, unchanged,
      // Surfaced rather than swallowed: a partial mirror that reports success is how
      // you end up trusting a glance that is quietly missing half your week.
      errors: errors.slice(0, 10),
      errorCount: errors.length,
    })
  } catch (err) {
    console.error('[google mirror]', err?.message)
    if (needsReconsent(err)) {
      return Response.json({
        error: 'Reconnect this Google account — the mirror needs permission to create its own calendar, which was granted after you last connected.',
        code:  'needs_reconsent',
      }, { status: 403 })
    }
    return Response.json({ error: err.message }, { status: 500 })
  }
}
