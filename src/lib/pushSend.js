/**
 * Send one push payload to one subscription, the way every push route needs to.
 *
 * `send`, `test`, `daily`, `digest`, and `reminders` each deliver a payload to a
 * subscription and, if the push service answers 410 Gone or 404 Not Found, delete
 * that subscription — the endpoint itself is gone, so the next send would just
 * pay for the same failure again. That block was pasted into all five routes;
 * this is the one copy.
 *
 * It never throws. Callers send to many subscriptions at once, and one failure —
 * including the cleanup DELETE failing — must not take the rest of the batch with
 * it. A row whose DELETE failed is simply tried, and cleaned up, next time.
 *
 * `sendNotification` and `sqlImpl` are injected rather than imported directly, so
 * this is testable with no real push service and no database — see
 * pushSend.test.js. Every call site can still just call `sendToSubscription(sub,
 * payload)` and get the real web-push client and the real database.
 */
import webpush from 'web-push'
import sql     from '@/lib/db'

/**
 * @param {{id: string, endpoint: string, p256dh: string, auth: string}} sub
 * @param {string} payload  JSON string, passed straight to web-push.
 * @param {object} [deps]
 * @param {Function} [deps.sendNotification] Defaults to web-push's own sendNotification.
 * @param {Function} [deps.sqlImpl] Tagged-template SQL client, defaults to lib/db.
 * @returns {Promise<{ok: boolean, deleted: boolean, status: number|null, error: string|null}>}
 *   `deleted` is true only when the subscription row was removed. `error` carries
 *   the push service's own message for anything that wasn't a plain success, so a
 *   caller that wants to report it (like /api/push/test) has something to show.
 */
export async function sendToSubscription(sub, payload, { sendNotification = webpush.sendNotification, sqlImpl = sql } = {}) {
  const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }

  try {
    await sendNotification(pushSub, payload)
    return { ok: true, deleted: false, status: null, error: null }
  } catch (err) {
    const status = err.statusCode ?? null
    if (status === 410 || status === 404) {
      let deleted = false
      try {
        await sqlImpl`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
        deleted = true
      } catch {
        // Left for the next send to find gone again — see "It never throws" above.
      }
      return { ok: false, deleted, status, error: err.body || err.message || null }
    }
    // Anything else (403 key mismatch, a network error, a 5xx from the push
    // service) is left alone — it says nothing about whether the subscription
    // itself is still good, so deleting it would be the wrong fix.
    return { ok: false, deleted: false, status, error: err.body || err.message || null }
  }
}
