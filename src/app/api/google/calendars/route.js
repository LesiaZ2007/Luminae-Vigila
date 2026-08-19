import { google }           from 'googleapis'
import { getAccount, getMirrorCalendarId } from '@/lib/googleTokenStore'
import { clientForAccount } from '@/lib/googleAuth'
import { getSession }       from '@/lib/session'
import { MIRROR_CALENDAR_NAME } from '@/lib/googleMirror'

export async function GET(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const account = await getAccount(accountId, session.userId)
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })

  try {
    const auth     = clientForAccount(account)
    const calApi   = google.calendar({ version: 'v3', auth })
    const { data } = await calApi.calendarList.list({ showHidden: false })

    // The mirror calendar must never appear as an import source. It holds copies of
    // this user's own events, so importing it would duplicate every one of them, and
    // the duplicates would then be mirrored in turn. Filtered by stored id, with a
    // name fallback for the window before the id is recorded.
    const mirrorId = await getMirrorCalendarId(account.id, session.userId)

    const calendars = (data.items ?? [])
      .filter(cal => cal.id !== mirrorId && cal.summary !== MIRROR_CALENDAR_NAME)
      .map(cal => ({
      id:              cal.id,
      summary:         cal.summary ?? '(unnamed)',
      backgroundColor: cal.backgroundColor ?? '#4285f4',
      foregroundColor: cal.foregroundColor ?? '#ffffff',
      primary:         !!cal.primary,
      accessRole:      cal.accessRole,
    }))

    return Response.json({ calendars })
  } catch (err) {
    console.error('Calendar list error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
