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

### 📆 Class Schedule *(no Canvas required)*
- Add recurring class meetings manually — days of week, time, room, semester dates
- Classes appear as color-coded repeating events on the calendar
- **Link to Canvas** — optionally connect a schedule entry to its matching Canvas course
- Fully independent of Canvas

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
│   ├── SearchPanel.js                # Search UI — events, tasks, Canvas
│   ├── MiniMonthCalendar.js          # Compact month grid for sidebar (desktop only)
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
| Canvas seen-IDs (notification diff) | Browser `localStorage` (`lv-canvas-seen-ids`) |
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
