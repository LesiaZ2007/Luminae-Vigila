import { google }           from 'googleapis'
import { getAccount }       from '@/lib/googleTokenStore'
import { clientForAccount } from '@/lib/googleAuth'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const account = await getAccount(accountId)
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })

  try {
    const auth     = clientForAccount(account)
    const calApi   = google.calendar({ version: 'v3', auth })
    const { data } = await calApi.calendarList.list({ showHidden: false })

    const calendars = (data.items ?? []).map(cal => ({
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
