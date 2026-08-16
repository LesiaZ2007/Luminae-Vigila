/**
 * Client half of note images: get a pasted or dropped file down to a sane size,
 * then hand it to `POST /api/notes/images`.
 *
 * Downscaling happens in the browser rather than on the server for two reasons.
 * A phone photo is 3–5 MB, which is close enough to Vercel's 4.5 MB request body
 * limit that unresized uploads fail as an opaque platform error rather than
 * anything the app could explain. And resizing server-side would mean a native
 * image library in a serverless function, for a result nobody can tell apart from
 * this one — notes are read on a phone screen.
 */

/** Longest edge, in CSS pixels, that a stored image is allowed to have. */
export const MAX_EDGE = 1600

/** Encoder quality for the re-compressed image. High enough that text in a screenshot stays sharp. */
export const JPEG_QUALITY = 0.85

/** Anything at or under this is stored as-is — re-encoding would only lose detail. */
const SKIP_RESIZE_BYTES = 320 * 1024

export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/')
}

/** Pull image files out of a paste or drop, ignoring the text flavours of the same event. */
export function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return []
  const out = []
  for (const item of dataTransfer.items ?? []) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (isImageFile(file)) out.push(file)
  }
  // Safari populates `files` but not always `items` for drops.
  if (out.length === 0) {
    for (const file of dataTransfer.files ?? []) {
      if (isImageFile(file)) out.push(file)
    }
  }
  return out
}

/**
 * Shrink `file` so its longest edge is at most MAX_EDGE, re-encoding to WebP where
 * the browser supports it and JPEG otherwise.
 *
 * Returns `{ blob, width, height }` describing what should actually be stored —
 * which may be the original file untouched.
 */
export async function downscaleImage(file, { maxEdge = MAX_EDGE } = {}) {
  const bitmap = await loadBitmap(file)
  const { width: w0, height: h0 } = bitmap

  const scale = Math.min(1, maxEdge / Math.max(w0, h0))

  // An animated GIF would lose its animation the moment it hits a canvas, and a
  // small image gains nothing from a re-encode. Both pass through untouched.
  const alreadyFine = scale === 1 && file.size <= SKIP_RESIZE_BYTES
  if (file.type === 'image/gif' || alreadyFine) {
    close(bitmap)
    return { blob: file, width: w0, height: h0 }
  }

  const width  = Math.max(1, Math.round(w0 * scale))
  const height = Math.max(1, Math.round(h0 * scale))

  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'

  // PNG screenshots are often transparent; flattening onto white beats the black
  // that a JPEG encoder would otherwise produce for those pixels.
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  close(bitmap)

  const blob = await new Promise(res => canvas.toBlob(res, type, JPEG_QUALITY))

  // If the "optimised" version came out bigger, keep the original.
  if (!blob) return { blob: file, width: w0, height: h0 }
  if (blob.size >= file.size && scale === 1) return { blob: file, width: w0, height: h0 }

  return { blob, width, height }
}

/**
 * Downscale and upload one image.
 * Resolves to `{ url, width, height }`, or throws with a message fit to show a user.
 */
export async function uploadNoteImage(file, { fetchImpl = fetch } = {}) {
  const { blob, width, height } = await downscaleImage(file)

  const form = new FormData()
  // The blob from canvas has no filename; the server only reads type and bytes,
  // but a name keeps the multipart part well-formed across browsers.
  form.append('file', blob, file.name || 'pasted-image')
  form.append('width',  String(width))
  form.append('height', String(height))

  const res = await fetchImpl('/api/notes/images', { method: 'POST', body: form })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error || 'Could not upload that image.')
  }
  return res.json()
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch {}
  }
  // Safari < 17 and jsdom take this path.
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload  = () => resolve(img)
      img.onerror = () => reject(new Error('That file could not be read as an image.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function close(bitmap) {
  if (typeof bitmap?.close === 'function') bitmap.close()
}

let webpSupport = null
function supportsWebp() {
  if (webpSupport !== null) return webpSupport
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}
