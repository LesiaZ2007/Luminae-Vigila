/**
 * GET  /api/google/prefs — this user's per-calendar visibility and colour choices.
 * PUT  /api/google/prefs — replace them.
 *
 * ## Keyed by Google account *email*, not by account id
 *
 * These preferences used to live only in `localStorage`, keyed by the account's UUID.
 * Both halves of that were a problem.
 *
 * The UUID is not stable across a reconnect. Disconnecting an account deletes its row,
 * so re-adding the same Google account mints a *new* id — and every calendar you had
 * hidden came back, on an account you had just repaired. Since Google accounts are
 * identified to this app by email (`upsertAccount` conflicts on `(user_id,
 * google_email)`), email is the identifier that actually survives the round trip.
 *
 * And `localStorage` does not leave the browser, so hiding a calendar on a laptop left
 * it visible on the phone forever, with no way to tell why.
 *
 * Shape, per email:
 *   { enabled: boolean, calendars: { [calendarId]: { enabled, color, summary } } }
 *
 * The client keeps a `localStorage` copy as an offline read cache; this endpoint is the
 * durable, cross-device source of truth.
 */
import { getSession } from '@/lib/session'
import { ddlOnce }    from '@/lib/ddlOnce'
import sql            from '@/lib/db'

function ensureTable() {
  return ddlOnce('googleCalendarPrefs', () => sql`
    CREATE TABLE IF NOT EXISTS google_calendar_prefs (
      user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      google_email TEXT        NOT NULL,
      data         JSONB       NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, google_email)
    )
  `)
}

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ prefs: {} })

  await ensureTable()
  const rows = await sql`
    SELECT google_email, data FROM google_calendar_prefs WHERE user_id = ${session.userId}
  `

  return Response.json({
    prefs: Object.fromEntries(rows.map(r => [r.google_email, r.data])),
  })
}

export async function PUT(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const body  = await request.json().catch(() => null)
  const prefs = body?.prefs
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return Response.json({ error: 'Invalid body — expected { prefs: { [email]: {...} } }' }, { status: 400 })
  }

  await ensureTable()

  // An empty object means "this device has nothing to say", not "delete everything".
  // Without this guard a browser that had not hydrated yet could wipe the real prefs
  // for every device the moment someone toggled anything.
  const entries = Object.entries(prefs).filter(([email]) => typeof email === 'string' && email)
  if (entries.length === 0) return Response.json({ ok: true, saved: 0 })

  await sql.transaction(entries.map(([email, data]) => sql`
    INSERT INTO google_calendar_prefs (user_id, google_email, data, updated_at)
    VALUES (${session.userId}, ${email}, ${JSON.stringify(data ?? {})}, NOW())
    ON CONFLICT (user_id, google_email) DO UPDATE
      SET data = EXCLUDED.data, updated_at = NOW()
  `))

  return Response.json({ ok: true, saved: entries.length })
}
