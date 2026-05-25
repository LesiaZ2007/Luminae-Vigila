/**
 * GET  /api/sync  — load all synced user data
 * POST /api/sync  — replace all synced user data
 *
 * Synced: local events, todos, todo categories, class schedule, event prefs.
 * NOT synced: Google Calendar events (live), Canvas assignments (live).
 *
 * Returns empty defaults when not signed in so the app degrades gracefully.
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ events: [], todos: [], todoCategories: [], classSchedule: [], eventPrefs: {} })
  }

  const { userId } = session

  const [evRows, tdRows, catRows, clsRows, prefRows] = await Promise.all([
    sql`SELECT data FROM events          WHERE user_id = ${userId}`,
    sql`SELECT data FROM todos           WHERE user_id = ${userId}`,
    sql`SELECT data FROM todo_categories WHERE user_id = ${userId}`,
    sql`SELECT data FROM class_schedule  WHERE user_id = ${userId}`,
    sql`SELECT data FROM event_prefs     WHERE user_id = ${userId}`,
  ])

  return Response.json({
    events:        evRows.map(r => r.data),
    todos:         tdRows.map(r => r.data),
    todoCategories: catRows.map(r => r.data),
    classSchedule: clsRows.map(r => r.data),
    eventPrefs:    prefRows[0]?.data ?? {},
  })
}

export async function POST(request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { userId } = session
  const { events, todos, todoCategories, classSchedule, eventPrefs } = await request.json()

  // Replace all list data: DELETE existing rows, INSERT the new set.
  // This correctly handles deletions — a removed item won't be re-inserted.

  if (Array.isArray(events)) {
    await sql`DELETE FROM events WHERE user_id = ${userId}`
    for (const ev of events) {
      if (!ev?.id) continue
      await sql`INSERT INTO events (id, user_id, data) VALUES (${ev.id}, ${userId}, ${JSON.stringify(ev)})`
    }
  }

  if (Array.isArray(todos)) {
    await sql`DELETE FROM todos WHERE user_id = ${userId}`
    for (const td of todos) {
      if (!td?.id) continue
      await sql`INSERT INTO todos (id, user_id, data) VALUES (${td.id}, ${userId}, ${JSON.stringify(td)})`
    }
  }

  if (Array.isArray(todoCategories)) {
    await sql`DELETE FROM todo_categories WHERE user_id = ${userId}`
    for (const cat of todoCategories) {
      if (!cat?.id) continue
      await sql`INSERT INTO todo_categories (id, user_id, data) VALUES (${cat.id}, ${userId}, ${JSON.stringify(cat)})`
    }
  }

  if (Array.isArray(classSchedule)) {
    await sql`DELETE FROM class_schedule WHERE user_id = ${userId}`
    for (const cls of classSchedule) {
      if (!cls?.id) continue
      await sql`INSERT INTO class_schedule (id, user_id, data) VALUES (${cls.id}, ${userId}, ${JSON.stringify(cls)})`
    }
  }

  // eventPrefs is a single JSON object per user — upsert the whole thing
  if (eventPrefs !== undefined && eventPrefs !== null && typeof eventPrefs === 'object') {
    await sql`
      INSERT INTO event_prefs (user_id, data)
      VALUES (${userId}, ${JSON.stringify(eventPrefs)})
      ON CONFLICT (user_id) DO UPDATE SET data = ${JSON.stringify(eventPrefs)}, updated_at = NOW()
    `
  }

  return Response.json({ ok: true })
}
