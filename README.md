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
- Search across events, tasks, Canvas assignments, notes, and custom-list items with scope and status filters
- Results grouped by type — Canvas assignments, tasks, and events in a split layout
- **Smart navigation** — clicking a search result jumps the calendar directly to that event's date/week, opens the preview, and keeps the calendar on that date when you close it
- **Due date labels** — smart relative labels (Today, Tomorrow, Overdue, etc.)
- **Recent searches** — last 5 queries stored locally; tap a chip to re-run; Clear button removes history
- **Date range filter** — collapsible From / To date pickers filter all result types simultaneously
- **Keyboard navigation** — arrow keys move focus through results; Enter opens the highlighted item

### 📋 Custom Lists

Lightweight standalone checklists that live alongside your regular To-Do tasks — great for groceries, packing lists, wish lists, project notes, and anything that doesn't need priorities or categories.

- **List switcher** — a tab row at the top of the To-Do area lets you switch between **My Tasks** (the normal todo view) and any custom list you've created. Works on both the desktop sidebar/full-page To-Do panel and the mobile To-Do tab.
- **Create a list** — tap **+** in the switcher to open a creation sheet. Choose a **Lucide icon** (ShoppingCart, Package, ListChecks, NotebookPen, Backpack, Gift, Wrench, Lightbulb, Plane, Heart, Star, BookOpen, Dumbbell, Utensils), pick an **accent color** from the swatch palette, and give the list a name. Default icon is ListChecks, default color is Luminae blue (`#3a6fa8`). Existing lists with a legacy emoji in `icon` render the emoji as a text fallback.
- **Per-list color** — the chosen color tints the active tab indicator, item checkboxes, and the list header badge. Edit at any time via the pencil icon in the list header, which reopens the name/icon/color editor.
- **Items** — each item has a checkbox (tinted in the list accent color) and text. Checking an item strikes it through. Items can also have an optional **due date** and a short **note**, both accessible via the **⋯** affordance on every row. Double-click a non-checked item's text to rename it inline.
- **Subtasks** — each item supports optional nested sub-items (`item.subtasks: [{id, text, checked}]`). Add one via **Add subtask** in the ⋯ menu. Subtasks can be checked, double-click-renamed, and deleted with the × button. Subtasks are independent of the parent — checking all subtasks does **not** auto-check the parent item.
- **⋯ item menu** — the dropdown renders in a `position: fixed` layer anchored to the button's viewport coordinates, so it always escapes `overflow: hidden` list containers on both desktop and mobile. Closes on outside click or Escape.
- **List-level due date** — optionally set a due date on the entire list via the **Due date** field in the New/Edit List form (uses the app's styled `<DatePicker>` component). Appears as a small pill with a Calendar icon (e.g. ⌕ Jun 20) in the list header, tinted with the list color. The pill has an inline × to clear it. The due date is additive (`list.dueDate: 'YYYY-MM-DD' | null`) — no schema or sync changes needed.
- **Due dates on the calendar** — lists with a due date (not fully complete) and individual unchecked items with a due date each appear as all-day markers in the calendar's Tasks row, tinted with the list color. Clicking navigates directly to that list (sets To-Do nav active and selects the list). Marker shapes mirror the Canvas assignment task markers.
- **Due dates in Agenda View** — the same list-level and unchecked-item due dates appear in the Agenda View grouped by day alongside events, tasks, and Canvas assignments. Each entry shows a "List" or "List Item" badge tinted with the list color; clicking navigates to the list. Both list-and-item entries appear within the standard 14-day window.
- **Completion confetti + tab cross-off** — when every top-level item in a list becomes checked (≥1 item required), a confetti burst fires once (only on the incomplete → complete transition, not on every render). The burst is positioned at the list name element in the header (falls back to viewport center). The list's tab shows a faded (opacity ~0.55) line-through name and a small check mark; the same faded strikethrough applies to the list header name. Both effects clear automatically if any item is unchecked.
- **Escape + backdrop closes modals** — both the New List and Edit List modals close on Escape (keydown listener attached while open, cleaned up on close) in addition to the existing backdrop click.
- **Delete from tab** — each custom list tab has a small **×** button. Clicking it opens the same confirm dialog as the in-list delete. "My Tasks" has no × and cannot be deleted.
- **Reorder by dragging** — grab the grip handle (appears on hover, desktop only) to drag items into any order using the same pointer-drag pattern as the regular task list.
- **Touch swipe gestures** — on mobile, swipe right to check an item and swipe left to delete it, same thresholds and snap-back behaviour as the main To-Do swipe gestures.
- **Clear checked** — a per-list button removes all checked items at once.
- **Cloud sync** — custom lists sync to Neon for signed-in users via the existing `/api/sync` endpoint (same debounced POST + atomic transaction pattern). Stored in a `custom_lists` table (JSONB, self-creating `CREATE TABLE IF NOT EXISTS`). Unsigned-out users keep data in `localStorage` under `lv-custom-lists`. New fields (`icon`, `color`, `subtasks`, `dueDate`) are additive — no schema or sync changes needed.
- **Offline-first** — `localStorage` is the source of truth; cloud is additive. Merge on sign-in is local-wins; the manual cloud refresh is cloud-wins (same as events/tasks).

### 📝 Notes

A full rich-text notepad, in the same place as everything else. Press `W` anywhere in the app to start writing.

- **Dedicated Notes tab** — sits between To-Do and Search in the sidebar and mobile bottom nav. Two panes on desktop (note list left, editor right); on mobile the list fills the tab and selecting a note pushes the editor over it, with an **All notes** back button.
- **Rich text via Tiptap** — bold, italic, underline, strikethrough, **multi-colour highlight**, H1/H2, bullet lists, numbered lists, checkbox lists, blockquotes, inline code, and undo/redo. The toolbar is custom-built with the app's own CSS variables, so notes match luminaeVigila in every accent theme and in dark mode.
- **Markdown shortcuts while typing** — `**bold**`, `*italic*`, `` `code` ``, `# heading`, `> quote`, `- ` bullet, `1. ` numbered, `[] ` checkbox, and `==highlight==` all convert as you type. You never have to reach for the toolbar.
- **Highlight palette** — six pastel swatches (yellow, green, blue, pink, orange, purple) chosen to stay readable in both light and dark themes, plus a "remove highlight" option. Click the highlighter to open the swatch popover. The popover renders through a `createPortal` layer anchored to the button's viewport rect, because the toolbar scrolls horizontally (`overflow-x: auto`) and would otherwise clip it. Closes on outside click or Escape.
- **Titles** — type an explicit title, or leave it blank and the first line of the body becomes the title automatically.
- **Star and pin** — starring marks a favourite (filterable via the **Starred** tab); pinning sorts a note to the very top. They're independent. Sort order is pinned → starred → most recently updated.
- **Tags** — add free-form tags per note; tag chips appear above the list and filter it on click. Tags are case-insensitively de-duplicated. Each note's own tags also render as pills on its row in the list (first 3, then a `+N` counter), tinted with that note's accent colour.
- **Motion** — rows slide in on creation and when filtering, and collapse horizontally on delete so removal reads as removal rather than a jump cut (the parent's delete is held ~200 ms so there's something left to animate). The panel and editor fade in on open, and the editor is keyed on note id so the fade replays per note. All of it is disabled under `prefers-reduced-motion`.
- **Per-note colour** — eight accent swatches (same palette as Custom Lists) tint the note's spine in the list and the bar beside its title.
- **Reminders** — set an absolute date + time on any note using the app's styled `<DatePicker>` / `<TimePicker>`. Reminders fire as an in-app toast while the tab is open **and** as a Web Push notification when the app is closed, via the existing `/api/push/reminders` cron (de-duplicated through the `sent_reminders` table like event and task reminders). The push body is a plain-text snippet of the note.
- **Images** — **paste** a screenshot straight into the body (Ctrl/Cmd+V), **drag and drop** a file onto the editor, or use the 🖼 toolbar button (the button is there for mobile, where neither of the other two is comfortable). Multiple files at once are uploaded in the order you picked them, and a spinner in the toolbar tracks them.
  - **Resized in the browser first.** Longest edge is capped at 1600 px and the result is re-encoded to WebP (JPEG where WebP isn't supported) at quality 0.85. A 4 MB phone photo lands at 150–400 KB. Images already under 320 KB pass through untouched rather than being re-compressed for nothing, and **GIFs are never re-encoded** because a canvas round-trip would flatten the animation away.
  - **Stored in Postgres, not inlined.** The note body carries only `/api/notes/images/<id>`. Inlining base64 would put a multi-megabyte string into `localStorage` (a ~5 MB quota for the *whole app*) and re-upload it on every `/api/sync` POST. The bytes live in a `note_images` table; `allowBase64` is off in the Tiptap extension so a data URI can't sneak back in.
  - **Private.** `GET /api/notes/images/<id>` requires a session and is scoped to `user_id` — a URL that escapes a note body is not a way to read someone else's picture. A wrong-owner read returns **404, not 403**, since distinguishing them would confirm the id exists. Responses are `Cache-Control: private, immutable` with an ETag, so repeat views are 304s.
  - **Requires sign-in.** An image held only in one browser's `localStorage` would break the moment the note synced elsewhere, so signed-out users get a toast instead of a broken picture.
  - **SVG is rejected** at upload. It's a document format that can carry script, and these bytes are served from the app's own origin. Allowed: PNG, JPEG, WebP, GIF, up to 4 MB after resizing.
  - **Orphans are reaped** on sync, but only once they've been unreferenced for **30 days**. Sync is last-write-wins, so a phone that's been offline can POST a notes array predating an image added on a laptop — reaping strictly-unreferenced rows would delete it and leave a permanent broken image. The grace window makes that race require a 30-day-stale device.
  - A note that is *only* an image previews as "Image" rather than a blank card, and its reminder push says "Image" rather than sending an empty body.
- **Link to a course, event, or task** — attach a note to a Canvas course, calendar event, or open task. The linked item's name appears on the note's meta bar and a link icon shows in the list row.
- **Soft delete with undo** — deleting moves a note to **Trash** and raises an undo toast. Trashed notes are restorable or permanently deletable from the Trash filter, and are purged automatically after **30 days**. Because the trash flag syncs, deleting on one device removes it on the others too.
- **Autosave** — the body saves 400 ms after you stop typing, and flushes on note switch and on unmount so nothing is lost mid-sentence. A "Saved" / "2m ago" indicator sits in the meta bar.
- **Search integration** — a **Notes** scope in the search popup, plus notes in "All" results. Titles, body text, and tags are all searched; clicking a result opens that note. Notes ignore the upcoming/done status filter since they have no completion state.
- **Import / Export** — notes are included in the JSON backup and in JSON import (with the same skip / replace / keep-both duplicate handling as events and tasks). An export containing only notes is a valid import file.
- **Cloud sync** — notes sync to Neon for signed-in users through `/api/sync`, stored in a `notes` table (JSONB, self-creating `CREATE TABLE IF NOT EXISTS`). Signed-out users keep everything in `localStorage` under `lv-notes`.
- **Conflict resolution** — unlike lists and tasks, notes merge **strictly by `updatedAt`** (newest edit wins) rather than local-wins. A note body is a single blob, so local-wins would silently discard an edit made on another device.
- **Lazy-loaded** — Tiptap/ProseMirror is code-split behind `next/dynamic` with `ssr: false`, so it never lands in the initial bundle for the default Calendar tab.
- **Backlinks** — a note attached to a course, event, or task now shows up *on that item* too, via a Notes section in the event editor, the task editor, and the course card, each with a "New note" action that pre-links what you're looking at.
- **Turn into a task or event** — promote a note (or just the text you've selected inside it) into a real task or calendar event. Opens the relevant editor prefilled rather than creating silently, since a task wants a due date and an event wants a time. The note is linked to whatever gets created.
- **Share into a note (Android)** — luminaeVigila appears in the system share sheet. Highlight text anywhere, Share → luminaeVigila, and it arrives as a new note tagged `shared`. A "New note" home-screen shortcut starts one directly.

### ✅ Tasks — Drag-to-Reorder
- Grab the **grip handle** (appears on hover, desktop only) to drag tasks into any order
- Order is persisted in a `sortOrder` field on each todo — survives refreshes and cloud sync
- Tasks without a `sortOrder` fall back to date-based sorting; new items added before or after reordering work seamlessly

### 👆 Tasks — Swipe Gestures *(mobile / touch)*
- **Swipe right** on a task to mark it complete — triggers the existing confetti celebration
- **Swipe left** on a task to delete it — reveals a red trash background as visual feedback
- Axis is locked after 6 px of movement so horizontal swipes don't fight vertical scrolling
- A 72 px threshold prevents accidental triggers; items snap back if the swipe falls short

### ↩️ Undo Delete
- Deleting a **task** or a **calendar event** shows a toast for ~6 seconds with an **Undo** button
- Tapping Undo fully restores the item (including its synced state and any subtasks)
- The deletion is "soft" — the item is removed from view immediately but todo/event unlinking is deferred until the undo window closes, so a full restore is always possible
- Works for single events and "delete all in series" recurring event deletions

### 📋 Tasks — Subtasks
- Add up to 20 subtasks to any to-do item in the Add/Edit modal
- Each subtask can be checked off individually — matches CoursesPanel done style with strikethrough
- Progress chip on the task row shows `X/Y steps`; click to expand the inline checklist

### 🎯 Focus Timer *(optional)*
- **Pomodoro-style timer** tied to your tasks — open it from the timer FAB (desktop) or the Settings tab (mobile)
- **Focus → break → repeat:** a short break after each focus session and a **long break every 4 sessions** (all lengths configurable)
- **Pick what you're focusing on** — a task, a Canvas assignment, or a **calendar event**. Completed sessions accumulate focus time on it (`X focused so far`)
  - **Exams and quizzes lead the list** — revising for a specific exam is the longest-running focus target a student has, so events with the `exam` category are grouped first, followed by tasks, Canvas assignments, and then other upcoming events (capped at 20, so a term of classes doesn't bury everything else)
  - Only *upcoming* events are offered — an exam you already sat is never the intent
  - Time focused on an event accumulates on that event under `extendedProps.focusSeconds` and syncs like any other event field
- **Pop out the timer** *(desktop Chrome / Edge)* — the picture-in-picture icon in the header opens a small floating window that stays **above other applications**, so the countdown is visible while you work in something else. It shares state with the main panel: pausing in either pauses both, because there is only one timer. Closing the timer takes the pop-out with it.
  - Uses the [Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API). The button is hidden entirely where it isn't supported — **Firefox, Safari, and all phones and tablets**. Floating over other apps on mobile needs a native overlay permission that no web API exposes; use full-screen zen mode there instead.
- **Course tag** — optionally tag each focus session with a Canvas course (dropdown shows your enrolled courses; default: None). The tag is persisted so the same course is pre-selected next time you open the timer.
- **Configurable durations** — set Focus / Short / Long lengths; one click resets to the factory `25 / 5 / 15`, or save your own values as your personal default
- **Auto-start toggle** — off by default, so the timer pauses between phases and waits for you to press play; flip it on for hands-free cycles
- **Built-in help** — a lightbulb in the header toggles a short, dismissible note explaining the flow and whether phases auto-advance
- **Log to calendar — on by default** — every finished focus session lands on the calendar as a real, editable time-block (this is how tasks become *time-blocking*). Toggle it off in the timer's settings drawer if you'd rather not.
  - The block is titled after what you focused on (`🎯 Focus · Chem Lab`) and carries the course tag, the focus target, and the study-session id in `extendedProps`, so it still explains itself when you open it weeks later
  - The completion toast says when a block was added — silently writing to your calendar isn't something to do quietly
  - Existing installs are migrated on next load (a stored `false` from the old default would otherwise shadow the new one forever); the migration is version-stamped so it runs once and never re-enables a setting you turned off
- **Full-screen "zen" mode** — a large glowing progress ring with a selectable ambient background: **Snow**, **Aurora**, **Rain** (diagonal streaks), or **Fireflies** (warm drifting glowing dots) — all pure CSS/JS animation, no assets (Esc to exit)
- A gentle two-note chime + confetti celebrate each completed session (chime can be muted); reminders also fire via the existing notification + push pipeline
- Completed sessions are saved to `localStorage` (`lv-study-sessions`) for the Study Time panel; when signed in they are included in the cloud sync and will appear on all your devices
- Self-contained — adds `lv-focus` and `lv-study-sessions` localStorage keys; never alters existing events or tasks

### ⏱ Study Time Tracking

A collapsible **Study Time** card appears in the Courses tab below the GPA panel once at least one tagged focus session exists.

- **Weekly hours per course** — horizontal CSS bars (no chart library) showing this week's focused time broken down by Canvas course; untagged sessions appear as "Untagged"
- **Total this week** displayed in the header pill; **week-over-week comparison** shown as a colored delta when last-week data exists
- Sessions come from the Focus Timer's course tag; data is stored in `localStorage` under `lv-study-sessions` and synced to Neon DB for signed-in users (cross-device)
- **Past sessions** — an "All sessions" tab lists every completed session, newest first, grouped by day (`Today` / `Yesterday` / `Mon, Aug 3`) with the day's total, what you focused on, the end time, and the duration. Capped at 5 days with a "show earlier" button, so a term of sessions isn't a scroll trap
- **Retroactive tagging** — a 🏷 button on any past session assigns (or clears) its course. The tag previously came only from whatever was selected in the timer when the session finished, which is easy to forget and was impossible to correct, leaving that time stuck under "Untagged" forever. Edits stamp `updatedAt` so they win the last-write-wins sync merge against a stale copy on another device
- Sessions now record `endedAt` and `targetTitle`; older rows predate both and simply render without a time or subject line
- The same list appears in the **Focus Timer**'s expanded "Your week" section — the Courses tab only exists once Canvas is connected, so that copy is the one that's always reachable
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

### 📊 Weekly Recap + Streaks

A compact **"Your week"** section lives inside the **Focus Timer** panel (open it from the desktop timer FAB or the mobile Settings tab), grouping your weekly stats with the rest of your timing tools:

- **Tasks completed this week** — counts both to-do completions and Canvas mark-done actions
- **Focus hours this week** — reads from the Focus Timer's `lv-study-sessions` localStorage key
- **Day streak** — a flame icon shows consecutive days with at least one completed task or focus session; tracked in `localStorage` under `lv-streak` (`{streak, lastDate, bestStreak, completionDates, lastWeekCompleted}`)
- **Week-over-week delta** — "+3 vs last wk" if you did more tasks than last Sunday–Saturday
- Totals under an hour display as minutes (`25m`) rather than rounding to `0h`
- **Personal-best confetti** — hitting a new longest streak triggers the existing confetti component
- Streak is updated automatically when any task or Canvas assignment is marked done

> **Fixed:** an infinite render loop. `todos` and `canvasAssignments` default to `[]`, and a default parameter builds a *new* array every render — so the refresh callback's identity churned, its effect re-ran, set state, and rendered again without end. It stayed quiet only because `page.js` happens to pass memoised arrays; any caller omitting a prop or passing a literal would have spun the tab. The state update now bails out when nothing changed, which breaks the cycle regardless of what callers do.

> **Fixed:** the weekly focus total read `durationMs` while the Focus Timer writes `durationSec`, so **every session counted as zero** and the card showed `0h` no matter how much you'd focused. The Study Time panel was unaffected — it always read the right field. The card also now re-reads when a session completes instead of showing the total from when it mounted, and parses session dates as local (a bare `YYYY-MM-DD` read as UTC midnight dropped Sunday sessions out of the week that had just started).

### 📛 PWA App Icon Badge

When supported by the browser/OS (Android Chrome, desktop Chrome/Edge), the app icon shows a numeric badge equal to the count of **overdue plus due-today** tasks and Canvas assignments. The badge clears when everything is done. Uses the [Web Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API); silently ignored on unsupported browsers.

Overdue is included deliberately: a badge that drops to zero while late work is still outstanding is actively misleading.

> **Fixed:** the badge previously computed "today" with `toISOString().slice(0,10)`, which is **UTC**. From ~8 PM Eastern onward it silently switched to counting *tomorrow's* work. Date handling now goes through `src/lib/localDate.js` and stays in the viewer's own timezone.

### 🗓 Today at a Glance — `/today`

A deliberately small, chrome-free, **read-only** page: overdue work, today's schedule, and what's due — nothing else, no nav, no editing.

- Built to be *looked at* rather than used: pin it to a home screen as its own icon, park it in a tablet split-screen or iPad Slide Over, or open it from the daily push
- Reads straight from `localStorage` so it paints instantly and works with **no network** — a full app boot can't promise either
- Live-updates via the `storage` event, so editing in the main app next door is reflected without a refresh
- Everything it shows comes from `src/lib/glance.js`, shared with the daily push and the icon badge, so the three can never disagree about what today looks like

### 📲 Home-Screen Shortcuts

Long-press the installed app icon for **Today**, **New task**, **Start focus**, and **New note**. The task and focus entries deep-link via query flags (`/?new=task`, `/?focus=1`) which are stripped with `replaceState` once handled, so a refresh doesn't reopen the modal.

> Android reads `shortcuts` and `share_target` **at install time** — remove and re-add the PWA after deploying for new entries to appear.

### ☀️ Daily "Today at a Glance" Push

A morning push with the day's counts and the first thing on the calendar:

> **Today at a glance** — 2 overdue · 3 due today · 4 events — first up: Physics at 9:30 AM

- Tapping it opens `/today` (the service worker honours a `url` in the push payload, same-origin only)
- **Silent on an empty day.** A push that says "nothing today" every morning trains you to ignore the app's notifications entirely, which then costs you the reminders that matter
- Runs at `0 11 * * *` UTC. Vercel crons run in UTC with no per-user send time, but subscriptions now store the device's `tz_offset`, so the *contents* are computed against the reader's calendar day even when the hour isn't ideal
- **Upgrade existing install:** the endpoints self-heal, but you can run these in the Neon SQL Editor to be explicit:
  ```sql
  ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS daily_enabled BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tz_offset INTEGER NOT NULL DEFAULT 0;
  ```

### 🩺 Notification Troubleshooting

Push fails **silently**: the browser reports "enabled", the server reports "sent", and nothing appears. **Settings → Notifications → Test notifications** walks the five links in the chain and reports the first one that's actually broken — browser support, permission, VAPID keys, a recorded subscription, and delivery — then sends a real push.

- `GET /api/push/status` — booleans and counts only; never returns key material or the cron secret
- `POST /api/push/test` — sends immediately and reports the push service's **actual rejection per endpoint**. A 403 (key mismatch) and a 410 (expired subscription) look identical from the client but need completely different fixes
- **If the test arrives but reminders don't, the problem is the scheduler, not the device** — see below

**Cron heartbeats.** Every authorised cron run stamps a row in `cron_pings`, and the
troubleshooter reports how long ago each job last got through. This exists because a
cron being pinged with the *wrong* secret is otherwise indistinguishable from a cron
nobody pings at all — both are silent. Worse, **Vercel injects `CRON_SECRET` into its
own crons**, so rotating the secret without updating the external pinger breaks only
`/api/push/reminders`: the daily glance keeps arriving while reminders die, which
reads as "notifications work, reminders are broken" and sends you inspecting the
phone instead of the scheduler. The troubleshooter now says so in one line.

Only successes are recorded. Logging rejections would mean a database write on every
unauthenticated hit to a public URL, and buys nothing — a 401 loop and a dead pinger
both show up as "last success was ages ago".

Full detail in **[docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)**.

### 📬 Sunday Week-Ahead Push Digest

Opted-in users receive a background push every **Sunday at 6 PM UTC** with a personalised preview of the coming week:

> **Your week ahead** — 4 tasks, 2 events — busiest day: Wednesday

- Opt in/out via the **"📬 Weekly digest ON/OFF"** toggle in the **Focus Timer** panel's "Your week" section
- Requires sign-in (the toggle shows "Sign in to get a Sunday week-ahead digest" otherwise)
- The cron is configured in `vercel.json` and calls `GET /api/push/digest` — protected by `Authorization: Bearer $CRON_SECRET`
- **The opt-in is per account, and defaults on.** It lives in `users.digest_enabled`, read
  by the toggle through `GET /api/push/digest-pref`

**Why it moved off `push_subscriptions`.** The flag used to be stored per subscription
and defaulted to `false`, while the toggle read its state from `localStorage`. Three
consequences, all silent: the feature shipped switched off for everybody; turning it on
at a desk left every phone opted out; and each browser displayed its own cached guess at
a setting it may never have written. A weekly week-ahead summary is a preference about
*you*, not about a browser profile — so it is now one row per account, defaulting on to
match `daily_enabled`. `push_subscriptions.digest_enabled` is left in place but unread;
dropping a column is unrecoverable and buys nothing.

- **Upgrade existing install:** nothing to run — `src/lib/pushSchema.js` applies
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT true`
  on the next request to any push route, the same self-healing pattern the rest of the API
  uses. To do it by hand, that statement is the whole migration

### 🔔 Browser Push Notifications
- Service worker (`/sw.js`) enables notifications even when the tab is closed or backgrounded. Uses PNG icons (`icon-192.png` / `notification-icon.png`) — **Android Chrome does not render SVG notification icons**.
- Permission is **requested on a user tap** via the **"Enable notifications"** button in the Focus Timer's "Your week" section. Mobile browsers (Android Chrome) silently ignore permission prompts that aren't triggered by a gesture, so the app never auto-prompts — it registers the service worker silently and only subscribes once you tap Enable.
- **Reminders fire even when the app is closed** via a server-side scheduler: `GET /api/push/reminders` scans every subscribed user's events/todos for reminders that just came due and sends a push, de-duped through the `sent_reminders` table. This runs independently of any open tab (the old behaviour only fired reminders while a tab was open — which on a phone is almost never when a reminder is due).
  - ⚠️ **This endpoint does nothing unless something calls it, and that is the single most common reason no notifications ever arrive.**
  - **There is no cap on notifications per day.** Web Push has no quota — not from Vercel, not from the browser push services. The only limit is *how often Vercel will ping your endpoint*, so the heartbeat runs outside Vercel and the constraint disappears.
  - **Set up with [cron-job.org](https://cron-job.org)** — free, purpose-built, true **1-minute** intervals. The tick rate *is* the accuracy: a 5-minute tick means a reminder set for 3:07 arrives at 3:10. Point a job at `https://<your-domain>/api/push/reminders`, every 1 minute, with header `Authorization: Bearer <CRON_SECRET>`, then use **Test run** to confirm (`200` + `{"ok":true,...}`; `401` means the secret or header is wrong). Full walkthrough in [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).
  - **Can't read `CRON_SECRET` back out of Vercel?** You're not meant to — values are write-only after creation. Generate a new one (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) and set the same value in both Vercel and cron-job.org. It only has to match, not be the original.
  - GitHub Actions was tried and removed: 5-minute minimum schedule, best-effort start times that slip 10+ minutes under load, and ~60 runner-minutes/hour to work around it.
  - Idempotent either way — `sent_reminders` dedupes, so overlapping pingers can't double-send.
  - `vercel.json` is **schema-validated and rejects unknown keys** (including comment properties — a stray `_comment` fails the build). Explanations live in [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) instead.
- iOS Safari requires the app to be added to the Home Screen (iOS 16.4+). Android Chrome works in-browser with no install.
- **Upgrade existing install:** run the `sent_reminders` `CREATE TABLE` block from `schema.sql` in the Neon SQL Editor (the endpoint also self-heals via `CREATE TABLE IF NOT EXISTS`).

### 🎨 Event Recolor
- Right-click (desktop) or long-press 500 ms (mobile) any user-created calendar event to open a color picker
- Select from 10 preset swatches — change applies immediately and persists across sessions
- Google Calendar and Canvas events cannot be recolored

### 🗓 Date & Time Popovers Stay On Screen

Both pickers position themselves through the shared `useAnchoredPosition` hook
(`src/lib/useAnchoredPosition.js`) rather than doing their own arithmetic, because
they were getting it wrong in the same two ways.

- **Measured, not guessed.** `DatePicker` used a hardcoded 360 px estimate of its own height to decide whether to flip above the trigger. Near the top of the screen that produced a **negative** `top` and the calendar's first weeks were simply unreachable. The hook reads the real `offsetHeight` and re-reads it through a `ResizeObserver` as the content changes (the month grid gains a row, an error line appears)
- **Flips only when flipping helps.** Opening upward into an equally cramped space just moves the problem, so it flips only when below genuinely doesn't fit *and* above is roomier
- **Clamped on both axes.** Neither picker clamped horizontally, so a trigger near the right edge pushed a fixed-width popover past it. When neither side fits at all — a short viewport, or a phone with the on-screen keyboard up — the popover is clamped into view and given a `maxHeight` so it scrolls instead of spilling
- **`TimePicker` is now portaled.** It was `position: absolute` inside the trigger's wrapper, which meant any scrolling ancestor (the note editor's meta bar, modals) clipped it and it could only ever open downward, off the bottom of the screen. It now renders to `document.body` like `DatePicker`. Outside-click detection tests the popover *and* the trigger, so tapping the clock face no longer counts as clicking away
- Recalculates on scroll (captured on **any** ancestor, not just the window), on resize, and on `visualViewport` resize — which is what actually fires when a mobile keyboard opens

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
- `W` — start a **new note** (jumps to the Notes tab with a blank note focused). `N` was already taken by New Event, so notes use `W` for "write"
- `←` / `→` — step to the **previous / next period** on the calendar: a day in day view, a week in week view, a month in month view. Uses the same slide animation as swipe and trackpad scroll. Suppressed while a modal is open or while typing, and modifier combos (Alt+←, Shift+→) are left alone so browser-back and text selection still work
- `/` or `?` — show the keyboard shortcuts overlay (pressing the same key again closes it)
- `Ctrl+K` — open the search popup
- `F` — toggle the Focus Timer panel
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
- **Overdue work is pinned at the top** under its own red "Overdue" heading, ordered oldest-first (most late = most urgent), with each row showing how late it is (`Yesterday`, `4 days ago`, `Last week`)
  - Covers tasks, Canvas assignments, custom lists, and custom-list items. Past *events* are excluded — an event that already happened isn't overdue, it just happened
  - It gets its own group rather than sitting in the past days it belongs to: the agenda starts at Today, so those days would fall above the fold in reverse-urgency order
  - Completed, done, and hidden items stay gone
- Mobile-friendly — proper bottom padding for the tab bar
- Empty state shown when nothing is overdue or scheduled in the next 14 days

> **Fixed:** the "Today" header highlight compared against `toISOString()`, which is UTC — from ~8 PM Eastern it highlighted tomorrow instead.

### 📚 Exam Study-Plan Generator
- After saving any **Exam / Quiz** event, a compact follow-up modal appears: "Generate a study plan for this exam?"
- Configure the **number of sessions** (1–6, default 3) and **session length** (30 m – 2 h, default 1 h)
- Sessions are auto-scheduled using a **spaced-repetition spacing formula** — 1, 3, 5, 7, … days before the exam — with days that fall before today skipped silently
- Each session lands in a free **16:00–21:00 slot** on its target day, checked against all existing events and class schedule meetings; the least-conflicting slot is chosen as a fallback
- Created sessions are normal calendar events titled **"Study: \<exam title\>"** with a `studyPlanOf` back-reference to the exam event's ID
- **Linked cleanup** — deleting an exam event shows a toast offering to also delete its associated study sessions

### 🚨 Conflict Detection
- When creating or editing a **timed event** in the Event modal, the app automatically detects time overlaps with other events and class schedule meetings
- **Non-blocking** — an amber warning banner appears inline ("Overlaps with Physics 101, 2:00–3:15 PM") but never prevents saving
- Checks against all visible user events and every applicable class schedule meeting for that date and weekday
- Only fires for timed (non-all-day) events; all-day events are excluded

### 🎨 Accent Color Themes
Choose your preferred accent color from the **Settings** menu (the gear button at the bottom of the sidebar / Settings tab). Six palettes are available:
- **Luminae Blue** — the default; indistinguishable from the original brand
- **Violet**, **Emerald**, **Rose**, **Amber**, **Slate**

The accent is applied via a `data-accent` attribute on `<html>` and saved to `localStorage` (`lv-accent`). A before-paint inline script in `layout.js` restores it before the first render so there is never a flash of the wrong color. Both light and dark mode look polished with every accent.

### 📡 Offline Indicator
A subtle pill badge appears in the bottom-right corner when the app loses internet connectivity:
- Shows "Offline — changes will sync when you reconnect" with a WifiOff icon
- On reconnect it briefly shows "Back online" for 2 seconds, then auto-hides
- Uses `window` online/offline events + `navigator.onLine` for initial state
- Zero configuration; always mounted and self-managing

### 🧭 Onboarding Wizard
First-run modal wizard shown once to new users. Four steps:
1. **Welcome** — overview of all major features
2. **Google Calendar** — how to connect (or skip)
3. **Canvas LMS** — how to get an API token and connect (or skip)
4. **Quick tour** — annotated overview of Calendar, To-Do, Corvus AI, and Focus Timer

The wizard is skippable at any step, never shows again after dismissal, and can be re-triggered at any time via **Show tour** in the **Settings** menu (the gear button at the bottom of the sidebar / Settings tab). The localStorage flag `lv-onboarding-done` controls visibility.

### 🌦 Everything Else
- **Weather widget** — live temperature and rain forecast pulled from Open-Meteo
- **Dark / light mode** — toggle from the sidebar
- **Responsive design** — desktop (full sidebar), tablet (mini-sidebar with labels), mobile (bottom tab navigation)
- **Mobile To-Do tab** — stacked layout with To-Do / Canvas / Both toggle pills; shows priority tasks up top and Canvas assignments below
- **Mobile search** — full-screen tab (no overlay), query resets each time you enter the tab; desktop keeps the Ctrl+K popup
- **Mobile Settings tab** — exposes Google Calendar sync, Canvas connection, class schedule, sign-in, theme toggle, accent picker, and import/export on mobile
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
| **Rich text** | [Tiptap 3](https://tiptap.dev) — ProseMirror, used by the Notes tab |
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
- `src/lib/notes.test.js` — notes merge conflict resolution, trash retention, HTML→plain-text flattening, title/preview derivation, sorting, search matching, and shared-text escaping
- `src/lib/tombstones.test.js` — soft-delete merge behaviour: a delete beating a stale copy in either direction, an edit-after-delete winning, and manual refresh never resurrecting a local delete
- `src/lib/dateShift.test.js` — whole-day date arithmetic across DST boundaries, month/year rollover, and leap day
- `src/lib/localDate.test.js` — local-vs-UTC date derivation, including the exact evening-rollover case that made the badge count tomorrow's work
- `src/lib/glance.test.js` — the today summary shared by `/today`, the daily push, and the icon badge: overdue/due-today splitting, all-day event ordering, and Canvas assignment inclusion

The suite runs with `TZ=America/New_York` (pinned in `vitest.config.js`) so
timezone-sensitive logic is exercised deterministically rather than passing by
accident on a UTC runner.

Component tests live beside their components as `*.test.jsx` and opt into jsdom
with a `@vitest-environment jsdom` docblock (the default stays `node`, so the
pure-logic suite doesn't pay for a DOM):
- `src/components/LinkedNotes.test.jsx` — which notes surface on a linked item
- `src/components/NotesPanel.test.jsx` — search, filters, starring, and keyboard access
- `src/components/WeeklyRecap.test.jsx` — the weekly focus total, and that the card settles instead of re-rendering forever when a caller passes fresh array literals
- `src/components/AgendaView.test.jsx` — overdue work surfacing, its grouping and ordering, and that completed/hidden items stay gone
- `src/components/TimePicker.test.jsx` — 12/24-hour display derivation and prop-following, written before the refactor that removed the internal mirror so it had something to be measured against

---

## 🧹 Lint

```bash
npx eslint src --ext .js,.jsx
```

The React Compiler lint rules were adopted after most of this code was written,
so there is a standing backlog. It went from **79 errors to 29** by fixing what
were genuine defects — see the `fix(render)` and `fix(react)` commits.

The remaining 29 are **not** believed to be bugs, and are deliberately left
unsilenced rather than blanket-disabled, since a disable comment would make the
count read clean without making the code better:

- **25 × `react-hooks/set-state-in-effect`** — nearly all are "read `localStorage`
  / `navigator` / the DOM on mount, then `setState`". A lazy `useState`
  initializer would be the usual fix, but these are Client Components that Next.js
  still server-renders, so touching `localStorage` during the initializer throws
  on the server and mismatches on hydration. The effect is the correct pattern
  here; the rule is being conservative.
- **4 × TDZ / purity flags on deferred calls** — e.g. `pushToast` and
  `handleComplete` referenced above their own declaration. Safe as written
  (hoisted function declarations, or `const`s only read from an async
  continuation), but genuinely worth reordering if those files are refactored.

The derived-state cases in that group **have** now been converted individually
(`TimePicker`, `SearchPanel`, `DatePicker`) — see the `refactor(derived-state)`
commit. `TimePicker` in particular kept `hour`/`minute`/`period` in state and
copied the `value` prop back into them via an effect, so the state was never the
source of truth, only a lagging cache that disagreed with the prop for one render
on every change.

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

# Cron secret — required for the Sunday week-ahead digest cron job
# Also used by the every-minute reminder scheduler: GET /api/push/reminders
# The cron / external pinger calls both endpoints with this header:
#   Authorization: Bearer $CRON_SECRET
# Generate one: openssl rand -hex 32
# Add the same value to your Vercel project environment variables.
CRON_SECRET=your_cron_secret
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
│   │   │   ├── send/         # POST send push notification to all user subs
│   │   │   ├── digest/       # GET Sunday week-ahead push digest (cron-protected)
│   │   │   └── digest-pref/  # POST toggle digest_enabled for a subscription
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
│   ├── CustomListPanel.js            # Custom list switcher tabs + checklist body
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
│   ├── Toast.js                      # Toast notifications
│   ├── AccentPicker.js               # Accent color palette popover (sidebar + settings)
│   ├── OfflineIndicator.js           # Offline/back-online status pill badge
│   └── OnboardingWizard.js           # First-run 4-step wizard modal
│
└── lib/
    ├── customLists.js      # Custom list localStorage helpers + cloud-merge logic
    ├── appBadge.js         # PWA App Icon Badge API helpers (feature-detected)
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
| Custom lists & items | Browser `localStorage` (`lv-custom-lists`) + Neon DB per user (synced when signed in) |
| Event / calendar preferences | Browser `localStorage` |
| Search history | Browser `localStorage` (`lv-search-history`) |
| Focus timer settings & today's stats | Browser `localStorage` (`lv-focus`) |
| Study time sessions (per course) | Browser `localStorage` (`lv-study-sessions`) + Neon DB per user (synced when signed in) |
| Accent color preference | Browser `localStorage` (`lv-accent`) |
| Onboarding wizard completion | Browser `localStorage` (`lv-onboarding-done`) |
| Canvas seen-IDs (notification diff) | Browser `localStorage` (`lv-canvas-seen-ids`) |
| GPA credit-hours, grade overrides | Browser `localStorage` (`lv-gpa`) |
| Streak ledger | Browser `localStorage` (`lv-streak`) |
| Digest opt-in pref (local cache) | Browser `localStorage` (`lv-digest-enabled`) |
| Digest opt-in pref (canonical) | Neon DB — `push_subscriptions.digest_enabled` |
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
