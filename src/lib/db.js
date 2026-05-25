/**
 * Neon serverless PostgreSQL client.
 * Import `sql` and use it as a tagged-template query function:
 *   const rows = await sql`SELECT * FROM users WHERE email = ${email}`
 */
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. See README for setup instructions.')
}

const sql = neon(process.env.DATABASE_URL)

export default sql
