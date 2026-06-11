/**
 * GET  /api/sync  — load all synced user data
 * POST /api/sync  — replace all synced user data
 *
 * Synced: local events, todos, todo categories, class schedule, event prefs,
 *         and study sessions (completed Pomodoro focus blocks from FocusTimer).
 * NOT synced: Google Calendar events (live), Canvas assignments (live).
 *
 * Returns empty defaults when not signed in so the app degrades gracefully.
 *
 * The study_sessions table is created lazily on first write (CREATE TABLE IF
 * NOT EXISTS) so existing deployed DBs that haven't run the new schema.sql
 * migration yet will self-heal on first sync rather than returning a 500.
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

// Ensure the study_sessions table exists.  Idempotent — safe to call every
// request; Postgres skips the CREATE when the table is already there.
async function ensureStudySessionsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id         TEXT        NOT NULL,
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ events: [], todos: [], todoCategories: [], classSchedule: [], eventPrefs: {}, studySessions: [] })
  }

  const { userId } = session

  await ensureStudySessionsTable()

  const [evRows, tdRows, catRows, clsRows, prefRows, ssRows] = await Promise.all([
    sql`SELECT data FROM events          WHERE user_id = ${userId}`,
    sql`SELECT data FROM todos           WHERE user_id = ${userId}`,
    sql`SELECT data FROM todo_categories WHERE user_id = ${userId}`,
    sql`SELECT data FROM class_schedule  WHERE user_id = ${userId}`,
    sql`SELECT data FROM event_prefs     WHERE user_id = ${userId}`,
    sql`SELECT data FROM study_sessions  WHERE user_id = ${userId}`,
  ])

  return Response.json({
    events:         evRows.map(r => r.data),
    todos:          tdRows.map(r => r.data),
    todoCategories: catRows.map(r => r.data),
    classSchedule:  clsRows.map(r => r.data),
    eventPrefs:     prefRows[0]?.data ?? {},
    studySessions:  ssRows.map(r => r.data),
  })
}

export async function POST(request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { userId } = session
  const { events, todos, todoCategories, classSchedule, eventPrefs, studySessions } = await request.json()

  await ensureStudySessionsTable()

  // Build an array of tagged-template query objects and run them all in ONE atomic
  // transaction. If anything fails mid-way, the entire write is rolled back — no
  // partial data wipes. Only categories present in the request body are included.
  const queries = []

  if (Array.isArray(events)) {
    queries.push(sql`DELETE FROM events WHERE user_id = ${userId}`)
    for (const ev of events) {
      if (!ev?.id) continue
      queries.push(sql`INSERT INTO events (id, user_id, data) VALUES (${ev.id}, ${userId}, ${JSON.stringify(ev)})`)
    }
  }

  if (Array.isArray(todos)) {
    queries.push(sql`DELETE FROM todos WHERE user_id = ${userId}`)
    for (const td of todos) {
      if (!td?.id) continue
      queries.push(sql`INSERT INTO todos (id, user_id, data) VALUES (${td.id}, ${userId}, ${JSON.stringify(td)})`)
    }
  }

  if (Array.isArray(todoCategories)) {
    queries.push(sql`DELETE FROM todo_categories WHERE user_id = ${userId}`)
    for (const cat of todoCategories) {
      if (!cat?.id) continue
      queries.push(sql`INSERT INTO todo_categories (id, user_id, data) VALUES (${cat.id}, ${userId}, ${JSON.stringify(cat)})`)
    }
  }

  if (Array.isArray(classSchedule)) {
    queries.push(sql`DELETE FROM class_schedule WHERE user_id = ${userId}`)
    for (const cls of classSchedule) {
      if (!cls?.id) continue
      queries.push(sql`INSERT INTO class_schedule (id, user_id, data) VALUES (${cls.id}, ${userId}, ${JSON.stringify(cls)})`)
    }
  }

  // eventPrefs is a single JSON object per user — upsert the whole thing
  if (eventPrefs !== undefined && eventPrefs !== null && typeof eventPrefs === 'object') {
    queries.push(sql`
      INSERT INTO event_prefs (user_id, data)
      VALUES (${userId}, ${JSON.stringify(eventPrefs)})
      ON CONFLICT (user_id) DO UPDATE SET data = ${JSON.stringify(eventPrefs)}, updated_at = NOW()
    `)
  }

  if (Array.isArray(studySessions)) {
    queries.push(sql`DELETE FROM study_sessions WHERE user_id = ${userId}`)
    for (const ss of studySessions) {
      if (!ss?.id) continue
      queries.push(sql`INSERT INTO study_sessions (id, user_id, data) VALUES (${ss.id}, ${userId}, ${JSON.stringify(ss)})`)
    }
  }

  // Execute all writes atomically — all succeed or all roll back.
  if (queries.length > 0) {
    await sql.transaction(queries)
  }

  return Response.json({ ok: true })
}
