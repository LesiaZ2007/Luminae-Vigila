<div align="center">

# 🪶 luminaeVigila

**A student planner that actually gets it.**  
Sync your Google Calendar and Canvas LMS, manage tasks, and ask an AI assistant — all in one dark, minimal interface.

Works fully offline without an account. Sign in to sync across devices.

[![Live App](https://img.shields.io/badge/Live%20App-luminae--vigila.vercel.app-4a90d9?style=for-the-badge&logo=vercel&logoColor=white)](https://luminae-vigila.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js%2016-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![FullCalendar](https://img.shields.io/badge/FullCalendar%206-4285F4?style=for-the-badge)](https://fullcalendar.io)

</div>

---

## ✨ Features

### 📅 Calendar & Tasks
- **Weekly / monthly / daily views** — create, edit, and delete events with categories, colors, recurrence rules, reminders, and notes
- **Drag to create** — drag the sidebar card onto any time slot to start a new event
- **To-do list** — tasks with priorities, categories, due dates, recurring schedules, and event linking
- **Hide events** — hide individual events from view; reveal them back semi-transparently anytime

### 🔵 Google Calendar
- Connect **multiple Google accounts** and toggle individual calendars on or off
- Events auto-refresh every 5 minutes; per-calendar color overrides stored locally
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
- Fully independent of Canvas

### 🔐 Sign In *(optional)*
- **Local-first by default** — events and tasks live in your browser's local storage, no account needed
- **Sign in with Google** to sync your identity across devices
- Google Calendar and Canvas connections are separate explicit opt-ins — signing in only handles identity
- Sidebar shows your email and a sign-out button when logged in; a "Sign in to sync" link when not

### 📦 Import / Export
- **Export** all local events and tasks as a timestamped JSON file
- **Import** a previously-exported file to restore or transfer data to any browser or device
- Only local data is included — Google Calendar and Canvas data re-sync from the source
- Access via the `{ }` button to the left of the Corvus button (bottom-right)

### 🪶 Corvus AI Assistant
- Chat-based assistant powered by [Groq](https://groq.com) (`llama-3.3-70b-versatile`)
- Aware of your upcoming events, tasks, and Canvas assignments
- Can add events and tasks, edit them, and mark things complete — all via natural language
- Runs as a floating panel or a full-screen tab

### 🌦 Everything Else
- **Weather widget** — live temperature and rain forecast pulled from Open-Meteo
- **Dark / light mode** — toggle from the sidebar
- **Responsive design** — desktop (full sidebar), tablet (168px mini-sidebar with labels), mobile (bottom tab navigation)
- **Mobile view switcher** — M / W / D labels instead of Month / Week / Day

---

## 🛠 Tech Stack

| | |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) — App Router |
| **Calendar** | [FullCalendar 6](https://fullcalendar.io) |
| **AI** | [Groq](https://groq.com) — `llama-3.3-70b-versatile` |
| **Auth** | Google OAuth 2.0 · JWT sessions via [jose](https://github.com/panva/jose) |
| **Database** | [Neon](https://neon.tech) serverless PostgreSQL |
| **Google APIs** | Google Calendar API · Google OAuth2 API |
| **Canvas** | Canvas LMS REST API (token-based, no OAuth) |
| **Theming** | [next-themes](https://github.com/pacocoursey/next-themes) |
| **Deployment** | [Vercel](https://vercel.com) |

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
```

### Database Setup

Run `schema.sql` against your Neon (or any PostgreSQL) database to create the required tables:

```bash
psql $DATABASE_URL -f schema.sql
```

This creates three tables: `users`, `google_accounts`, and `canvas_credentials`.

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
schema.sql            # PostgreSQL schema: users, google_accounts, canvas_credentials
proxy.js              # Next.js 16 route protection (currently open)

src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── google/       # Starts Google sign-in (identity only, no calendar)
│   │   │   ├── logout/       # Clears session cookie
│   │   │   └── me/           # Returns current user from session
│   │   ├── google/
│   │   │   ├── auth/         # Starts Google Calendar connect (calendar scope)
│   │   │   ├── callback/     # Handles both sign-in + calendar-connect callbacks
│   │   │   └── events/       # Fetches events from connected Google accounts
│   │   ├── canvas/
│   │   │   ├── credential/   # Get / set / clear Canvas token + base URL
│   │   │   ├── courses/      # Fetch active enrolled courses
│   │   │   ├── assignments/  # Fetch assignments for a list of courses
│   │   │   └── calendar/     # Fetch manual calendar events from Canvas
│   │   └── corvus/           # Groq AI chat endpoint
│   ├── login/                # Sign-in page (Google OAuth button)
│   ├── globals.css
│   ├── layout.js
│   └── page.js               # Main app shell and state
│
├── components/
│   ├── Corvus.js                  # AI assistant UI
│   ├── WeeklyCalendar.js          # FullCalendar wrapper
│   ├── TodoPanel.js               # To-do list (sidebar + full-page)
│   ├── CoursesPanel.js            # Canvas courses + assignments tab
│   ├── ImportExportButton.js      # JSON import/export FAB
│   ├── EventModal.js              # Add/edit event modal
│   ├── AddTodoModal.js            # Add/edit task modal
│   ├── GoogleCalendarSettings.js  # Google Calendar settings modal
│   ├── SidebarGoogleSection.js    # Sidebar Google Calendar section
│   ├── CanvasSettingsModal.js     # Canvas connect/disconnect modal
│   ├── SidebarCanvasSection.js    # Sidebar Canvas section + course toggles
│   ├── SidebarScheduleSection.js  # Sidebar class schedule section
│   ├── ClassScheduleModal.js      # Add/edit class meeting modal
│   ├── DatePicker.js              # Custom date picker
│   ├── TimePicker.js              # Time picker (text input + analog clock popup)
│   ├── CategoryManager.js         # Manage to-do categories
│   ├── Select.js                  # Custom dropdown
│   └── Toast.js                   # Toast notifications
│
└── lib/
    ├── db.js               # Neon PostgreSQL client
    ├── session.js          # JWT session — create / get / delete
    ├── auth.js             # findOrCreateUser()
    ├── googleAuth.js       # OAuth2 client + token refresh handler
    ├── googleTokenStore.js # Per-user Google token storage (Neon)
    └── canvasTokenStore.js # Per-user Canvas credential storage (Neon)
```

---

## 🗄 Data Storage

| Data | Where |
|---|---|
| Events & tasks | Browser `localStorage` — no account needed |
| Event / calendar preferences | Browser `localStorage` |
| Google Calendar tokens | Neon DB, per user |
| Canvas credentials | Neon DB, per user |
| User accounts | Neon DB — created on first sign-in |
| Session | httpOnly cookie `lv_session` (JWT, 30-day expiry) |

Google Calendar and Canvas data is never stored server-side long-term. Tokens are used to fetch on demand; results are held in React state and cached to `localStorage` for fast reloads.

---

<div align="center">

Built by Lesia · Powered by Next.js, FullCalendar, Groq, and Neon

</div>
