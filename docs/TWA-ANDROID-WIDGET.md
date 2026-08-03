# Future: a real Android home-screen widget (TWA + Play Store)

Written up for later, not built. This is what it would actually take.

## Why a PWA can't do it

There is no web API for home-screen widgets on Android or iOS.

- The `widgets` member in a web app manifest is **Windows 11 Widgets Board
  only**, rendered as Adaptive Cards. Android and iOS ignore it completely.
- Android home-screen widgets are `RemoteViews` driven by a native
  `AppWidgetProvider`. They run in the launcher's process — no WebView, no
  JavaScript, no DOM.
- iOS uses WidgetKit: SwiftUI, compiled, in an App Store app.

So the only route to a genuine widget is shipping a native container. On Android
that container can be thin — a **TWA (Trusted Web Activity)**, which is a native
shell that renders the existing site full-screen in Chrome with no browser UI.
The app stays this codebase; only the widget is native code.

**iOS is a separate project** and much heavier: WidgetKit means real Swift, an
Apple Developer account ($99/year), and App Store review. Not covered here.

## What already exists (do these first — they're free)

- `/today` — a chrome-free glance view. Pin it to a home screen as its own icon
  and it behaves like a static widget on any platform, iOS included.
- Daily "today at a glance" push (`/api/push/daily`) — lands on the lock screen
  without the app open.
- App icon badge — count of overdue plus due-today.
- Manifest shortcuts — long-press the icon for Today / New task / Focus / Note.

The widget adds live-on-the-home-screen rendering. It does not add capability.

## Prerequisites

| Thing | Cost | Notes |
|-------|------|-------|
| Google Play Console account | $25, one-time | Personal accounts now require ~14 days of closed testing with 12 testers before production. Budget for that, it's the long pole |
| Android Studio | free | Needed for the widget module; Bubblewrap alone won't do it |
| JDK 17 + Android SDK | free | Bubblewrap can install these for you |
| A signing keystore | free | **Back it up.** Lose it and you can never update the listing |

## Step 1 — Generate the TWA shell

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://luminae-vigila.vercel.app/manifest.webmanifest
bubblewrap build
```

`init` reads the existing manifest for name, icons, theme colour, and start URL,
so most of the app identity is already correct.

## Step 2 — Digital Asset Links (removes the browser chrome)

Without this the app opens with a Chrome URL bar across the top and looks like a
bookmark, not an app. `bubblewrap` prints the fingerprint; serve it at
`/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.vercel.luminae_vigila.twa",
    "sha256_cert_fingerprints": ["<from bubblewrap>"]
  }
}]
```

In this repo that means `public/.well-known/assetlinks.json` — Next.js serves
`public/` at the root, so no route handler is needed. Verify with
`https://<domain>/.well-known/assetlinks.json` returning `application/json`
before submitting, because a failed verification is silent and just shows the
URL bar.

**The fingerprint changes if Google Play App Signing re-signs your bundle** —
which it does by default. Take the fingerprint from the Play Console *after*
upload, not from your local keystore, or verification fails in production while
working fine in local testing.

## Step 3 — The widget module (the actual work)

Everything up to here is boilerplate. This part is real Android development.

1. Open the generated project in Android Studio, add an `AppWidgetProvider`.
2. Build the layout in `RemoteViews` — a strict subset of Android views. No
   custom views, no fragments, and a hard **limit on how much data a widget can
   hold**; keep it to a handful of rows.
3. Fetch data from a new endpoint, e.g. `GET /api/widget/today`, returning the
   output of `lib/glance.js` as JSON. That module is already pure and already
   shared between `/today` and the daily push, so the widget would be a third
   consumer of the same summary rather than a fourth implementation.
4. Refresh with `WorkManager`. `updatePeriodMillis` has a **30-minute floor** —
   anything more frequent is silently clamped.
5. Tap targets: `PendingIntent` into the TWA with a deep link, so tapping a task
   opens it rather than just launching the app.

### The authentication problem — plan for this early

The widget is a native process. It does **not** share Chrome's cookie jar, so the
session cookie the app uses is not available to it. Options:

- **Device token**: mint a long-lived, widget-scoped, read-only token in the app,
  hand it to the widget once via an intent, store it in `EncryptedSharedPreferences`.
  Cleanest. Requires a new token type and a revoke path on the server.
- **Custom Tabs session sharing**: fragile, and doesn't survive the launcher
  process being killed.
- **Cache-only widget**: the app writes the glance JSON to shared storage on each
  foreground; the widget renders whatever it last saw and never talks to the
  network. No auth at all, and it degrades honestly — a stale widget shows a
  timestamp rather than wrong data. **Recommended for a first version.**

## Step 4 — Ship

1. `bubblewrap build` → `app-release-bundle.aab`
2. Play Console → new app → internal testing track first
3. Complete the data-safety form. Declare it honestly: the app handles calendar
   and coursework data and syncs it to a server
4. Closed testing period (see prerequisites), then promote to production

## Realistic scope

The TWA shell is an afternoon. The widget module, the auth story, and the Play
Store testing requirement are the real cost — call it a couple of weekends plus
a two-week testing window before anything is publicly installable.

Worth doing only if a home-screen widget is genuinely the goal. If the goal is
"see today's schedule without opening the app", the daily push and `/today`
already deliver that at zero ongoing cost.
