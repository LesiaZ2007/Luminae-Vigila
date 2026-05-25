/**
 * Magic-link authentication helpers.
 * sendMagicLink(email)   → creates/finds the user, stores a token, sends the email.
 * verifyMagicToken(tok)  → validates the token, marks it used, returns { userId, email }.
 */
import 'server-only'
import { randomBytes }  from 'crypto'
import { Resend }       from 'resend'
import sql              from './db'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM    = process.env.RESEND_FROM_EMAIL  ?? 'luminaeVigila <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const TTL_MS  = 15 * 60 * 1000 // 15 minutes

/* ── User helpers ─────────────────────────────────────────────────────────── */

export async function findOrCreateUser(email) {
  const lower = email.toLowerCase().trim()
  const rows  = await sql`SELECT id, email FROM users WHERE email = ${lower}`
  if (rows.length > 0) return rows[0]
  const [user] = await sql`INSERT INTO users (email) VALUES (${lower}) RETURNING id, email`
  return user
}

/* ── Magic link ───────────────────────────────────────────────────────────── */

export async function sendMagicLink(email) {
  const user       = await findOrCreateUser(email)
  const token      = randomBytes(32).toString('hex')
  const expiresAt  = new Date(Date.now() + TTL_MS)

  await sql`
    INSERT INTO magic_link_tokens (user_id, token, expires_at)
    VALUES (${user.id}, ${token}, ${expiresAt})
  `

  const url = `${APP_URL}/api/auth/verify?token=${token}`

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: 'Sign in to luminaeVigila',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;">
  <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,.06);">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <span style="font-size:1rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#1e293b;">
        luminae<span style="color:#3b82f6;">Vigila</span>
      </span>
    </div>
    <h2 style="font-size:1.2rem;font-weight:700;color:#1e293b;margin:0 0 12px;">Your sign-in link</h2>
    <p style="color:#475569;margin:0 0 28px;line-height:1.6;font-size:.95rem;">
      Click the button below to sign in. This link expires in <strong>15 minutes</strong>
      and can only be used once.
    </p>
    <a href="${url}"
       style="display:inline-block;background:#3b82f6;color:#fff;padding:13px 28px;
              border-radius:10px;text-decoration:none;font-weight:700;font-size:.95rem;
              letter-spacing:.01em;">
      Sign in to luminaeVigila
    </a>
    <p style="color:#94a3b8;font-size:.8rem;margin:28px 0 0;line-height:1.5;">
      If you didn't request this, you can safely ignore this email.
      Your account won't be affected.
    </p>
  </div>
</body>
</html>`,
  })

  if (error) throw new Error(`Failed to send email: ${error.message}`)
}

export async function verifyMagicToken(token) {
  const rows = await sql`
    SELECT t.id, t.user_id, t.expires_at, t.used, u.email
    FROM   magic_link_tokens t
    JOIN   users u ON u.id = t.user_id
    WHERE  t.token = ${token}
  `
  const row = rows[0]
  if (!row)           return null   // token not found
  if (row.used)       return null   // already consumed
  if (new Date(row.expires_at) < new Date()) return null  // expired

  // Mark used so the link is single-use
  await sql`UPDATE magic_link_tokens SET used = TRUE WHERE id = ${row.id}`

  return { userId: row.user_id, email: row.email }
}
