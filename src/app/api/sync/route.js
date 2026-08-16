/**
 * GET  /api/sync  — load all synced user data
 * POST /api/sync  — replace all synced user data
 *
 * Synced: local events, todos, todo categories, class schedule, event prefs,
 *         study sessions (completed Pomodoro focus blocks from FocusTimer),
 *         custom lists, and notes.
 * NOT synced: Google Calendar events (live), Canvas assignments (live).
 *
 * Returns empty defaults when not signed in so the app degrades gracefully.
 *
 * The study_sessions table is created lazily on first write (CREATE TABLE IF
 * NOT EXISTS) so existing deployed DBs that haven't run the new schema.sql
 * migration yet will self-heal on first sync rather than returning a 500.
 */
import { getSession }        from '@/lib/session'
import { reapOrphanImages }  from '@/lib/noteImages'
import sql                   from '@/lib/db'

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

// Ensure the custom_lists table exists.  Each row is one list (with all its
// items embedded as JSONB), identified by the list's client-side id.
async function ensureCustomListsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS custom_lists (
      id         TEXT        NOT NULL,
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `
}

// Ensure the notes table exists.  One row per note, the whole note object
// (title, HTML body, tags, reminder, trash flag) stored as JSONB.
async function ensureEventCategoriesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS event_categories (
      id         TEXT        NOT NULL,
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB       NOT NULL,
      PRIMARY KEY (id, user_id)
    )
  `
}

async function ensureNotesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
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
    return Response.json({ events: [], todos: [], todoCategories: [], classSchedule: [], eventPrefs: {}, studySessions: [], customLists: [], notes: [], eventCategories: [] })
  }

  const { userId } = session

  await ensureStudySessionsTable()
  await ensureCustomListsTable()
  await ensureNotesTable()
  await ensureEventCategoriesTable()

  const [evRows, tdRows, catRows, clsRows, prefRows, ssRows, clRows, nRows, evCatRows] = await Promise.all([
    sql`SELECT data FROM events          WHERE user_id = ${userId}`,
    sql`SELECT data FROM todos           WHERE user_id = ${userId}`,
    sql`SELECT data FROM todo_categories WHERE user_id = ${userId}`,
    sql`SELECT data FROM class_schedule  WHERE user_id = ${userId}`,
    sql`SELECT data FROM event_prefs     WHERE user_id = ${userId}`,
    sql`SELECT data FROM study_sessions  WHERE user_id = ${userId}`,
    sql`SELECT data FROM custom_lists    WHERE user_id = ${userId}`,
    sql`SELECT data FROM notes           WHERE user_id = ${userId}`,
    sql`SELECT data FROM event_categories WHERE user_id = ${userId}`,
  ])

  return Response.json({
    events:         evRows.map(r => r.data),
    todos:          tdRows.map(r => r.data),
    todoCategories: catRows.map(r => r.data),
    classSchedule:  clsRows.map(r => r.data),
    eventPrefs:     prefRows[0]?.data ?? {},
    studySessions:  ssRows.map(r => r.data),
    customLists:    clRows.map(r => r.data),
    notes:          nRows.map(r => r.data),
    eventCategories: evCatRows.map(r => r.data),
  })
}

export async function POST(request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { userId } = session
  const { events, todos, todoCategories, classSchedule, eventPrefs, studySessions, customLists, notes, eventCategories } = await request.json()

  await ensureStudySessionsTable()
  await ensureCustomListsTable()
  await ensureNotesTable()
  await ensureEventCategoriesTable()

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

  if (Array.isArray(customLists)) {
    queries.push(sql`DELETE FROM custom_lists WHERE user_id = ${userId}`)
    for (const cl of customLists) {
      if (!cl?.id) continue
      queries.push(sql`INSERT INTO custom_lists (id, user_id, data) VALUES (${cl.id}, ${userId}, ${JSON.stringify(cl)})`)
    }
  }

  if (Array.isArray(notes)) {
    queries.push(sql`DELETE FROM notes WHERE user_id = ${userId}`)
    for (const n of notes) {
      if (!n?.id) continue
      queries.push(sql`INSERT INTO notes (id, user_id, data) VALUES (${n.id}, ${userId}, ${JSON.stringify(n)})`)
    }
  }

  if (Array.isArray(eventCategories)) {
    queries.push(sql`DELETE FROM event_categories WHERE user_id = ${userId}`)
    for (const c of eventCategories) {
      if (!c?.id) continue
      queries.push(sql`INSERT INTO event_categories (id, user_id, data) VALUES (${c.id}, ${userId}, ${JSON.stringify(c)})`)
    }
  }

  // Execute all writes atomically — all succeed or all roll back.
  if (queries.length > 0) {
    await sql.transaction(queries)
  }

  // A full notes POST is the only moment the server sees every note this user has,
  // so it is the only place orphaned images can be identified. Deliberately after
  // the transaction and deliberately best-effort: reclaiming disk must never be the
  // reason a note fails to save. See reapOrphanImages for the grace period that
  // keeps a stale device from deleting an image a fresher one just added.
  if (Array.isArray(notes)) {
    try { await reapOrphanImages(userId, notes) } catch {}
  }

  return Response.json({ ok: true })
}
