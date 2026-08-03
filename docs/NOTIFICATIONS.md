# Notifications — how they work and why they might not

Push in luminaeVigila has five independent links, and **when one breaks the
failure is silent**: the browser reports "enabled", the server reports "sent",
and nothing appears on the device. This document is the map.

The fastest diagnosis is **Settings → Notifications → Test notifications** in the
app, which walks the whole chain and reports the first thing that is actually
wrong. Everything below is the detail behind that button.

---

## The chain

| # | Link | Where it lives | How it fails |
|---|------|----------------|--------------|
| 1 | Browser support | `lib/pushClient.js` → `pushSupported()` | iOS Safari delivers push **only** to a home-screen-installed PWA, never to a normal tab |
| 2 | Permission | `Notification.requestPermission()` | Ignored entirely unless called from a user gesture — hence the button, not an on-load prompt |
| 3 | VAPID keys | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Missing on the deployment → the browser cannot subscribe and the server cannot sign |
| 4 | Subscription row | `POST /api/push/subscribe` → `push_subscriptions` | Session expired during upload → the device looks enabled locally but the server has no way to reach it |
| 5 | Something to trigger the send | cron → `/api/push/reminders` | **This is the one that was missing.** See below |

## The reminder scheduler needs a heartbeat

`/api/push/reminders` is the job that makes reminders fire when the app is
closed — which on a phone is essentially always. The client-side timer in
`page.js` only runs while a tab is open, so it is a nice-to-have, not the
mechanism.

The endpoint does nothing on its own. **Something must call it**, roughly every
few minutes, with the cron secret:

```
GET https://<your-domain>/api/push/reminders
Authorization: Bearer $CRON_SECRET
```

It is idempotent — the `sent_reminders` table dedupes, and a 30-minute grace
window means a missed tick or two is recovered rather than lost.

### There is no cap on how many notifications you can send

Worth stating plainly, because the Vercel cron limit is easy to misread as a
notification limit. **It isn't.** Web Push has no per-day quota — not from
Vercel, not from Google's or Mozilla's push services, not from this app. You can
send as many reminders a day as you have reminders.

The only thing Vercel limits is **how often Vercel itself will ping your
endpoint**. Move the heartbeat somewhere without that limit and the constraint
disappears entirely.

### Why the reminder job isn't in `vercel.json`

Vercel **Hobby** allows at most **2 cron jobs**, at **once-a-day** granularity —
and `vercel.json` is schema-validated, so it rejects unknown keys (including
comments; a stray `_comment` will fail the build). A reminder that can only fire
once a day is not a reminder, so the two genuinely-daily jobs
(`/api/push/daily`, `/api/push/digest`) take the Hobby allowance and the
frequent job is driven from outside Vercel.

**Option A — GitHub Actions (already set up, free, no signup).**
`.github/workflows/reminder-cron.yml` pings the endpoint every 5 minutes. Add two
repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `CRON_SECRET` | must match the `CRON_SECRET` env var in Vercel |
| `APP_URL` | e.g. `https://luminae-vigila.vercel.app`, no trailing slash |

Then fire one by hand from the **Actions** tab (`Run workflow`) to confirm the
wiring before trusting the schedule.

Caveat: GitHub's scheduler is best-effort and runs late under load, sometimes by
10+ minutes. The endpoint's 30-minute grace window absorbs that — a late tick
still sends rather than skipping — but reminders won't be punctual to the minute.

**Option B — an external pinger (most punctual).** [cron-job.org](https://cron-job.org)
is free and supports **1-minute** intervals with custom headers. Point it at
`https://<your-domain>/api/push/reminders` with header
`Authorization: Bearer <CRON_SECRET>`. Use this if you want reminders to land
at the minute you asked for. Disable the GitHub Action if you do, to avoid two
redundant pingers (harmless — the dedup table handles it — but noisy in logs).

**Option C — Vercel Pro ($20/mo).** Unlimited crons at any granularity. Add to
`vercel.json` and drop the others:

```json
{ "path": "/api/push/reminders", "schedule": "*/5 * * * *" }
```

Whichever you pick, the endpoint is idempotent: `sent_reminders` dedupes, so
overlapping pingers can't double-send.

## Required environment variables

Set in Vercel → Project → Settings → Environment Variables, for **Production**:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public half of the VAPID pair. Public by design — it ships to the browser |
| `VAPID_PRIVATE_KEY` | Signs every push. Secret |
| `VAPID_SUBJECT` | Contact for the push service, e.g. `mailto:you@example.com`. Optional but expected by some services |
| `CRON_SECRET` | Bearer token the cron endpoints require. **Without it every cron request is rejected with 401** and no notification is ever sent |

Generate a VAPID pair with `npx web-push generate-vapid-keys`. Changing them
invalidates every existing subscription — devices must re-enable notifications.

## The scheduled jobs

| Endpoint | Schedule | What it sends |
|----------|----------|---------------|
| `/api/push/reminders` | every ~5 min (external) | Per-item reminders you set on events and tasks |
| `/api/push/daily` | `0 11 * * *` (UTC) | "Today at a glance" — counts plus the first event. Silent on an empty day. Tapping opens `/today` |
| `/api/push/digest` | `0 18 * * 0` (UTC) | Sunday week-ahead summary |

Vercel crons run in UTC and there is no per-user send-time preference, so the
daily glance goes out at a fixed hour (early morning US Eastern). The subscription
does store the device's `tz_offset`, so the *contents* are computed against the
reader's calendar day even when the hour isn't ideal for them.

## Diagnostic endpoints

Both require a signed-in session and only ever touch the caller's own rows.

- `GET /api/push/status` — reports which links are healthy. Booleans and counts
  only; never returns key material or the cron secret.
- `POST /api/push/test` — sends a real push to the caller's devices immediately,
  and reports the push service's actual rejection per endpoint. A 403 (key
  mismatch) and a 410 (expired subscription) look identical from the client but
  need completely different fixes.

**If the test arrives but reminders don't, the problem is the scheduler**, not
the device. Check that something is really pinging `/api/push/reminders`.

## Platform notes

- **iOS / iPadOS** — the app must be added to the home screen. Push to a Safari
  tab is not supported at any iOS version. Permission must also be requested from
  a tap inside the installed app.
- **Android** — works in an installed PWA and in Chrome. Battery optimisation can
  delay delivery; "unrestricted" battery use for Chrome fixes it if pushes arrive
  late rather than not at all.
- **Desktop** — the OS focus-assist / do-not-disturb mode suppresses
  notifications without the browser knowing. If the test reports sent but nothing
  shows, check there first.
