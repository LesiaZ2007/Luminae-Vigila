<div align="center">

<img src="https://img.shields.io/badge/-%F0%9F%AA%B6%20luminaeVigila-243b55?style=for-the-badge&labelColor=243b55&color=243b55&logoColor=white" alt="luminaeVigila" height="42"/>

<br/>

**An All-Purpose Student Planner.**  
Sync your Google Calendar and Canvas LMS, manage tasks, and ask an AI assistant — all in one minimal interface.

Works fully offline without an account. Sign in to sync across devices or manually import/export using JSON.

<br/>

[![Live App](https://img.shields.io/badge/Live%20App-luminae--vigila.vercel.app-3a6fa8?style=for-the-badge&logo=vercel&logoColor=white)](https://luminae-vigila.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js%2016-243b55?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![FullCalendar](https://img.shields.io/badge/FullCalendar%206-3a6fa8?style=for-the-badge&logoColor=white)](https://fullcalendar.io)

</div>

<br/>

---

## ✨ Features

### 📅 Calendar & Tasks
- **Weekly / monthly / daily views** — create, edit, and delete events with categories, colors, recurrence rules, reminders, and notes
- **To-do list** — tasks with priorities, categories, due dates, recurring schedules, and event linking
- **Link tasks to a class** — tag any task with a class schedule entry (shows a color-coded chip on the task row)
- **Hide events** — hide individual events from view; reveal them back semi-transparently anytime
- **Overlapping events** — when events start at the same time the shorter one is indented; same-duration events get a stable stagger so both are always visible
- **Recurring event edit scope** — clicking a repeating event asks whether to edit *this occurrence only* or *all events in the series*; choosing "all" reopens the full form pre-populated with the original recurrence config (type, days, end date) and the series start date so every occurrence is regenerated
- **Recurring event delete** — deleting a repeating event shows an in-app panel: *Delete this event only* or *Delete all in series*

### 🔵 Google Calendar
- Connect **multiple Google accounts** and toggle individual calendars on or off
- Events auto-refresh every 5 minutes; per-calendar color overrides stored locally
- Calendar visibility toggles and custom colors are never reset by background syncs
- **Signing in does not auto-connect Google Calendar** — that is a separate explicit step

### 🟠 Canvas LMS
- Connect with your Canvas API token + institution URL (no IT setup needed)
- **Canvas Calendar Feed (no token needed)** — paste your personal iCal feed URL (Canvas → Calendar → Calendar Feed) to pull assignment due dates and events without an API token; works for any public `.ics` subscription URL too; events appear in Canvas orange on the calendar
- **Assignments on the calendar** — due dates appear as all-day task markers alongside your own events
- **Per-course toggles** — enable/disable individual courses; updates apply instantly to the calendar
- **Courses tab** — appears automatically when Canvas is connected, showing:
  - Assignments grouped by course with animated progress bars
  - Due date badges — overdue, due soon, or upcoming
  - Submission status chips — Graded / Submitted / Missing
  - Grade display when scores are available
  - Mark assignments done independently of Canvas
  - One-click links to open assignments in Canvas
  - Filter: **Upcoming / All / Done**

### 📊 GPA / Grade Projection

A collapsible **GPA / Grades** card appears at the top of the Courses tab whenever Canvas is connected and at least one assignment has been graded.

- **Canvas grade auto-import** — live official grades are fetched from `/api/canvas/grades` automatically whenever assignments sync (same 15-minute cadence); no separate polling loop added. The official Canvas score overrides the assignment-computed estimate, giving a more accurate GPA.
- **Manual grade override** — click any percentage to type in your own value. The override is stored separately in `localStorage` under `lv-gpa.overrides` and always wins over the auto-imported value.
- **Source badge** — each course row shows a green `Canvas live` badge when using the official grade, or an amber `manual` badge when overriding. The manual badge has a one-click `↺` to reset back to Canvas.
- **Per-course letter grade and percentage** — computed from the sum of earned points divided by graded points possible (e.g. 87 / 100 → B+)
- **Grading scale** — A 93–100 = 4.0, A– 90–92 = 3.7, B+ 87–89 = 3.3, … F < 60 = 0.0
- **Credit hours** — editable per course (default 3), persisted to `localStorage` under `lv-gpa`
- **Credit-weighted projected GPA** — uses whichever grade source is active per course
- **"What do I need?" helper** — enter a target percentage per course to see the required average score on remaining (ungraded) points
- Mobile-responsive stacked layout; matches the existing Courses tab visual style
- Empty state shown when no graded assignments exist yet

### 📆 Class Schedule *(no Canvas required)*
- Add recurring class meetings manually — days of week, time, room, semester dates
- Classes appear as color-coded repeating events on the calendar
- **Link to Canvas** — optionally connect a schedule entry to its matching Canvas course
- Fully independent of Canvas

### ☁️ Cloud Sync — Reliability & Manual Refresh
- **Atomic writes** — cloud sync POSTs now run all database writes (DELETEs and INSERTs) inside a single transaction. If anything fails mid-way the entire write is rolled back, so partial data wipes are impossible.
- **Manual Refresh button** — when signed in, a refresh icon appears next to your email in the sidebar (desktop) and in the account section of the Settings tab (mobile). Tap it to immediately pull the latest cloud state to your current device — useful when you've updated your data on another device and don't want to wait for the next auto-sync. The icon spins while the pull is in progress.

### 🔐 Sign In *(optional)*
- **Local-first by default** — events and tasks live in your browser's local storage, no account needed
- **Sign in with Google** to sync your identity across devices
- Google Calendar and Canvas connections are separate explicit opt-ins
- Sidebar shows your email and a sign-out button when logged in; a "Sign in to sync" link when not

### 📦 Import / Export
- **Export** all local events and tasks as a timestamped JSON file
- **Import** a previously-exported file to restore or transfer data to any browser or device
- Only local data is included — Google Calendar and Canvas data re-sync from the source

### 🪶 Corvus AI Assistant
- Chat-based assistant powered by [Groq](https://groq.com) (`llama-3.3-70b-versatile`)
- Aware of your upcoming events, tasks, Canvas assignments, **and class schedule entries**
- **Distinguishes events from classes** — recurring class schedule entries are labeled `[CLASS]`; professor-posted Canvas events are `[CANVAS EVENT]`; user-created entries are `[EVENT]`. Corvus uses the correct term in every response.
- **Add events and tasks**, edit them, and mark things complete — all via natural language
- **Interactive mention cards** — when Corvus discusses existing events or tasks (e.g. "urgent deadlines", "week summary"), it shows tappable preview cards for each item; tap one to navigate directly to it
- Runs as a floating panel or a full-screen tab
- **Server-side rate limited** to 20 requests per minute per user to protect the Groq API key; exceeding the limit returns a 429 with a 30-second retry hint

### 🔍 Search
- Search across events, tasks, and Canvas assignments with scope and status filters
- Results grouped by type — Canvas assignments, tasks, and events in a split layout
- **Smart navigation** — clicking a search result jumps the calendar directly to that event's date/week, opens the preview, and keeps the calendar on that date when you close it
- **Due date labels** — smart relative labels (Today, Tomorrow, Overdue, etc.)
- **Recent searches** — last 5 queries stored locally; tap a chip to re-run; Clear button removes history
- **Date range filter** — collapsible From / To date pickers filter all result types simultaneously
- **Keyboard navigation** — arrow keys move focus through results; Enter opens the highlighted item

### 📋 Tasks — Subtasks
- Add up to 20 subtasks to any to-do item in the Add/Edit modal
- Each subtask can be checked off individually — matches CoursesPanel done style with strikethrough
- Progress chip on the task row shows `X/Y steps`; click to expand the inline checklist

### 🎯 Focus Timer *(optional)*
- **Pomodoro-style timer** tied to your tasks — open it from the timer FAB (desktop) or the Settings tab (mobile)
- **Focus → break → repeat:** a short break after each focus session and a **long break every 4 sessions** (all lengths configurable)
- **Pick a task or Canvas assignment to focus on** — completed sessions accumulate focus time on it (`X focused so far`)
- **Course tag** — optionally tag each focus session with a Canvas course (dropdown shows your enrolled courses; default: None). The tag is persisted so the same course is pre-selected next time you open the timer.
- **Configurable durations** — set Focus / Short / Long lengths; one click resets to the factory `25 / 5 / 15`, or save your own values as your personal default
- **Auto-start toggle** — off by default, so the timer pauses between phases and waits for you to press play; flip it on for hands-free cycles
- **Built-in help** — a lightbulb in the header toggles a short, dismissible note explaining the flow and whether phases auto-advance
- **Log to calendar** — optionally drop each finished focus session onto the calendar as a real, editable time-block (this is how tasks become *time-blocking*)
- **Full-screen "zen" mode** — a large glowing progress ring with a selectable ambient background: **Stars**, **Snow**, or a slow **Aurora** (Esc to exit)
- A gentle two-note chime + confetti celebrate each completed session (chime can be muted); reminders also fire via the existing notification + push pipeline
- Completed sessions are saved to `localStorage` (`lv-study-sessions`) for the Study Time panel
- Self-contained — adds `lv-focus` and `lv-study-sessions` localStorage keys; never alters existing events or tasks

### ⏱ Study Time Tracking

A collapsible **Study Time** card appears in the Courses tab below the GPA panel once at least one tagged focus session exists.

- **Weekly hours per course** — horizontal CSS bars (no chart library) showing this week's focused time broken down by Canvas course; untagged sessions appear as "Untagged"
- **Total this week** displayed in the header pill; **week-over-week comparison** shown as a colored delta when last-week data exists
- Sessions come from the Focus Timer's course tag; data is stored in `localStorage` under `lv-study-sessions` (localStorage-only — no schema/sync changes needed)
- Hidden when there are no sessions to show (zero clutter on first launch)

### 🟠 Canvas — Assignment Notifications
- When Canvas syncs and finds new assignments that weren't seen before, a toast fires in-app
- If the browser has notification permission, an OS-level `Notification` also appears
- First sync seeds the seen-IDs list silently (no false positives on setup)

### 🟠 Canvas — Bulk Mark Done
- "Select" button in the Courses header enters selection mode
- Tap any assignment row or its checkbox to add it to the selection
- Selected rows highlight with a color tint
- A sticky bottom bar shows the count and "Mark done" / "Cancel" buttons
- Only undone assignments are toggled — no double-toggle on already-done items

### 🔔 Browser Push Notifications
- Service worker (`/sw.js`) enables notifications even when the tab is closed or backgrounded
- On sign-in the app requests notification permission and registers a push subscription
- Reminder alerts (event/task reminders) are sent via push so they fire when the tab is not active
- iOS Safari requires the app to be added to the Home Screen (iOS 16.4+)

### 🎨 Event Recolor
- Right-click (desktop) or long-press 500 ms (mobile) any user-created calendar event to open a color picker
- Select from 10 preset swatches — change applies immediately and persists across sessions
- Google Calendar and Canvas events cannot be recolored

### 📆 Mini Month Navigator *(desktop / tablet)*
- Compact month grid in the sidebar for fast date jumping
- Click any day to navigate the main calendar to that week
- Current week is highlighted; today is marked with a blue dot
- Hidden on mobile (bottom nav leaves no sidebar space)

### 🚨 Error Boundary
- Every major panel is wrapped in a React error boundary
- Crashes show a friendly in-app recovery card instead of a blank screen
- Individual panels can fail independently — the rest of the app keeps working

### 🤖 Corvus — Rate Limit Feedback
- When Groq returns 429 (rate limited), the send button shows a 30-second countdown
- Input and button are disabled during the cooldown to prevent repeated hammering

### 🤖 Corvus — Session Memory
- Chat history persists to `localStorage` and is restored on reload (capped at 50 messages, pruned oldest-first)
- Recent history is sent as context on every request so Corvus remembers what you've already discussed in the session
- Session expires after 30 minutes of inactivity; any pending-confirmation items from a previous session are automatically cancelled on restore
- **Clear conversation** button (trash icon in the header) wipes the session and resets to the greeting

### 🤖 Corvus — Plan My Week
- New **"Plan my week"** quick-action button (highlighted in blue) gathers your next 7 days of events, pending tasks, and Canvas assignments client-side and sends Corvus a structured planning prompt
- Corvus responds with a day-by-day study schedule proposal, then offers to add individual study blocks via its existing `preview_event` confirm flow — no AI calls until you tap the button

### 🤖 Corvus — Time Estimation
- New **"Estimate task time"** quick-action (highlighted in green) asks Corvus to estimate how long one of your upcoming items will take
- Corvus uses built-in heuristics (reading ≈ 45–90 min, problem sets ≈ 1–3 h, essays ≈ 2–4 h, etc.) and always offers to block matching study time on the calendar after giving an estimate
- Also available via natural language: "How long will my Chem homework take?"

### 🤖 Corvus — Proactive Nudge (zero AI cost)
- On app load, Luminae Vigila checks **client-side** (no AI call) whether 3+ deadlines cluster within the next 72 hours with no study blocks covering them
- If detected, a small dismissible **"Busy stretch ahead — want help planning it?"** chip appears near the Corvus FAB with a red badge on the button; a matching banner is shown inside the Corvus panel
- Tapping "Help me plan" opens Corvus pre-loaded with the deadline list and a planning prompt
- Dismissal (X button or tapping away) sets a daily `localStorage` flag so the chip only appears once per day
- Also surfaces as an in-panel banner when you open Corvus on the full tab or floating widget

### ⌨️ Keyboard Shortcuts
- **Power-user hotkeys** — press a single key anywhere in the app (outside text fields) to trigger common actions
- `N` — open "New Event" modal
- `T` — open "New Task" modal
- `/` — open the search popup (Ctrl+K also works)
- `F` — toggle the Focus Timer panel
- `?` — show the keyboard shortcuts help overlay
- `Esc` — close the topmost open overlay (help, focus timer, search, or Corvus float)
- All shortcuts are suppressed while typing in any input, textarea, or contenteditable so they never interfere with regular typing
- Shortcuts are also suppressed while a blocking modal (event/task/settings) is open, except `Esc` which always works

### 📋 Agenda View
- **Condensed 14-day list** — a new "Agenda" tab in the sidebar (and mobile bottom nav) shows everything coming up in a single scrollable view
- Includes user calendar **events**, **tasks** with due dates, **Canvas assignments**, and **class schedule meetings**, all grouped by day
- Day headers read **Today**, **Tomorrow**, or the full weekday + date
- Items are sorted chronologically within each day; timed events appear before all-day/due-date items
- Clicking any event opens its **EventModal**; clicking a task opens the **AddTodoModal**; Canvas assignments open their detail panel
- Color-coded left stripe and icon match each item's category color for quick scanning
- Mobile-friendly — proper bottom padding for the tab bar
- Empty state shown when nothing is scheduled in the next 14 days

### 🚨 Conflict Detection
- When creating or editing a **timed event** in the Event modal, the app automatically detects time overlaps with other events and class schedule meetings
- **Non-blocking** — an amber warning banner appears inline ("Overlaps with Physics 101, 2:00–3:15 PM") but never prevents saving
- Checks against all visible user events and every applicable class schedule meeting for that date and weekday
- Only fires for timed (non-all-day) events; all-day events are excluded

### 🌦 Everything Else
- **Weather widget** — live temperature and rain forecast pulled from Open-Meteo
- **Dark / light mode** — toggle from the sidebar
- **Responsive design** — desktop (full sidebar), tablet (mini-sidebar with labels), mobile (bottom tab navigation)
- **Mobile To-Do tab** — stacked layout with To-Do / Canvas / Both toggle pills; shows priority tasks up top and Canvas assignments below
- **Mobile search** — full-screen tab (no overlay), query resets each time you enter the tab; desktop keeps the Ctrl+K popup
- **Mobile Settings tab** — exposes Google Calendar sync, Canvas connection, class schedule, sign-in, theme toggle, and import/export on mobile
- **Swipe-safe navigation** — horizontal swipes advance/retreat weeks without accidentally triggering event creation
- **100dvh layout** — dynamic viewport height keeps the bottom tab bar fully visible on real devices

---

## 📲 Install / Play Store

luminaeVigila is a fully installable **Progressive Web App (PWA)** — Android-first. On Android Chrome an install banner appears automatically once the browser's installability heuristics are met; on desktop Chrome/Edge an install icon appears in the address bar.

### Install on Android (primary path)

**Android Chrome** is the recommended way to install luminaeVigila:

1. Open [luminae-vigila.vercel.app](https://luminae-vigila.vercel.app) in Chrome on Android.
2. When the *"Add to Home screen"* banner appears, tap **Add** — or open the Chrome menu (⋮) and choose **Add to Home screen** / **Install app** at any time.
3. The app installs as a standalone icon on your home screen and launcher with no browser chrome, just like a native app.
4. Background push notifications (event and task reminders) work out of the box once you grant notification permission at sign-in.
luminaeVigila is a fully installable **Progressive Web App (PWA)**. On mobile, browsers will prompt to "Add to Home Screen"; on desktop Chrome/Edge, an install icon appears in the address bar.

### Adding to Home Screen (iOS / Android)

- **iOS Safari** — tap the Share button → *Add to Home Screen*. The app then runs in standalone mode (no browser chrome) and supports background push notifications (iOS 16.4+).
- **Android Chrome** — tap the browser menu → *Add to Home Screen* (or accept the native install banner when it appears).

### Publishing to Google Play (Trusted Web Activity / TWA)

To distribute on the Play Store via a TWA (e.g. using [PWABuilder](https://www.pwabuilder.com) or [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)):

1. **Generate the signed AAB** — use PWABuilder (easiest: paste your URL, download the `.aab`) or Bubblewrap CLI. Both tools output the signing key details you need in the next step.
2. **Fill in Digital Asset Links** — replace the placeholder values in `public/.well-known/assetlinks.json` with your app's:
   - `package_name` — e.g. `org.luminae.vigila`
   - `sha256_cert_fingerprints` — the SHA-256 fingerprint of your signing keystore (shown by PWABuilder / Bubblewrap during build, or via `keytool -list -v -keystore release.jks`)
3. **Deploy** — ensure `https://your-domain/.well-known/assetlinks.json` is publicly accessible (no redirect, `Content-Type: application/json`). This is what tells Android Chrome that the TWA is verified, enabling it to run without the browser URL bar.
4. **Add real PNG icons** — add `public/icon-192.png` (192×192 px) and `public/icon-512.png` (512×512 px) before Play Store submission. The manifest already references these paths. The SVG entry remains for browser-based installs; Play Store requires at least a 512 px PNG.
5. **Play Console requirements** — you will need a privacy policy URL and a completed data-safety form before your listing can go live.

> The SVG icon at `/icon.svg` works for browser-based installs (Chrome, Edge). Real 192 px and 512 px PNG files are required before submitting to the Google Play Store.

### Install on iOS (secondary)

On iOS Safari, tap the Share button → *Add to Home Screen*. The app runs in standalone mode and supports background push notifications on iOS 16.4+. iOS is not the primary target; Android Chrome covers the main use case.
1. **Generate the APK / AAB** — use PWABuilder (easiest) or Bubblewrap CLI with your app's URL.
2. **Fill in Digital Asset Links** — replace the placeholder values in `public/.well-known/assetlinks.json` with your app's:
   - `package_name` — e.g. `org.luminae.vigila`
   - `sha256_cert_fingerprints` — the SHA-256 of your signing keystore (shown by PWABuilder / Bubblewrap during build, or via `keytool -list -v -keystore release.jks`)
3. **Deploy** — ensure `https://your-domain/.well-known/assetlinks.json` is publicly accessible (no redirect, correct `Content-Type: application/json`).
4. **Add real PNG icons** — before Play Store submission replace the SVG-only icon entries in `public/manifest.webmanifest` with proper `192×192` and `512×512` PNG icons (Play Store requires at least a 512 px PNG). The SVG entry is fine for browser installs.
5. **Play Console requirements** — you will need a privacy policy URL and a completed data-safety form before your listing can go live.

> The SVG icon at `/icon.svg` works for browser-based installs (Chrome, Safari, Edge). Real 192 px and 512 px PNG files are required before submitting to the Google Play Store.

---

## 🛠 Tech Stack

<div align="center">

| | |
|:---|:---|
| **Framework** | [Next.js 16](https://nextjs.org) — App Router |
| **Calendar** | [FullCalendar 6](https://fullcalendar.io) |
| **AI** | [Groq SDK](https://groq.com) — `llama-3.3-70b-versatile` |
| **Auth** | Google OAuth 2.0 · JWT sessions via [jose](https://github.com/panva/jose) |
| **Database** | [Neon](https://neon.tech) serverless PostgreSQL |
| **Google APIs** | `googleapis` — Calendar API + OAuth2 |
| **Canvas** | Canvas LMS REST API (token-based, no OAuth) |
| **Icons** | [Lucide React](https://lucide.dev) |
| **Theming** | [next-themes](https://github.com/pacocoursey/next-themes) |
| **Deployment** | [Vercel](https://vercel.com) |

</div>

---

## 🧪 Testing

```bash
npm install   # required before running tests (node_modules is not committed)
npm test      # run all unit tests once (vitest run)
npm run test:watch  # watch mode
```

Tests live in `src/lib/` alongside the modules they cover:
- `src/lib/recurrence.test.js` — `expandRecurring` and `expandRecurringTodo` pure logic
- `src/lib/ics.test.js` — ICS date parsing (`parseIcsDate`) and VEVENT extraction (`parseIcs`)

---

## 🚀 Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app works without any environment variables. Google Calendar sync, Canvas sync, and sign-in each require their own credentials below.

### Environment Variables

Create `.env.local` in the project root:

```env
# Groq — required for Corvus AI
GROQ_API_KEY=your_groq_api_key

# Google OAuth — required for sign-in AND Google Calendar
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
# Only needed in production (defaults to localhost in dev)
# GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/google/callback

# Session secret — required for sign-in (any long random string)
# Generate one: openssl rand -hex 32
SESSION_SECRET=your_session_secret

# Neon PostgreSQL — required for sign-in and per-user token storage
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Web Push / VAPID — required for background push notifications
# Generate keys: node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your@email.com
```

> **Error tracking (optional):** A guarded Sentry scaffold lives on the `chore/error-tracking`
> branch. It's kept out of the main build for now because `@sentry/nextjs@8` doesn't yet
> declare Next.js 16 peer support. To enable it, install a Next-16-compatible `@sentry/nextjs`
> and re-add the `instrumentation.js` / `src/instrumentation-client.js` hooks, then set
> `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`.

### Database Setup

Run `schema.sql` against your Neon (or any PostgreSQL) database:

```bash
psql $DATABASE_URL -f schema.sql
```

This creates the following tables: `users`, `google_accounts`, `canvas_credentials`, and `push_subscriptions` (for Web Push), plus supporting indexes.

**If upgrading an existing install,** run only the new `push_subscriptions` block from the bottom of `schema.sql` in the Neon SQL Editor — all statements are `CREATE TABLE IF NOT EXISTS` so running the full file again is safe.

### Getting API Keys

<details>
<summary><b>Groq</b> (Corvus AI)</summary>

1. Sign up at [console.groq.com](https://console.groq.com)
2. Create an API key — free tier is available
3. Add it as `GROQ_API_KEY`

</details>

<details>
<summary><b>Google OAuth</b> (sign-in + Google Calendar)</summary>

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 client** (Web application)
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/google/callback` (local dev)
   - `https://your-domain.vercel.app/api/google/callback` (production)
4. Enable the **Google Calendar API** and **Google OAuth2 API** in the Library
5. Copy the client ID and secret into your `.env.local`

</details>

<details>
<summary><b>Canvas</b> (assignment sync)</summary>

No server-side setup needed. Users connect Canvas directly in the app:

1. In Canvas, go to **Account → Settings → Approved Integrations**
2. Click **New Access Token**, give it a name, copy the token
3. In luminaeVigila, open **Canvas settings** in the sidebar and paste the token + your institution's Canvas URL (e.g. `https://canvas.instructure.com`)

</details>

<details>
<summary><b>Neon</b> (database)</summary>

1. Create a free project at [neon.tech](https://neon.tech)
2. Copy the connection string from the dashboard
3. Add it as `DATABASE_URL` and run `schema.sql`

</details>

---

## 📁 Project Structure

```
schema.sql            # PostgreSQL schema: users, google_accounts, canvas_credentials, push_subscriptions
proxy.js              # Next.js 16 route protection
public/
└── sw.js             # Service worker — handles push events + notification click

src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── google/       # Initiates Google sign-in OAuth flow
│   │   │   ├── logout/       # Deletes session cookie → redirects to /login
│   │   │   └── me/           # Returns current signed-in user from session
│   │   ├── google/
│   │   │   ├── auth/         # Initiates Google Calendar connect flow
│   │   │   ├── callback/     # Handles both sign-in and calendar-connect
│   │   │   └── events/       # Fetches events from connected Google Calendar accounts
│   │   ├── canvas/
│   │   │   ├── credential/   # GET / POST / DELETE Canvas token + URL
│   │   │   ├── courses/      # Fetch active student course enrollments
│   │   │   ├── assignments/  # Fetch assignments with submission data
│   │   │   └── calendar/     # Fetch manual Canvas calendar events
│   │   ├── push/
│   │   │   ├── subscribe/    # POST upsert / DELETE remove push subscription
│   │   │   └── send/         # POST send push notification to all user subs
│   │   └── corvus/           # Groq AI chat endpoint (context-aware)
│   ├── error.js              # Next.js App Router error boundary page
│   ├── login/                # Sign-in page
│   ├── globals.css
│   ├── layout.js
│   └── page.js               # Main app shell, state, and layout
│
├── components/
│   ├── Corvus.js                     # AI assistant (floating panel + full tab)
│   ├── WeeklyCalendar.js             # FullCalendar wrapper (all views)
│   ├── TodoPanel.js                  # To-do list panel (sidebar strip + full-page)
│   ├── CoursesPanel.js               # Canvas courses + assignments tab
  ├── GpaPanel.js                   # GPA / grade-projection collapsible card (inside Courses tab)
│   ├── SearchPanel.js                # Search UI — events, tasks, Canvas
│   ├── MiniMonthCalendar.js          # Compact month grid for sidebar (desktop only)
│   ├── FocusTimer.js                  # Optional Pomodoro focus timer + full-screen zen mode
│   ├── ErrorBoundary.js              # React error boundary with friendly recovery card
│   ├── ServiceWorkerRegistration.js  # SW registration + push subscription client component
│   ├── ImportExportButton.js         # JSON import/export
│   ├── EventModal.js                 # Add/edit calendar event modal
│   ├── AddTodoModal.js               # Add/edit task modal (with subtasks)
│   ├── GoogleCalendarSettings.js     # Google Calendar settings modal
│   ├── SidebarGoogleSection.js       # Sidebar — Google Calendar accounts + toggles
│   ├── CanvasSettingsModal.js        # Canvas connect/disconnect modal
│   ├── SidebarCanvasSection.js       # Sidebar — Canvas courses + toggles
│   ├── SidebarScheduleSection.js     # Sidebar — manual class schedule
│   ├── ClassScheduleModal.js         # Add/edit class meeting
│   ├── DatePicker.js                 # Custom date picker
│   ├── TimePicker.js                 # Time picker — text input + analog clock popup
│   ├── CategoryManager.js            # Manage to-do categories
│   ├── Select.js                     # Custom dropdown
│   └── Toast.js                      # Toast notifications
│
└── lib/
    ├── db.js               # Neon PostgreSQL client
    ├── session.js          # JWT session via jose
    ├── auth.js             # findOrCreateUser(email)
    ├── googleAuth.js       # OAuth2 client + token refresh
    ├── googleTokenStore.js # Per-user Google token storage
    └── canvasTokenStore.js # Per-user Canvas credential storage
```

---

## 🗄 Data Storage

<div align="center">

| Data | Where |
|:---|:---|
| Events & tasks | Browser `localStorage` — no account needed |
| Event / calendar preferences | Browser `localStorage` |
| Search history | Browser `localStorage` (`lv-search-history`) |
| Focus timer settings & today's stats | Browser `localStorage` (`lv-focus`) |
| Study time sessions (per course) | Browser `localStorage` (`lv-study-sessions`) |
| Canvas seen-IDs (notification diff) | Browser `localStorage` (`lv-canvas-seen-ids`) |
| GPA credit-hours, grade overrides | Browser `localStorage` (`lv-gpa`) |
| Google Calendar tokens | Neon DB, per user |
| Canvas credentials | Neon DB, per user |
| Push subscriptions | Neon DB, per user + device |
| User accounts | Neon DB — created on first sign-in |
| Session | httpOnly cookie `lv_session` (JWT, 30-day expiry) |

</div>

Google Calendar and Canvas data is never stored server-side long-term. Tokens are used to fetch on demand; results are held in React state and cached to `localStorage` for fast reloads.

---

<div align="center">

[![Built by Lesia](https://img.shields.io/badge/Built%20by-Lesia-243b55?style=flat-square)](https://github.com/KBITK)&nbsp;
[![Powered by Next.js](https://img.shields.io/badge/Next.js-black?style=flat-square&logo=next.js)](https://nextjs.org)&nbsp;
[![Groq AI](https://img.shields.io/badge/Groq-AI-3a6fa8?style=flat-square)](https://groq.com)&nbsp;
[![Neon DB](https://img.shields.io/badge/Neon-DB-10b981?style=flat-square)](https://neon.tech)

</div>
