/**
 * Image storage for note bodies.
 *
 * ## Why images are not inlined into the note HTML
 *
 * The obvious implementation — base64 the pasted file straight into an `<img
 * src="data:…">` — breaks two things quietly. Notes are mirrored into
 * `localStorage` (a ~5 MB quota for the *entire* app), and every `/api/sync` POST
 * ships the whole notes array. One phone photo is 3–5 MB, which is ~4–7 MB of
 * base64: a single paste can exceed the storage quota outright, and every
 * subsequent sync re-uploads it. So the bytes live in their own table and the note
 * body carries only a short URL.
 *
 * ## Why Postgres rather than blob storage
 *
 * Vercel Blob would work, but it needs a token in the environment and serves from
 * public (if unguessable) URLs. Notes are private, so a session-authed route that
 * scopes every read to `user_id` is the more honest default — and it adds no new
 * service, no signup, and no environment variable. With client-side downscaling a
 * typical image lands at 150–400 KB, so Neon's free tier holds thousands.
 *
 * ## Binary through the HTTP driver
 *
 * The Neon serverless driver talks text over HTTP, so raw `Buffer` parameters are
 * not reliable for `BYTEA`. Writing through `decode($1,'base64')` and reading back
 * through `encode(bytes,'base64')` keeps both directions plain text while the
 * column stays genuinely binary — no 33% base64 storage penalty. Verified
 * byte-identical on a round trip including null and high bytes.
 */
import sql from '@/lib/db'
import { ddlOnce } from '@/lib/ddlOnce'

/**
 * Server-side ceiling on a stored image, after the client has already downscaled.
 * Vercel's serverless request body limit is 4.5 MB, so this both protects the
 * database and stays under the limit that would otherwise reject the upload with
 * an opaque platform error.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * Formats the editor will store. SVG is deliberately excluded: it is a document
 * format that can carry script, and these bytes are served back to the same origin
 * as the app.
 */
export const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Unreferenced images survive this long before being reaped. See `reapOrphanImages`. */
export const ORPHAN_GRACE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function ensureNoteImagesTable() {
  return ddlOnce('noteImages', () => sql`
    CREATE TABLE IF NOT EXISTS note_images (
      id         TEXT        NOT NULL,
      user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime       TEXT        NOT NULL,
      bytes      BYTEA       NOT NULL,
      byte_size  INTEGER     NOT NULL,
      width      INTEGER,
      height     INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, user_id)
    )
  `)
}

/** The public path for a stored image. Kept in one place so the reaper's regex agrees with it. */
export function noteImageUrl(id) {
  return `/api/notes/images/${id}`
}

/** Every note-image id referenced by a blob of note HTML. */
export function referencedImageIds(html) {
  const ids = new Set()
  const re = /\/api\/notes\/images\/([A-Za-z0-9_-]+)/g
  let m
  while ((m = re.exec(String(html ?? ''))) !== null) ids.add(m[1])
  return ids
}

/**
 * Delete images this user no longer references from any note.
 *
 * Called opportunistically from the sync POST, which is the only moment the server
 * sees the complete set of a user's notes.
 *
 * The grace period is the important part. Sync is last-write-wins across devices,
 * so a phone that has been offline for an hour can POST a notes array that predates
 * an image pasted on a laptop. Reaping strictly-unreferenced rows would delete that
 * image and leave a permanent broken picture in the newer note. Only images that
 * have been unreferenced *and* older than the grace window are removed, which makes
 * that race require a device to be stale for 30 days.
 */
export async function reapOrphanImages(userId, notes) {
  const referenced = new Set()
  for (const n of notes ?? []) {
    for (const id of referencedImageIds(n?.html)) referenced.add(id)
  }

  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS).toISOString()
  const keep   = [...referenced]

  // An empty array would make `NOT IN ()` invalid SQL, so the two cases split.
  const deleted = keep.length
    ? await sql`
        DELETE FROM note_images
        WHERE user_id = ${userId} AND created_at < ${cutoff} AND NOT (id = ANY(${keep}))
        RETURNING id
      `
    : await sql`
        DELETE FROM note_images
        WHERE user_id = ${userId} AND created_at < ${cutoff}
        RETURNING id
      `

  return deleted.length
}
