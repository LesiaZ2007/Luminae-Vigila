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
import { ddlOnce }           from '@/lib/ddlOnce'
import { toUpsertRows }      from '@/lib/syncRows'
import { invalidateReminderWindow } from '@/lib/reminderWindow'
import sql                   from '@/lib/db'

/**
 * Self-creating tables for the sync payload.
 *
 * All four were previously issued on every GET *and* every POST — eight DDL round
 * trips per sync cycle to re-prove tables that nothing ever drops. They are
 * memoized per process now (see lib/ddlOnce) and batched into one transaction on
 * the first call, so a cold start pays a single round trip and warm requests pay
 * none. A fresh database still self-heals, which was the point of the pattern.
 */
const REAP_EVERY_MS = 60 * 60 * 1000 // 1 hour

/**
 * Give a row an `updatedAt` inside its JSONB if it has none.
 *
 * The sync merge is last-write-wins on `updatedAt`, and a row without one is
 * unresolvable — the merge has to fall back to a guess. Events predating the client
 * stamping that field are all in that state, so they stay ambiguous forever unless
 * something writes a timestamp once.
 *
 * This deliberately does *not* read the row's `updated_at` column, even though one
 * exists. That column tracks when the server last *wrote* the row, which is not the
 * same question: a device pushing a collection it merged from the cloud can move it
 * without anyone having edited anything. Stamping inside the JSONB instead freezes a
 * value that then round-trips through the client unchanged, so only an actual edit
 * moves it. (It used to be even further from the truth — POST rewrote every row on
 * every sync, so `updated_at` meant "time of the last full sync" for the whole
 * table. The set-based upsert below only writes rows that actually differ.)
 */
function withFallbackTimestamp(item, nowIso) {
  return item.updatedAt ? item : { ...item, updatedAt: nowIso }
}
let lastReapAt = 0

/**
 * The synced collections, in the order the payload names them.
 *
 * `updatedAt` says whether the table carries an `updated_at` column — the two
 * category tables never did (see schema.sql), and naming it in a SET clause for
 * them would be an error rather than a no-op. `stamp` marks the collections whose
 * rows get a fallback `updatedAt` inside their JSONB; see withFallbackTimestamp for
 * why only those three.
 */
const COLLECTIONS = [
  { key: 'events',          table: 'events',           updatedAt: true,  stamp: true  },
  { key: 'todos',           table: 'todos',            updatedAt: true,  stamp: true  },
  { key: 'todoCategories',  table: 'todo_categories',  updatedAt: false, stamp: false },
  { key: 'eventCategories', table: 'event_categories', updatedAt: false, stamp: false },
  { key: 'classSchedule',   table: 'class_schedule',   updatedAt: true,  stamp: false },
  { key: 'studySessions',   table: 'study_sessions',   updatedAt: true,  stamp: false },
  { key: 'customLists',     table: 'custom_lists',     updatedAt: true,  stamp: false },
  { key: 'notes',           table: 'notes',            updatedAt: true,  stamp: false },
]

/**
 * The two statements that make one table match one array.
 *
 * Both take the collection as a single JSONB parameter and let Postgres do the
 * matching, instead of the previous delete-everything-then-insert-each-row. What
 * that buys, in order of how much it matters:
 *
 *   1. `WHERE … data IS DISTINCT FROM EXCLUDED.data` — a row whose JSONB is
 *      unchanged is not written. The old form rewrote every row of a collection on
 *      every push, so a one-character note edit produced a new tuple for every note
 *      the account owned, WAL for all of them, and that many dead tuples for
 *      autovacuum to clean up afterwards.
 *   2. Two statements instead of N+1. The Neon HTTP driver batches a transaction
 *      into one round trip either way, but Postgres still parses, plans and
 *      executes each statement, so the old form's cost grew with the user's
 *      history rather than with what they changed.
 *
 * The DELETE is what makes this a replacement rather than a merge, which is the
 * contract the client relies on: a row the payload does not mention has been
 * deleted locally and must go. `NOT IN` over an empty payload is true for every
 * row, so an empty array still clears the table — same as before.
 *
 * The table name is interpolated raw because a tagged template cannot parameterise
 * an identifier. It comes from COLLECTIONS above and can never be request data.
 */
function replaceCollection(table, userId, rows, hasUpdatedAt) {
  const t    = sql.unsafe(table)
  const json = JSON.stringify(rows)
  const setClause = sql.unsafe(
    hasUpdatedAt ? 'data = EXCLUDED.data, updated_at = NOW()' : 'data = EXCLUDED.data',
  )

  return [
    sql`
      INSERT INTO ${t} (id, user_id, data)
      SELECT x.id, ${userId}::uuid, x.data
      FROM jsonb_to_recordset(${json}::jsonb) AS x(id text, data jsonb)
      ON CONFLICT (id, user_id) DO UPDATE SET ${setClause}
      WHERE ${t}.data IS DISTINCT FROM EXCLUDED.data
    `,
    sql`
      DELETE FROM ${t}
      WHERE user_id = ${userId}
        AND id NOT IN (
          SELECT x.id FROM jsonb_to_recordset(${json}::jsonb) AS x(id text, data jsonb)
        )
    `,
  ]
}

