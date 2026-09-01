/**
 * Neon serverless PostgreSQL client — lazy initialisation.
 *
 * The client is created on first use, not at module load time.
 * This lets the app build and serve non-auth pages even when
 * DATABASE_URL is not set (e.g. local dev without a DB).
 *
 * Usage:
 *   import sql from '@/lib/db'
 *   const rows = await sql`SELECT * FROM users WHERE id = ${id}`
 */
import { neon } from '@neondatabase/serverless'

let _sql = null

function getClient() {
  if (_sql) return _sql
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Add it to your .env.local or Vercel environment variables. ' +
      'See README for setup instructions.',
    )
  }
  _sql = neon(process.env.DATABASE_URL)
  return _sql
}

/**
 * Tagged-template SQL helper that proxies to the Neon client.
 * Throws a clear error at query time (not at import time) if DATABASE_URL is missing.
 *
 * sql.transaction([query, query, ...]) — runs multiple tagged-template query objects
 * in a single atomic transaction via the Neon HTTP driver.
 *
 * sql.unsafe(str) — inlines a raw SQL fragment with no escaping. Only ever for
 * identifiers the code itself chose (a table name from a hardcoded map). Never for
 * anything that came in on a request; values belong in `${}` placeholders, which is
 * what makes them parameters.
 */
const sql = (strings, ...values) => getClient()(strings, ...values)

sql.transaction = (queries) => getClient().transaction(queries)
sql.unsafe      = (str)     => getClient().unsafe(str)

export default sql
