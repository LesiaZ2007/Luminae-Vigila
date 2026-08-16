/**
 * GET /api/notes/images/[id] — serve one note image back to its owner.
 *
 * Session-authed and scoped to `user_id`, so a URL leaking out of a note body is
 * not a way to read someone else's picture. A miss and a wrong-owner hit both
 * return 404: distinguishing them would confirm that an id exists.
 *
 * Stored bytes never change — the editor uploads a new row rather than editing one
 * — so the response is immutable and cached hard, but marked `private` because it
 * is authenticated and must not land in a shared cache.
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'

export async function GET(request, { params }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params

  let rows
  try {
    rows = await sql`
      SELECT mime, encode(bytes, 'base64') AS b64, byte_size
      FROM note_images
      WHERE id = ${id} AND user_id = ${session.userId}
    `
  } catch {
    // The table is created lazily on first upload; before that every read is a miss.
    return new Response('Not found', { status: 404 })
  }

  const row = rows[0]
  if (!row) return new Response('Not found', { status: 404 })

  const bytes = Buffer.from(row.b64, 'base64')
  const etag  = `"${id}"`

  // Content is immutable per id, so a conditional request can always be answered
  // from the tag alone — worth it because these are the largest things the app serves.
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=31536000, immutable' } })
  }

  return new Response(bytes, {
    headers: {
      'Content-Type':        row.mime,
      'Content-Length':      String(bytes.length),
      'Cache-Control':       'private, max-age=31536000, immutable',
      ETag:                  etag,
      'Content-Disposition': 'inline',
      // These bytes are user-supplied. Even with SVG excluded at upload, telling the
      // browser not to re-sniff the type closes the "GIF that is really HTML" path.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