function ensureSyncTables() {
  return ddlOnce('syncTables', () => sql.transaction([
    sql`
      CREATE TABLE IF NOT EXISTS study_sessions (
        id         TEXT        NOT NULL,
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data       JSONB       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      )
    `,
    // One row per list, with all its items embedded as JSONB.
    sql`
      CREATE TABLE IF NOT EXISTS custom_lists (
        id         TEXT        NOT NULL,
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data       JSONB       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS event_categories (
        id         TEXT        NOT NULL,
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data       JSONB       NOT NULL,
        PRIMARY KEY (id, user_id)
      )
    `,
    // One row per note: title, HTML body, tags, reminder, trash flag.
    sql`
      CREATE TABLE IF NOT EXISTS notes (
        id         TEXT        NOT NULL,
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data       JSONB       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      )
    `,
  ]))
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ events: [], todos: [], todoCategories: [], classSchedule: [], eventPrefs: {}, studySessions: [], customLists: [], notes: [], eventCategories: [] })
  }

  const { userId } = session

  await ensureSyncTables()

  /* One round trip for all nine collections.
     This was nine concurrent queries. Same rows either way, but the Neon HTTP
     driver sends each query as its own request, so a pull that reads a few hundred
     small rows was opening nine of them — and an open tab pulls every few minutes
     for as long as it is open. A UNION ALL tagged with the collection name costs one.
     Safe as a single statement because ensureSyncTables above has already
     guaranteed every one of these tables exists; a UNION fails whole, not
     per-branch. */
  const rows = await sql`
    SELECT 'events'          AS kind, data FROM events           WHERE user_id = ${userId}
    UNION ALL
    SELECT 'todos'           AS kind, data FROM todos            WHERE user_id = ${userId}
    UNION ALL
    SELECT 'todoCategories'  AS kind, data FROM todo_categories  WHERE user_id = ${userId}
    UNION ALL
    SELECT 'eventCategories' AS kind, data FROM event_categories WHERE user_id = ${userId}
    UNION ALL
    SELECT 'classSchedule'   AS kind, data FROM class_schedule   WHERE user_id = ${userId}
    UNION ALL
    SELECT 'studySessions'   AS kind, data FROM study_sessions   WHERE user_id = ${userId}
    UNION ALL
    SELECT 'customLists'     AS kind, data FROM custom_lists     WHERE user_id = ${userId}
    UNION ALL
    SELECT 'notes'           AS kind, data FROM notes            WHERE user_id = ${userId}
    UNION ALL
    SELECT 'eventPrefs'      AS kind, data FROM event_prefs      WHERE user_id = ${userId}
  `

  const out = {
    events: [], todos: [], todoCategories: [], eventCategories: [],
    classSchedule: [], studySessions: [], customLists: [], notes: [],
  }
  let eventPrefs = {}
  for (const row of rows) {
    if (row.kind === 'eventPrefs') eventPrefs = row.data ?? {}
    else out[row.kind].push(row.data)
  }

  return Response.json({ ...out, eventPrefs })
}

export async function POST(request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { userId } = session
  const { events, todos, todoCategories, classSchedule, eventPrefs, studySessions, customLists, notes, eventCategories } = await request.json()

  await ensureSyncTables()

  // Build an array of tagged-template query objects and run them all in ONE atomic
  // transaction. If anything fails mid-way, the entire write is rolled back — no
  // partial data wipes. Only categories present in the request body are included.
  const queries = []
  const nowIso  = new Date().toISOString()
  const payload = { events, todos, todoCategories, eventCategories, classSchedule, studySessions, customLists, notes }

  for (const c of COLLECTIONS) {
    const items = payload[c.key]
    if (!Array.isArray(items)) continue          // absent means "unchanged" — don't touch the table
    const rows = toUpsertRows(items, c.stamp ? (item => withFallbackTimestamp(item, nowIso)) : undefined)
    queries.push(...replaceCollection(c.table, userId, rows, c.updatedAt))
  }

  // eventPrefs is a single JSON object per user — upsert the whole thing. Guarded
  // the same way as the collections above: an identical object is not rewritten.
  if (eventPrefs !== undefined && eventPrefs !== null && typeof eventPrefs === 'object') {
    const json = JSON.stringify(eventPrefs)
    queries.push(sql`
      INSERT INTO event_prefs (user_id, data)
      VALUES (${userId}, ${json})
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      WHERE event_prefs.data IS DISTINCT FROM EXCLUDED.data
    `)
  }

  // Execute all writes atomically — all succeed or all roll back.
  if (queries.length > 0) {
    await sql.transaction(queries)
  }

  /* A write is the only way a reminder can come into existence, so it is the only
     thing that can make the reminder cron's cached "nothing is due until …" wrong
     early. Free, in-process, and best-effort — see lib/reminderWindow. */
  if (Array.isArray(events) || Array.isArray(todos) || Array.isArray(notes) || Array.isArray(classSchedule)) {
    invalidateReminderWindow()
  }

  // A full notes POST is the only moment the server sees every note this user has,
  // so it is the only place orphaned images can be identified. Deliberately after
  // the transaction and deliberately best-effort: reclaiming disk must never be the
  // reason a note fails to save. See reapOrphanImages for the grace period that
  // keeps a stale device from deleting an image a fresher one just added.
  // Rate-limited per process: the reaper only ever removes rows that have been
  // unreferenced for 30 days, so running it on every sync spends a round trip to
  // discover there is nothing 30 days old yet. Hourly is far more often than the
  // grace window needs.
  if (Array.isArray(notes) && Date.now() - lastReapAt > REAP_EVERY_MS) {
    lastReapAt = Date.now()
    try { await reapOrphanImages(userId, notes) } catch {}
  }

  return Response.json({ ok: true })
}
