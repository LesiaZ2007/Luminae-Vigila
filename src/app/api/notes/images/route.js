/**
 * POST /api/notes/images — store one image pasted or dropped into a note.
 *
 * Body: multipart/form-data with a `file` field, plus optional `width`/`height`
 * fields carrying the intrinsic pixel size the client already measured (the server
 * decodes nothing, so it cannot work them out for itself).
 *
 * Returns { id, url, width, height, bytes }. The editor inserts `url` as an
 * `<img src>`; the bytes themselves are read back through
 * `GET /api/notes/images/[id]`, which is session-scoped.
 *
 * Requires a signed-in session. Anonymous notes stay local-only, and an image that
 * existed solely in one browser's localStorage would break as soon as the note
 * synced anywhere else — better to say so than to write a picture that silently
 * fails to travel.
 */
import { getSession } from '@/lib/session'
import sql            from '@/lib/db'
import {
  ensureNoteImagesTable, noteImageUrl, MAX_IMAGE_BYTES, ALLOWED_MIME,
} from '@/lib/noteImages'

export async function POST(request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Sign in to add images to notes.' }, { status: 401 })
  }

  let form
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data with a file field.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No file was uploaded.' }, { status: 400 })
  }

  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return Response.json(
      { error: `Unsupported image type${mime ? ` (${mime})` : ''}. Use PNG, JPEG, WebP, or GIF.` },
      { status: 415 },
    )
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length === 0) {
    return Response.json({ error: 'That image was empty.' }, { status: 400 })
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)
    return Response.json({ error: `That image is larger than ${mb} MB even after resizing.` }, { status: 413 })
  }

  // Base-36 random rather than a sequential id: the URL is the capability handle
  // inside an authenticated session, and unguessable ids mean one user's note HTML
  // cannot be used to enumerate another's images even if the scoping ever slipped.
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  const width  = toDim(form.get('width'))
  const height = toDim(form.get('height'))

  await ensureNoteImagesTable()
  await sql`
    INSERT INTO note_images (id, user_id, mime, bytes, byte_size, width, height)
    VALUES (
      ${id}, ${session.userId}, ${mime},
      decode(${buf.toString('base64')}, 'base64'),
      ${buf.length}, ${width}, ${height}
    )
  `

  return Response.json({ id, url: noteImageUrl(id), width, height, bytes: buf.length })
}

/** Pixel dimensions arrive as form strings; keep only sane positive integers. */
function toDim(raw) {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null
}
