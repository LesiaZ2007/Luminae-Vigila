/**
 * Core auth helpers.
 * Google OAuth handles identity — these just manage the user record in the DB.
 */
import 'server-only'
import sql from './db'

/**
 * Find a user by email, or create one if they don't exist yet.
 * Called on first Google sign-in.
 * @param {string} email
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function findOrCreateUser(email) {
  const lower = email.toLowerCase().trim()
  const rows  = await sql`SELECT id, email FROM users WHERE email = ${lower}`
  if (rows.length > 0) return rows[0]
  const [user] = await sql`INSERT INTO users (email) VALUES (${lower}) RETURNING id, email`
  return user
}
