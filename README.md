# Luminae Vigila

An all-purpose student planner. Calendar, tasks, notes, coursework and an assistant in
one interface, with your Google Calendar and Canvas LMS pulled into the same view.

It works fully offline and without an account — everything lives in the browser until
you decide otherwise. Signing in adds sync across devices; connecting Google Calendar
and Canvas are separate, explicit steps after that.

Live at **[luminae-vigila.vercel.app](https://luminae-vigila.vercel.app)**.

---

## Contents

- [Running it locally](#running-it-locally)
- [The calendar](#the-calendar)
- [Tasks](#tasks)
- [Classes and coursework](#classes-and-coursework)
- [Notes](#notes)
- [Corvus, the assistant](#corvus-the-assistant)
- [Google Calendar](#google-calendar)
- [Canvas LMS](#canvas-lms)
- [Notifications](#notifications)
- [Sync](#sync)
- [Import and export](#import-and-export)
- [Focus timer and study time](#focus-timer-and-study-time)
- [Search, agenda and shortcuts](#search-agenda-and-shortcuts)
- [Installing it](#installing-it)
- [Appearance](#appearance)
- [Keeping Neon usage down](#keeping-neon-usage-down)
- [Where data lives](#where-data-lives)
- [Development](#development)

This file is long on purpose. It records *why* things behave the way they do, not just
that they do, because most of the decisions below are ones I had to make twice.

---

## Running it locally

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

The app runs with no environment variables at all. Google Calendar sync, Canvas sync,
sign-in and notifications each need their own credentials.

### Environment variables

Create `.env.local` in the project root:

```env
# Groq — required for Corvus
GROQ_API_KEY=your_groq_api_key

# Optional model override. Groq retires models on their own schedule, and when the
# pinned one goes, every Corvus message fails at once. Set this to swap without a
# redeploy. GET /api/corvus lists what your key can actually reach.
# CORVUS_MODEL=openai/gpt-oss-120b

# Google OAuth — required for sign-in and for Google Calendar
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
# Production only; defaults to localhost in dev
# GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/google/callback

# Session signing key — required for sign-in. Any long random string.
# openssl rand -hex 32
SESSION_SECRET=your_session_secret

# Neon Postgres — required for sign-in, sync and per-user token storage
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Web Push (VAPID) — required for background notifications
# node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your@email.com

# Shared secret for the scheduled jobs: the reminder scanner, the daily glance and
# the Sunday digest. Callers send it as `Authorization: Bearer $CRON_SECRET`.
# openssl rand -hex 32 — and set the same value in Vercel.
CRON_SECRET=your_cron_secret
```

### Database setup

`schema.sql` is the source of truth for the database. Run it against Neon, or any
Postgres:

```bash
psql $DATABASE_URL -f schema.sql
```

It creates the account and credential tables (`users`, `google_accounts`,
`google_calendar_prefs`, `canvas_credentials`), the synced collections (`events`,
`todos`, `notes`, `note_images`, `custom_lists`, `class_schedule`, `event_prefs`,
`event_categories`, `todo_categories`, `study_sessions`), and the notification
plumbing (`push_subscriptions`, `sent_reminders`, `cron_pings`), plus per-user indexes.

Every statement is `CREATE TABLE IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS`, so
re-running the whole file against an existing database is safe, and a fresh database
needs no manual migration. The API routes self-heal on the same pattern — a missing
table is created on first use rather than returning an error.

### Getting the API keys

<details>
<summary><b>Groq</b> — Corvus</summary>

1. Sign up at [console.groq.com](https://console.groq.com).
2. Create an API key. The free tier is enough.
3. Set it as `GROQ_API_KEY`.

</details>

<details>
<summary><b>Google OAuth</b> — sign-in and Google Calendar</summary>

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials.
2. Create an OAuth 2.0 client of type *Web application*.
3. Add the redirect URIs:
   - `http://localhost:3000/api/google/callback`
   - `https://your-domain.vercel.app/api/google/callback`
4. Enable the Google Calendar API and the Google OAuth2 API in the Library.
5. Copy the client ID and secret into `.env.local`.

Publish the OAuth consent screen before relying on it — see
[why accounts keep disconnecting](#why-accounts-keep-disconnecting).

</details>

<details>
<summary><b>Canvas</b> — assignments and grades</summary>

Nothing to configure server-side; users connect Canvas themselves in the app.

1. In Canvas: Account → Settings → Approved Integrations.
2. New Access Token, name it, copy it.
3. In Luminae Vigila, open Canvas settings and paste the token plus your institution's
   Canvas URL.

There is also a token-free path: paste your personal Calendar Feed URL instead.

</details>

<details>
<summary><b>Neon</b> — database</summary>

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the connection string into `DATABASE_URL`.
3. Run `schema.sql`.

</details>

---

## The calendar

Week, month and day views, built on FullCalendar. Events carry a category, a colour,
a recurrence rule, a reminder, a location and free-text notes. Any event can be hidden
from view and brought back semi-transparently later.

Location is a real field rather than a line buried in notes, which is what makes
mapping it possible. No migration was needed for that: events are stored as JSONB.

### Reading a block without opening it

Most of the work here went into what a block can say in the space it has, because the
alternative — opening each one to find out — is what makes a calendar tiring to use.

**Notes fill the dead space in tall blocks.** When an event is long enough to leave
room under its title, its notes render underneath in a smaller, more transparent style.
The room number or the address is usually the part you actually wanted, and this saves
opening the event to read one line. Imported Google events use their `description` with
HTML stripped, since invite descriptions are often a wall of markup and rendering
remote HTML inside a 0.6rem block would be both unreadable and unsafe.

Whether notes appear is gated on the event's *duration*, not on its measured height.
The grid uses `slotDuration="00:30:00"` with `expandRows`, so pixels-per-minute
stretches to fill the viewport, and measuring each block would mean a layout read per
event on every one of FullCalendar's frequent re-renders. Duration only decides
*whether* notes are worth showing; `flex: 1` with `overflow: hidden` does the real
clipping, so an over-estimate degrades to a clean cut at the block's edge rather than
text spilling outside it. The thresholds are conservative — roughly 90 minutes before
the first line appears, more on mobile where narrow columns wrap the title further. A
single clipped half-line of grey text reads as a rendering bug; showing nothing reads
as a normal calendar. Linked task rows are subtracted from the budget, the whole thing
caps at six lines, and all-day events are skipped because their lane is a fixed short
row laid out horizontally.

**On a short event the name leads and the time trails**, which is the reverse of what
it used to be. A 30-minute block is one line tall, so its content is a race for
horizontal room, and the time is the half you can already read off the row the block
sits on. `9:00 AP C…` tells you nothing about which class it is; `AP Chemistry Lab`
tells you everything and you never needed the time.

Below about 124px of block width the time is dropped entirely and the name is allowed a
second line, which roughly doubles what a squeezed block can say. Two overlapping
events split a day column in half and a day column is a seventh of the week view, so
that is a real width rather than a hypothetical one. Both rules are container queries
rather than JavaScript, because what matters is the block's *rendered* width, which the
React renderer never sees. The time disappears rather than shrinking: a half-clipped
`9:0` reads as a bug, where an absent time reads as a design.

**Tall blocks clip by whole lines, never through one.** The title used to wrap freely
and get sliced by the block's edge, cutting horizontally through a row of letters — and
the bottom half of a row of glyphs reads as broken rendering, not as truncation. The
title now gets a `max-height` in whole line boxes, derived from duration using the same
proxy as the notes budget, so a long name simply stops at the end of a line.

That budget rounds *down* deliberately: rounding up buys a few more characters at the
cost of reintroducing the half-line it exists to prevent. It caps at three lines, past
which the block is a wall of text and the notes underneath — usually the room number —
get pushed out of a block that had room for them. The title never yields space; the
notes below it do, because the name is the thing you are scanning for. Anything still
overflowing fades out at the block's bottom edge instead of ending on a hard slice, and
the fade is measured from the block rather than from the text, so a title that fits is
never touched. Hovering any block shows the full name as a tooltip, whichever layout it
drew in.

### Opening an event

Tapping or long-pressing an event opens a detail view, on every device. Tapping used to
drop straight into the edit form, which is the wrong default: most taps are *what is
this, where is it, when does it end*, not *change it*. A form answers those badly — a
column of inputs reads as work to do rather than information to take in, and the thing
you wanted is one line buried among eight controls.

The detail view shows everything the edit form holds, laid out to be read: title,
category, the full when (collapsing a same-day range to `Wednesday, August 19 ·
2:00 – 3:15 PM`), recurrence in words (*Weekly on Mon, Wed, until Dec 10*), reminder,
location, notes, and any linked notes as buttons that jump to them. Actions sit in one
footer — Edit, Mark important, Hide, Delete behind a two-press confirm — plus a colour
picker, since mobile has no right-click and this is the only way to reach the recolour
that desktop gets from the calendar's context menu.

The footer offers **Edit this event** and **New event** side by side. The two are easy
to confuse once a popup is already open on top of an existing event, so both are named
explicitly rather than left to inference, and New event starts on the day you were
looking at rather than today.

On mobile a tap used only to lift the event to the front of its overlap column, because
opening the edit form on a stray tap was worse than opening nothing. The detail view
answers *what is this* better than a raised block did, so the tap goes there now and
the raise mechanism is gone. Long-press still works and still buzzes — a block squeezed
into a narrow overlap column is easier to long-press than to tap cleanly.

**A task chip on the calendar gets a menu instead.** An event has a lot to read; a task
has a title and a due date, and what you almost always want is to tick it off. So
clicking one opens three rows — Mark done, Edit task, Delete task — anchored to the
chip, with the calendar still readable behind it. Two things follow. It no longer yanks
the nav across to the To-Do tab, because the point of clicking a task where it sits is
to deal with it *without* leaving the calendar. And Mark done ticks off the occurrence
you clicked rather than the series, since a repeating task records completion per date.
Delete removes the whole task, series included — the same thing the task list's trash
icon does; dropping a single occurrence is a different operation and belongs in the
form. Right-click on a task chip opens that same menu. It used to open the recolour
popover, because a task chip has no `source` and so passed for a user event, but that
was always a dead end: a task takes its colour from its category, and the per-event
override it wrote is a preference the task list never reads.

**Imported events get the same treatment.** Google and both Canvas feeds used to answer
a tap with a toast, which can only ever be a line of text — yet those are precisely the
events carrying a location and a description worth reading. They now open the same
view, minus Edit and Delete since they belong to Google and Canvas, plus *Open in
Canvas* where a deep link exists. A source badge marks them read-only, suppressed when
the heading already says the same thing.

Two details worth knowing. Both event shapes are handled: a tap from the calendar
passes a FullCalendar `EventApi` where `start` is a `Date`, while search results and
the agenda pass the stored object where it is an ISO string, so `normalizeEvent`
flattens both and no branch below has to care. And all-day events do not render a day
early: FullCalendar stores an all-day end as the *exclusive* next midnight, and a bare
`YYYY-MM-DD` parses as UTC midnight, so subtracting a day and reading local components
would shift the date for anyone west of UTC. Date-only values are anchored to local
noon, which survives the arithmetic in either direction.

For a while, clicking an event opened the *new event* form instead. The now-indicator
was the cause: FullCalendar gives its container `left/right/top/bottom: 0`, making it a
full-column overlay, so raising that container's `z-index` to keep the red line legible
laid a transparent sheet over the entire day. Every click landed on the sheet,
FullCalendar read it as a click on empty time, and the create form opened. The fix is
`pointer-events: none` on the overlay rather than lowering the z-index, because the
line genuinely does need to paint above events, and nothing in there is interactive.

### Overlaps and flagging one thing

When events start at the same time the shorter one is indented; same-duration events
get a stable stagger so both are always visible.

Any event can be **flagged as important** from its detail view — the one thing on a
crowded day that must not be missed. It gets an amber ring, a small star beside its
title, and it breaks a few pixels out of its column to sit on top of whatever it
overlaps. The events underneath keep their own width, so they stay readable rather than
being covered.

The flag is stored in `eventPrefs` alongside hide and recolour, keyed by event id, so
it works for *every* source: a Google invite, a Canvas due date and a class period can
all be flagged even though none of them are yours to edit, and the flag rides the
existing sync and backup. The break-out is negative margin on FullCalendar's harness
rather than a wider column — FullCalendar has already packed each overlapping cluster
into columns, and taking width *from* the neighbours would be the ordinary layout doing
what it always does; overhanging them is what makes the block read as lifted rather
than merely bigger. The ring lives on the event and so appears in every view, while the
break-out lives on the harness and so exists only in the time grid, which is the only
place events actually collide. Toggling it leaves the popup open, unlike the actions
around it: it is a toggle, and closing would hide the badge that confirms it took.

### Recurring events

Clicking a repeating event asks whether to edit this occurrence or the whole series.
Choosing the series reopens the full form pre-populated with the original recurrence
config — type, days, end date — and the series start date, so every occurrence is
regenerated. Deleting offers the same choice.

**Turning Repeats on for an event that already exists now actually creates the
repeats.** It used to look like a slow save: you would tick Repeats, save, and the
upcoming weeks stayed empty, only filling in later if the series happened to be rebuilt
by an *edit all in series* save. Nothing was slow. An event that does not recur yet has
no series to choose a scope for, so the save arrives as a single-instance edit — and
that path replaced the edited event with the *first* occurrence of the expansion and
dropped the rest. Stored events are the only copy, since nothing re-expands a
recurrence rule at load or render time, so the later occurrences were never written
anywhere. The single-instance path now splices in the whole expansion, which for an
ordinary non-repeating save is one event and the same swap it always was.

### All-day and multi-day events

The event form has always had an all-day toggle with a start and end date, and
FullCalendar has always drawn the bar across the week correctly. But nothing else in
the app understood a *span* — everything looked only at `start` — and no gesture could
create one.

So a multi-day event vanished the moment it began. The agenda filed events under
`start.slice(0, 10)` and skipped anything starting before today; the glance behind
`/today` and the daily push asked `dateStrOf(e.start) === dateStr`. A competition
running Monday to Wednesday appeared on Monday, was absent on Tuesday and Wednesday,
and disappeared entirely once Monday had passed. The one kind of event you most want a
planner to keep telling you about was the one it forgot first.

[`lib/eventSpan.js`](src/lib/eventSpan.js) answers the question those places actually
have — which days does this cover? The agenda now lists a spanning event on every day
it covers, labelled *Day 2 of 3*, and keeps listing one already under way; on days
after the first it sorts to the top, since a multi-day event is context for the day
rather than something that happens at 9am on it. The glance includes an in-progress
event and says which day of it today is. A single-day event is untouched, with no
*Day 1 of 1* on every row to serve the few that span.

The two end-date conventions are opposite, and that is the whole difficulty. An all-day
end is **exclusive** — FullCalendar's convention, and what the form writes, so a single
day on the 4th is `04 → 05` and the last covered day is the day before `end`. A timed
end is **inclusive**: 10pm Monday to 2am Tuesday genuinely happens on both days. They
are separate branches rather than one clever expression, because getting them backwards
is exactly the bug. A corrupt end is capped at a year rather than walked.

**Drag across days or hours to create one.** `selectable` was already enabled but
nothing consumed the selection, so dragging drew a highlight and threw it away. A drag
now opens the form spanning exactly what was dragged, showing the *inclusive* last day
— reporting FullCalendar's exclusive end verbatim would claim a day more than you
selected — and a timed drag takes its end time from the drag rather than defaulting to
an hour.

Only real drags count. FullCalendar fires `select` for a plain click too, and a click
already means something in both view families: navigate to this day in month view, add
a task in the all-day lane, new event at this slot in the time grid. A single-cell or
single-slot selection is that click, so it falls through untouched. The slot size is
one constant shared by `slotDuration` and the drag test, so the two cannot drift apart
and start turning clicks into events.

ICS export already did the right thing here: `VALUE=DATE` with the exclusive `DTEND`
that iCalendar requires.

### Completed tasks stay on the calendar

A task you ticked off used to disappear from the calendar entirely. That makes the
calendar a poor record of your term — a week you actually got through empties out and
reads as *nothing was ever due here*, which is the opposite of what happened — and
there was no way to check from the calendar whether you had already handled the thing
due Tuesday.

Completed tasks now stay in the Tasks row where they were, struck through and faded,
returning to near-full opacity on hover so you can still read one. Only the text is
struck through, not the priority meter or the source badge, because a line drawn across
a coloured dot reads as a rendering glitch rather than as *done*. The fade is on the
whole block, so the background colour recedes too and not just the label, with a light
desaturation that keeps a finished red high-priority task from still shouting.

A recurring task is done or not as a whole here, since completion is one flag on the
task rather than per-occurrence, so every generated occurrence shows the same state.

This is the calendar only. The Tasks tab, the class coursework list and `/today` all
collapse or hide completed work: those are working lists, where the point is what is
left and a growing pile of struck-through rows is exactly the clutter they exist to
avoid. The calendar is a record, so it keeps them. Canvas assignments marked done and
checked-off custom-list items still drop off — they are not tasks in the app's own
vocabulary, and a term of finished Canvas assignments is a lot of grey text.

### The current-time line

A thin red line with a dot at the left edge, drawn above events.

It used to be a soft red at 0.9 opacity, which disappeared into red and pink events.
Choosing a different hue cannot fix that, because the event palette covers nearly the
whole wheel — red, rose, amber, violet, teal — so no single colour contrasts with all
of them. The separation comes from **luminance** instead: a contrasting glow behind a
saturated core, which reads against a dark event and a light one alike. Red stays
because it is the universal *now* convention, and the glow flips dark in dark mode
where the surfaces beneath it are dark.

The glow is blurred and spread rather than offset. Hard `0 -1px` / `0 1px` shadows did
separate the line, but two opaque edges either side of a 2px core read as three stacked
lines — a visible outline rather than a line that quietly stays readable. With the blur
carrying the contrast the core is back down to 1.5px, and the dot dropped the second
red ring it had, which on an 8px circle just looked furry. `z-index` is asserted rather
than inherited, so the line can never be painted underneath an event harness.

### Colour

Right-click on desktop, or long-press for 500ms on mobile, to recolour a user-created
event. Google and Canvas events cannot be recoloured directly, only overridden.

The colour control is the same grid everywhere — [`ColorSwatches.js`](src/components/ColorSwatches.js),
which also owns the palette so the three entry points cannot drift apart. It replaced
two pickers that were both poor on a phone. The detail view used a bare
`<input type="color">`, which hands the whole job to the OS colour wheel: it paints as
a black chip against the app's own palette, looks nothing like the rest of the chrome,
and answers *which of my ten colours is this* with a gradient square. The event modal's
own swatch row was 26px circles in a wrap, a tap target well under half what a thumb
needs. The cells are now a `minmax(44px, 1fr)` grid where the whole padded cell is the
target rather than the dot inside it, which buys the touch size without making the dots
cartoonish on a desktop. Selection reads as a ring *and* a tick, because a ring alone
is subtle in a ten-colour grid.

Colour is part of creating an event, not just editing one. The row used to be gated on
editing, and the calendar's right-click recolour is disabled on touch, so on a phone
there was no way to colour a new event at all.

An event the app stores owns its own `color` field, and that is what the modal's picker
edits, so the choice is saved with the event like every other field. `eventPrefs`
overrides remain the mechanism for imported Google and Canvas events, which have
nowhere to keep a colour of their own, and for the calendar's right-click popover. The
two used to be able to disagree — an override wins at render time, so editing the
stored colour underneath a stale override looked like it did nothing. Saving the modal
now clears any override on that event, handing authority back to the event itself.

`null` means *follow the category*, and that distinction matters. An untouched event
stores its category's colour, so seeding the picker with that value verbatim would
quietly promote it to a deliberate override, and then changing the category would keep
the old hue. The form tracks an explicit pick separately, which is why changing the
category still recolours an event you never hand-coloured, and stops doing so the
moment you do.

### Focused day, and remembering where you were

A toolbar button on desktop trims the time grid to 7am–10pm instead of all 24 hours,
and flips back. The full grid spends a third of its height on hours you are asleep for,
which squeezes the part of the day you actually have events in; focused mode gives
those hours the whole viewport, and because `expandRows` stretches rows to fill the
height, the same events simply get more room rather than being re-laid out.

The button is labelled with what it will do rather than what is on — *Focus 7–10* when
the full grid is showing, *Full 24 h* when it is not — so it reads correctly whichever
way round it is. It is desktop-only: on mobile the toolbar is already three view
buttons wide in a phone-width row, and a fourth made it a cramped strip of
abbreviations. Anything starting before 7am or ending after 10pm is outside the visible
window in this mode.

Leaving the calendar for Notes or Tasks and coming back reopens the same view on the
same dates. It used to reset to today in the default view, because the calendar is
unmounted whenever you switch tabs, so everything it was showing was thrown away. This
survives a page reload too.

The view and the date are remembered on different terms, because they are different
kinds of thing. The **view** never expires: if you work in month view, you want month
view tomorrow as well, and that is a preference. The **date** expires after six hours —
it is just where you happened to be looking, and restoring it across a tab switch is
the entire point, while restoring it when you open the app the next morning would land
you on a stale week for no reason. Six hours covers an evening's planning without
surviving a night's sleep.

An explicit jump wins over both, since search results and the mini-month pass a target
date. In month view the remembered date is the view's `currentStart` rather than the
first visible cell, because month grids usually open with a few days of the previous
month showing and saving one of those would reopen on the wrong month. A blocked or
malformed `localStorage` — private mode, embedded webviews — degrades to *no
preference* rather than throwing on startup.

### Locations open in Maps

Any class or event with a location gets a map button on the same line as the address.
The two belong together, and a full-width button underneath pushed everything after it
down for something one tap wide. It reads *Maps* on screen to fit beside the text,
while the full "Open in Google Maps" stays as its tooltip and accessible name. It
appears on the event and class detail views, beside the Location input in both edit
forms, and on the location line of every agenda row — which is a link, with the row's
own click suppressed so tapping the address does not also open the event.

The interesting part is knowing when *not* to offer a map. Locations here are free text
from three sources — you, Google, Canvas — so they include `Room 204, Tech Hall`,
`Zoom`, `https://meet.google.com/abc-defg-hij` and `TBD`. Sending "Zoom" to Google Maps
returns the company's head office in San Jose: a confidently wrong pin, which is worse
than no button at all. So [`lib/maps.js`](src/lib/maps.js) classifies the string first:

| Kind | Example | What you get |
| --- | --- | --- |
| `place` | `Room 204, Tech Hall` | Open in Google Maps |
| `online` | `Zoom`, `Teams`, `meet.google.com/…` | Plain text, plus Join meeting if a link is in there |
| `link` | `https://example.com/lecture` | Open link |
| `empty` | `TBD`, `n/a`, `—`, blank | No location row at all |

Online beats link, so `Zoom — https://zoom.us/j/1` is a meeting and the join link is
the useful action rather than a map. A room-level string still resolves usefully, since
Maps falls back to the building when it cannot pin the room. The link uses the
documented `?api=1&query=` search form, which hands off to the installed Maps app on
mobile instead of opening the web map in a browser tab. `www.example.com` gets the
missing scheme added, and a street number like `1600 Amphitheatre Parkway` is not
mistaken for a URL.

### Conflicts and study plans

Creating or editing a timed event checks for overlaps against your visible events and
every applicable class meeting for that weekday, and shows an inline amber banner —
*Overlaps with Physics 101, 2:00–3:15 PM*. It never blocks saving. All-day events are
excluded.

Saving an event in the Exam or Quiz category offers to generate a study plan: one to
six sessions, 30 minutes to two hours each, spaced 1, 3, 5, 7… days before the exam
with days already past skipped silently. Each session lands in a free 16:00–21:00 slot
on its target day, checked against existing events and class meetings, falling back to
the least-conflicting slot. Sessions are ordinary calendar events titled
*Study: &lt;exam title&gt;* with a `studyPlanOf` back-reference, and deleting the exam
offers to delete them too.

---

## Tasks

Tasks carry a priority, a category, a due date, an optional recurrence, a reminder and
up to twenty subtasks. They appear in the sidebar panel, on their own tab, in the
agenda, and as chips on the calendar.

### The list is grouped by how soon, not just by when

The grouped list used to jump straight from **Today** to **This Week**, and a week is a
long time. In a normal school week that one heading collected most of the list, so the
thing due tomorrow sat in the same undifferentiated pile as the thing due Friday: the
list said *when* without ever saying *how soon*.

**Upcoming** splits the near half out — today + 1 through today + 3, the horizon you
can still do something about — and **This Week** keeps the rest of the seven days. The
full order is Overdue, Today, Upcoming, This Week, Next 2 Weeks, Further Out, No Date,
and each heading appears only when it has something in it.

The accent fades as the deadline recedes: red, amber, the theme accent, a muted mix of
the accent and grey, then plain grey, so the top of the list reads as urgent without
every heading shouting. Only *Upcoming* states its range (`next 3 days`), because
*Upcoming* and *This Week* both mean soon and the boundary between them is otherwise a
guess. The headings are a partition, so each task is bucketed in a single pass rather
than re-filtered once per heading, and every date lands in exactly one bucket by
construction — a task cannot fall between two headings and vanish.

Today means today where you are. Both the panel's own *today* and the bucket boundaries
were built on `toISOString`, which converts to UTC first, so from about 8pm Eastern
onward the panel was a day ahead: work due tomorrow appeared under Today, and work due
today dropped into Overdue. It was one shared string, so the headings, the row badges
and the Today filter chip were all wrong together every evening, which is what made it
look like the two headings had been merged. Both now go through the `localDate` helpers
the rest of the app uses, and the bucket bounds take today as a parameter rather than
reading the clock, so the list always agrees with the date the panel was handed.

### Priority you can see without reading the row

Priority was an 8px dot at the right edge, doing almost nothing. It borrowed the
colours the dates already use — overdue is red and due-today is amber, so a
high-priority dot sat beside a red *Overdue* badge and an amber *due in 2 days* chip,
and in a column of red and amber one more red dot is not a signal. Low was drawn in the
border colour, which is also what a task with *no* priority got, so the one level you
set to mean *this can wait* looked identical to never having answered the question. And
colour was the only channel, which is a problem for anyone who does not separate those
reds and ambers and a mild one for everybody scanning quickly.

The dot is now a three-bar meter — one bar for Low, two for Medium, three for High — in
the same place on every row, so priority reads by scanning straight down the right edge
rather than by stopping at each task. The unfilled bars stay faintly visible: they are
what makes one-of-three read as *low* rather than as a stray mark.

High and Low also get the word, as a chip at the front of the badge row. Medium does
not, because it is the default every new task starts with and labelling it would put a
chip on practically every row until the label stopped meaning anything; the meter still
shows it. High priority additionally gets a red rail down the left edge — the meter
tells you the level once you are looking at a row, and the rail is what makes you look.
Only High gets one, since a rail on every row is a striped list rather than an
emphasis. It is absolutely positioned, so it costs no width and rows stay aligned
whatever their priority, and it drops away when the task is completed.

A task with no priority still shows nothing. Tasks that predate the field, and Canvas
assignments, never had one, and drawing them as Low would be inventing an answer nobody
gave. New tasks default to Medium, which is a real answer, and does show.

Priority breaks ties in the sort, and only ties. Two things due the same day are under
the same heading anyway, so ordering them by priority costs nothing and puts the one
that matters on top, while letting it outrank the date would scatter the deadlines —
which is the list's actual job. A manual drag still wins over both: `sortOrder` is an
explicit instruction.

The three levels are defined once, in [`lib/priority.js`](src/lib/priority.js). They
had drifted, with the add/edit modal painting Low slate, the agenda painting it green
and the task list painting it grey. The agenda still marks only High and Medium — it is
a day at a time, where the point is what is coming rather than triage — but it uses the
same colours as everywhere else.

### Subtasks, reordering, swiping and undo

Any task takes up to twenty subtasks, added in the Add/Edit modal and checked off
individually. A progress chip on the row shows `2/5 steps`; clicking it expands the
checklist inline.

Grab the grip handle — it appears on hover, desktop only — to drag tasks into any
order. Order persists in a `sortOrder` field and survives refreshes and sync; tasks
without one fall back to date sorting.

On touch, swipe right on a task to complete it and left to delete it, with a red trash
background as feedback. The axis locks after 6px of movement so horizontal swipes do
not fight vertical scrolling, and a 72px threshold prevents accidental triggers, with
items snapping back if the swipe falls short.

Deleting a task or a calendar event raises a toast for about six seconds with an Undo
button that fully restores the item, subtasks and synced state included. The deletion
is soft: the item leaves the view immediately, but todo/event unlinking is deferred
until the undo window closes, so a full restore is always possible. It works for single
events and for *delete all in series*.

### Escape keeps what you typed

Every small text field here already committed on blur — clicking away from a half-typed
step added it — but Escape threw the draft out, so the same typing survived or vanished
depending on which way you happened to leave the field. Escape now commits everywhere:
the inline step composer on a task row, the step field and the rename-a-step field in
the Add/Edit modal, and the item and subtask renames on custom lists.

In the modal it was losing more than the step. Escape there did not only discard the
draft; nothing stopped it reaching the modal's own Escape handler, so it closed the
entire form, and a modal that closes without saving takes the title, the date, the
category and every other unsaved edit with it. Escape in a half-typed step field now
adds the step and stays put. An empty field still closes the modal, because there is
nothing to lose and Escape means *close* everywhere else in the app.

The asymmetry is deliberate. Escape-as-cancel is the usual convention, but the cost
here is not symmetrical: a step added by accident is one click to delete, and a step
lost has no undo at all. When the two exits disagreed, the destructive one was the one
you had to know about. Committing goes through blur rather than duplicating the add, so
there is still exactly one code path that appends a step — otherwise an Escape followed
by the browser's own blur could add the same step twice.

### Custom lists

Lightweight standalone checklists alongside the main task list, for groceries, packing,
wish lists and anything that does not need priorities or categories. A tab row at the
top of the To-Do area switches between **My Tasks** and any list you have created, on
both the desktop panel and the mobile tab.

Creating one opens a sheet: pick a Lucide icon, an accent colour from the shared swatch
palette, and a name. The colour tints the active tab indicator, the item checkboxes and
the header badge, and is editable later from the pencil in the list header. Lists
created before icons existed render their stored emoji as a text fallback.

Each item has a checkbox and text, and optionally a due date and a short note, both
reached through the `⋯` menu on the row. Double-clicking an unchecked item renames it
inline. Items take nested subtasks, which are independent of the parent — checking
every subtask does not auto-check the item. The `⋯` menu renders in a `position: fixed`
layer anchored to the button's viewport coordinates, so it escapes `overflow: hidden`
containers on both desktop and mobile, and closes on outside click or Escape.

A list can carry its own due date, shown as a pill in the header with an inline clear.
List-level and unchecked-item due dates both appear as all-day markers in the calendar's
Tasks row and in the agenda, tinted with the list colour, and clicking one navigates
straight to that list. Both are additive fields, so neither needed a schema change.

Checking the last top-level item fires a confetti burst positioned at the list name,
once, on the incomplete-to-complete transition rather than on every render, and the
list's tab shows a faded strikethrough with a check mark. Both clear if anything is
unchecked again. There is also drag-to-reorder by grip handle on desktop, the same
swipe gestures as the main task list on touch, a per-list *Clear checked*, and a `×` on
each tab that opens the same confirm dialog as the in-list delete. My Tasks has no `×`.

---

## Classes and coursework

There used to be two tabs asking almost the same question. **Courses** was a Canvas
view: assignments grouped by Canvas course, hidden entirely without a token. **My
Classes** was a schedule view: the classes you type in by hand, which expand into
calendar meetings, carry cancellations and exam blocks, and derive the `class:` task
categories.

Two tabs listing overlapping things under different names is a question the app was
asking you rather than answering. So there is one tab. It looks different depending on
whether Canvas is connected — which is the actual difference — rather than being two
places to look. On mobile it is labelled **Classes**, because every tab in the bottom
bar is `flex: 1` and gets around 45px, and the full name would wrap onto its icon.

The tab is one scrolling page: a coursework month at the top, every deadline from every
class on one grid, with the detail of each class below it.

### The coursework month

The cards answer *what is the state of Physics?*. They cannot answer the question that
crosses classes — *what is coming at me, and when?* — because finding out that three
things land on Thursday means opening five cards and holding five lists in your head.
So the grid is what the tab opens on, and the cards sit underneath it on the same page
rather than behind a switch: *Thursday is brutal* is followed immediately by *what is
all that?*, and a tab switch would make that a round trip.

The grid shows exams, Canvas assignments and your own class tasks, colour-coded by
class. An assignment or exam chip clicks through to the detail view it already had — it
is a view, not a fourth place coursework can be edited. A task chip opens a small menu
instead: done, edit, delete. Clicking one used to go straight to the task editor, which
is the wrong default for the same reason it was wrong for events: most clicks on a task
are *done*, and that was the one thing the form made expensive, while delete was not
reachable from the grid at all. The menu grows out of the chip you clicked rather than
opening at the pointer, which on a dense grid is what connects it to the right task.
Deleting an assignment here would mean deleting it in Canvas, which this tab has no
business doing, so assignments keep their old behaviour.

Ordinary class meetings are deliberately absent. A calendar of every lecture is the
Calendar tab; here forty recurring meetings would bury the four things that actually
have deadlines.

**A strip under the grid shows the week ahead.** At rest it is *Coming up*: the next
seven days, each labelled Today, Tomorrow or `Fri, Mar 6`, with only the days that
actually have something on them, because a week with work on two days should be two
rows rather than seven with five apologies. A single day was too narrow a default under
a grid showing a whole month — *nothing due today* is a poor answer when the useful one
is that two things land tomorrow. Overdue work leads the strip, above everything
upcoming, because it has no day left to belong to; filing it under the date it *was*
due puts it behind you on a list about what is ahead, which is exactly where it gets
forgotten. An empty week says when the next thing lands — *Nothing due in the next 7
days. Next up Fri, Mar 20* — because without that, a clear week reads as *no work
exists* when the truth is it is a fortnight out.

Clicking a day floats a panel above the grid, anchored to its own cell, listing
everything due that day, and narrows the strip below to the same day so the two never
disagree. The panel exists because the strip alone was not enough: on anything short of
a tall desktop it is below the fold, so clicking Thursday looked like it did nothing at
all, and on a phone it is worse, where the cells are colour dots and the strip is the
only thing that names them. Tasks and assignments can be ticked off from the panel, the
strip or the grid. An exam has no checkbox: it is not something you complete, it
happens to you. Clicking the day again, closing the panel or hitting *Coming up* widens
back out, and the panel is dismissed when the month changes under it, since it belongs
to a cell that just left.

The month slides rather than snapping. Changing months used to repaint on the same
frame as the click, which reads as a flicker rather than a movement — nothing told you
whether you had gone forwards or back. The grid now leaves in the direction you pushed
it, the content swaps at the midpoint while it is faded out, and the new month arrives
from the other side. Only the grid moves; the nav and the weekday header are fixed
furniture, and sliding those would make the whole tab lurch. It reuses the calendar
tab's own `.cal-nav-*` animations and timings verbatim, 140ms out and 260ms in, because
this is the same gesture in two places and should not feel like two different apps.

Swipe, trackpad and the arrow keys all page the month: a horizontal drag of at least
60px, a horizontal wheel flick, or `←` / `→`. A mostly-vertical drag is left alone so
the tab can still scroll, the trackpad is rate-limited so one momentum flick does not
skip three months, and the arrow keys stand down for modifier combos, for any focused
text field, and while a modal is open above the tab — otherwise typing a class name
would page the calendar underneath the form.

Some smaller rules that the grid depends on:

- Outstanding work sits above finished work in a cell. A cell fits three chips, and
  items arrived in the order they were built, so a Thursday with two things ticked off
  and three still due could show two struck-through chips and hide one of the three
  under *+1 more*. The cell's job is to say what is **left**, so the thing it truncates
  should be the thing you have already dealt with. Exams are never done, so they keep
  their place among the outstanding ones. It sorts rather than filters, because a day
  whose work is all done should still show it.
- Each day carries a `done / total` counter beside the date, so a glance says how much
  of a day is behind you rather than only how much landed on it. It turns green when
  the day is clear, and the tooltip spells it out in words. Since the cell truncates at
  three chips, on a busy day this is the only complete count you get. **Exams are left
  out of both halves**: an exam is not something you tick off, so counting it as
  outstanding would leave a day with one exam and one finished assignment reading `1/2`
  for ever, and a week of exams would look like a week of unfinished work. The exam is
  already on the day as a chip, in the red overdue dot and in the workload tint, so
  leaving it out of a *work* counter loses no warning. A day with nothing tickable on
  it shows no counter at all.
- Overdue is a red dot on the day and a red mark on the chip. Completed work is never
  overdue, however old.
- A count of what is still outstanding across the visible month sits above the grid —
  the number that says whether this month is calm or brutal, which no single cell can.
- On a phone the cells are too small for text, so a day collapses to coloured dots and
  the strip below does the reading.
- Paging to April and clicking a day does not snap back to today, and midnight does not
  yank your selected day out from under you. **Today** is a button for when you want it.

**Drag a task to another day.** Grab its chip and drop it on a date: the due date moves
and nothing else does. A reminder is stored as an *offset* from the due date, so it
follows on its own and rewriting it would double-apply the move. Dropping a task back
on its own day is a no-op rather than an edit, so it does not stamp `updatedAt` and
wake the sync for nothing.

Only your own tasks drag. A Canvas assignment's due date belongs to Canvas, and moving
it here would either be a lie the next sync overwrites or a silent local fork of
someone else's record. An exam is excluded for a subtler reason: an exam block is a
*transform of a class period*, so its date has to be a day the class actually meets.
Dropping one on a Sunday would file an exam against a meeting that does not exist —
which the model carries, so it would quietly vanish from the calendar rather than
error. Moving an exam is the class form's job, where the meeting days are visible.
Dragging is desktop-only; on a phone, tapping through to the editor is the path.

**Workload shading** tints a day by how much is *outstanding* on it, so you can see
that Thursday is four big things and not four small ones. An exam weighs 3 — it is what
you reorganise a week around, and it carries revision that appears nowhere as work of
its own — and an assignment counts double when it is in the top third of its own course
by points. Relative to the course, because a 40-point essay is a big deal in a
200-point seminar and a rounding error in a 2,000-point lecture course; courses that
never publish points simply never get the boost, and fewer than three pointed
assignments is not enough to say what *large* looks like.

The thresholds are absolute rather than percentiles of your term. A relative scale
would repaint every cell as you page between months — a Tuesday going from heavy to
light because a worse month came into view — and a calendar whose colours mean
something different on each screen is worse than one only roughly calibrated. Finishing
the work clears the shading, and the day's tooltip says *Heavy day* in words so the
tint is never the only carrier.

The grid is month-only on purpose. A week view of coursework is what the cards' *This
week* filter already is, and a day view of it is `/today`. The week filter sits over the
cards rather than the month: narrowing a month view to one week is less a filter than a
lie about the month.

It is hand-rolled rather than a FullCalendar month view. FullCalendar is already in the
bundle, but this is a read-only grid of deadlines with its own chip design, overdue
treatment and day strip, and re-theming a general calendar engine into that shape is
more code than drawing seven columns — and it would pull the tab into FullCalendar's
styling surface.

**Class colour is meant to be read at a glance.** Each chip carries a solid 3px spine
in its class colour over a wash of it, each class card has a 4px spine down its full
height and a washed header, and a colour key above the grid names every class with
something on it. A grid coded by colour with no key told you Thursday was two blues and
a green without saying what green was. The key lists only classes that actually appear,
since a key to absent colours is just a second class list.

One deliberate limit: colour identifies in blocks, never in text. Half the palette —
lime, amber, cyan — fails contrast as small coloured text on a light background, so
spines, washes and swatches carry the colour while every label stays at full contrast.
A course whose name you cannot read is a worse outcome than one whose name is not
tinted.

Dates are local `YYYY-MM-DD` throughout. `toISOString().slice(0, 10)` — how the mini
month navigator does it — yields the UTC day, so an 11pm deadline in New York files
itself on tomorrow.

### The class cards

Below the month, under a **Your classes** heading. All start collapsed: when the cards
*were* the tab, opening the first one stopped it reading as a wall of closed rows, but
they now sit under a grid that already fills the screen and an open card would just
push the other five out of reach.

One expandable card per class, holding:

- **When and where it meets** — the day pattern, the hours, the term dates and the
  room. A real room links to Maps, a Zoom class offers its join link, because the app
  already knows the difference.
- **Its coursework** — every task filed under the class, soonest first, with completed
  ones behind a count. Tick one off in place, or click through to the real editor.
  *+ Add task* opens the task form already filed under that class.
- **Its Canvas assignments**, when the class is linked to a Canvas course, with bulk
  select and mark-done and the detail view on any row.
- **What is coming up — exams only.** This used to list the next few meetings with
  exams among them, on the reasoning that an exam *is* the period and splitting them
  would mean reading two lists to find out what happens next Tuesday. In practice it
  buried the exams: a class that meets three times a week filled all six rows with the
  Mon/Wed/Fri you can already recite, and the one row that actually changes your week
  scrolled off the end. The recurring schedule is stated above it and the card header
  still says when the next meeting is, so the periods were never the news here. A class
  with no exams scheduled says so.
- **Its notes**, the reverse of a note's *link to*.
- **Its grade**, when Canvas-linked: what you have earned so far, and what you finish at
  if the rate holds.
- **Study time** in the last seven days, when Canvas-linked. The focus timer tags
  sessions with a Canvas course id, so an unlinked class has nothing to show.
- **Its reminder rules**, described below.

With Canvas connected the tab also grows the roll-ups the old Courses tab carried: the
GPA card, the Study Time card, sync and Canvas settings buttons, and bulk mark-done.
Without Canvas, none of that renders and the tab is just your classes.

A Canvas course with no class entry still gets a card. This is the one way folding two
tabs into one could quietly lose something — a course you never typed in as a class
would simply have vanished with the old tab. Instead it appears marked *From Canvas*,
showing its assignments and grade, with **Add meeting times** to turn it into a real
class, which opens the ordinary class form pre-filled with the name and the Canvas
link. A class that claims a Canvas course absorbs it rather than appearing twice: the
link is what says *these are the same thing*.

The cards are expandable rather than a master/detail split, which matches the panels
either side of them and collapses to a phone without needing a second layout.

*Everything / This week* filters the **work** — tasks and assignments. Meetings and
grades are left alone, since "your grade in this class" does not mean "your grade this
week", and when the filter hides everything the card says how much is outstanding
overall rather than claiming the class is clear. A disabled class is listed rather than
hidden: it is still yours and it still holds its notes and history, it just sorts below
the classes you are actually taking.

The task rows here are deliberately thinner than the To-Do panel's — no drag handle, no
swipe, no inline composer — because a second full-featured row would be a second row to
keep in step. The exception is steps, which unfurl in place. A task with subtasks is
the one kind whose row does not say enough on its own: *Term paper* tells you nothing
about how much of it is left, and the only way to find out was to open the editor over
the whole panel and close it again. So the row carries a `1/3 steps` chip, clicking it
unfurls the checklist underneath, and the steps tick off from there, with the editor
one click further in as *Edit task →* at the foot of the list — the same trade the
calendar chips make. A task with no steps still jumps straight to the editor, because
there is nothing to unfurl. Steps read through `visibleSubtasks`, so a deleted one's
tombstone never inflates the count.

Two fixes fell out of building this tab. The note-link picker labelled every class with
the literal word *Class*, because it read `name` and `title`, fields a class entry has
never had; the field is `courseName`. And the grade arithmetic existed in three places
and had begun to disagree — the Grades rail averaged each assignment's *percentage*
while the GPA card summed *points*, which weights a 5-point warm-up like a 200-point
final. Both now go through [`lib/grades.js`](src/lib/grades.js), which sums points.

### Cancelling a class, adding a one-off, marking an exam

A class schedule entry describes the normal week — MWF at 9:00 until the end of term.
Reality has holidays, a professor who cancels, and the occasional extra review session.
Editing the schedule itself is the wrong tool for those: it rewrites every meeting to
fix one, and there is nowhere to say *not this Tuesday*.

- **Cancel a single class** — tap that meeting on the calendar and choose *Cancel this
  class*. The rest of the term is untouched.
- **Add a one-off** — open the class from Settings and use the row at the bottom of the
  form: pick a date and times, then *Add meeting*. It appears on the calendar tagged
  *One-off meeting, not part of the usual schedule*, and its detail view offers *Remove
  this meeting* rather than Cancel.
- **Make one period an exam** — tap that meeting and choose *Make this an exam*. It
  turns red on the calendar, keeps its place in the week, and the rest of the term
  stays an ordinary class.
- **Undo any of them** — the class form lists every cancelled date, every extra and
  every exam, each with a Restore, Remove or Undo beside it. Nothing is destroyed, so a
  mis-tap costs one tap back.

Exceptions live *alongside* the recurrence rather than inside it, on the class entry's
own `exceptions` field — JSONB, so no migration:

```
exceptions: {
  cancelled: ['2026-08-25'],                        // no meeting that day
  added:     [{ date, startTime, endTime, ... }],   // an extra meeting
  exams:     [{ date, title, startTime, ... }],     // that day is an exam
}
```

Keeping the pattern intact is what makes a cancelled date still meaningful if the class
time later changes, and it is why Restore is always available.

An extra is allowed on a cancelled date: that combination is how *moved to a different
time this week* is expressed, and it falls out of the model rather than needing a third
concept. Adding twice on one date replaces rather than stacks, because a second add is
far more likely a correction than a genuine double session. Editing a class cannot
silently un-cancel a holiday — the form rebuilds the entry from its inputs, so anything
without an input, `exceptions` included, would have been dropped on save, and
`saveCanvasClass` carries it across. Exceptions apply immediately rather than on Save,
since they are edits to the stored class rather than to the form's draft, and mixing
the two would mean a cancellation vanished if you closed the form without saving; the
form is handed the live record so the list stays current. Dates are local
`YYYY-MM-DD` throughout, because a class meeting happens on a calendar day and
anchoring to an instant would move that day across a timezone boundary. Stored
exceptions are re-validated on read rather than trusted, so a malformed entry is
ignored instead of crashing the calendar.

**Why an exam is a transform, not an event.** A midterm happens *in* the class period —
same room, usually the same hour. Describing it as a separate calendar event would mean
cancelling the period and rebuilding most of it by hand, and the two could then drift
apart. So an exam rewrites the meeting in place, keeping its id, and everything
anchored to that occurrence still resolves.

Every field but the date is optional, and an omitted one means *same as the normal
period*. The common path is to check the title and press the button, and it also means
the exam keeps following the class: move the period to 10:00 next month and an exam
that never named a time moves with it. The form sends unchanged fields as absent rather
than as a copy, because storing `09:00` just because that is what the class happens to
run at today would silently pin the exam to a time you never chose.

Marking a cancelled date as an exam un-cancels it, since an exam is a meeting and
leaving the date cancelled would file the exam and then show nothing. An exam whose
meeting no longer exists is carried rather than discarded, so cancelling the date
afterwards leaves the exam there when you restore it. An extra can be the exam: a
review session that turns out to be the exam itself is the same edit, so the transform
runs over one-offs too. It offers a study plan afterwards, exactly as a hand-made exam
event does, because an exam you have just put on the calendar is the moment you are
most likely to want study time for it. The exam red overrides the course colour: a
midterm has to stand out from the fifteen ordinary meetings around it, which is the
whole point of marking it. The block also carries `category: 'exam'`, so everything
that already keys off that category treats it as one.

### Linking a lab or studio to its class

A lab, studio or recitation meets at a different hour than the lecture it belongs to,
so the schedule has always needed two entries for it. That is correct on the calendar,
where they really are two blocks at two times, and wrong everywhere the app asks *which
class is this for*. **Organic Chemistry** and **Organic Chemistry Lab** meant two chips
in the task filter, two entries in the category picker, two cards in My Classes, two
places to keep one reminder rule, and a term's coursework split down the middle
depending on which one you happened to pick.

A section can now be declared part of another class: open the lab from its edit form
and pick the lecture under **Section of**. From then on the two are one class everywhere
it matters — one entry in every category picker and filter chip, one card in My Classes
with each section's meeting pattern listed inside under *Sections* and its own Edit
beside it, one grade, one study-time total, one set of reminder rules, one list of
notes. A rule set on the class covers the lab's deadlines too, and only the class
carries rules, so a lab that had its own from before is quietly ignored rather than
sending a second notification for one deadline.

The meetings stay separate. Both blocks keep their own times, titles and room on the
calendar — that difference is the entire reason the lab was a separate entry, and
averaging it into one line would be a lie about when you have to be somewhere.

**Nothing is rewritten.** Linking sets one field on the lab's row (`linkedToClassId`)
and touches no task, event, note or exam. The tasks you had already filed under the lab
keep exactly the category they had; everything that groups by class resolves the id to
the parent when it *reads*. That is what makes the merge safe to try: unlinking puts
both halves back exactly as they were, including the tasks, which never moved.
Rewriting `category` on every affected task would have been a bulk write across two
synced tables that could not be undone once the two sets were indistinguishable, and a
bad link is instead one field to clear with no half-migrated state to recover from.

The lab adopts the class's colour when you link it. The two are one class everywhere
else, and colour is what identifies a class in a week view before any text is read, so
leaving the lab green would make the calendar the one place still insisting they are
two. It is an ordinary field afterwards, so you can change it back.

The child names the parent, never the reverse. A parent holding a list of its sections
would need that list kept in step when a section is deleted on another device — the
two-records-of-one-fact problem the rest of the app avoids. One field on one side
cannot disagree with itself.

A link whose target is gone is simply not a link: delete the lecture and the lab stands
back on its own, with its own category and its own card, which is the behaviour that
existed before links did. The same applies if the lecture is *disabled*, since a
switched-off class is out of the category picker and resolving a live section onto it
would leave that section's work with no home anywhere in the app. A chain is flattened:
link the lab to the lecture and a review section to the lab, and all three resolve onto
the lecture. The form says so rather than doing it silently — linking to something that
is already a section tells you to link to the main class instead, and a class that
already *has* sections is offered a sentence naming them instead of a picker.

### Classes are task categories

Every class on your schedule shows up as a task category, so a task can be filed under
**Physics 101** the same way it can be filed under **Personal**. The category filter
chips, the grouped view and the row colours then all work by class with no extra
concept to learn.

Tasks already had a category *and* a separate optional link to a class, and neither
answered *show me everything for Physics* on its own: the category was too coarse, and
the class link was only a chip on the row rather than something the list could filter
or group by.

They are derived, never stored. A class category is computed from the schedule on every
render, which keeps it correct for free — rename a class and its category renames,
disable one and it leaves the picker. Copying classes into `todoCategories` would mean
two records of one fact, drifting apart the moment either changed, and syncing the copy
for nothing.

The stored side is unchanged: a task filed under a class keeps `class:<id>` in its
ordinary `category` field, so filtering, grouping and colouring need no special case.
The id is namespaced with `class:` so a class id can never collide with a category you
made, and if you hand-made a category whose id starts with `class:`, yours wins rather
than being silently shadowed. Disabled classes are left out, since they are already
hidden from the calendar and offering to file new work under a class you switched off
is noise. The category manager still edits only your own categories — a derived one
must never reach it, because *renaming* it would either do nothing or write a stale copy
that then drifts out of step with the schedule.

A deleted or disabled class leaves its tasks intact: they point at a category that no
longer resolves, so the row simply renders without a category chip, which is what an
unrecognised stored category has always done. A task filed under a class no longer
shows the class chip twice, since the category already names the course in its own
colour; the chip stays for the older shape, where a task has an ordinary category *and*
a class link.

A new task inherits the category you are filtered to. Narrow the list to one chip and
hit Add, and that category is already selected — you were looking at Physics, so that
is what the new task is for. With two or more chips active there is no one answer, so
it falls back to the usual default, which never auto-picks a class.

Because a task could be filed under a class *category* and separately carry a "link to
a class", the form asked the same question twice and a task could claim Physics by one
and Chemistry by the other. The category is the answer, because it is the one that does
something — the list filters, groups and colours by it, while the link only ever printed
a chip. So the separate picker is gone, and `linkedClassId` is kept in step with the
category on save, which is what keeps older tasks that only have the link working
exactly as before. Nothing stored was rewritten. Your own categories and your classes
are also separated by a rule rather than run together in one wrap of chips — under a
*Your classes* heading in the task form, and as a hairline at the boundary in the
filter bar.

### Reminder rules you set once per class

*Remind me two days before anything is due in Physics* is a fact about the class, not
about each task. Every class card carries two rows of chips, one for tasks due and one
for exams, and they are multi-select: a week's warning *and* a nudge the day before is a
normal want, and making them exclusive would mean choosing which to lose.

The rule is resolved, never stamped. It is applied when a reminder is *evaluated*,
rather than copied onto each task as the task is created. This is the same argument the
derived task categories make and it buys the same things: change "2 days" to "3 days"
and every existing task follows, clear the rule and every reminder it implied
disappears, with no writes, no sync traffic and no second record of one fact to drift
out of step. Stamping would also have no answer for the awkward middle — a task created
while the rule said two days, edited after it said a week.

A task's own reminder wins. The rule is a default, filling in only where there is not
one already. A reminder you set by hand is the more specific statement of intent, so
the class rule neither overrides it nor stacks a second notification on top of it,
which is why the card says so under the chips rather than leaving a hand-set reminder
looking like the rule silently failed.

Exams need no separate record: an exam block already lives inside its class's own
`exceptions.exams`, and an omitted time there means *the usual hour*, so an exam
reminder counts back from the class period the exam inherits and keeps following it if
the period moves. A disabled or deleted class contributes no rules — it is already
hidden from the calendar and out of the category picker, and still being notified about
its coursework would be the clearest possible bug. The offset is part of the dedup key,
so two rules on one class are two notifications rather than one swallowing the other,
and rescheduling a task fires a fresh reminder as it always has. Malformed stored rules
are dropped on read rather than trusted, the same treatment `exceptions` gets, so a bad
value cannot take down the every-minute cron for everyone else. A Canvas-only card has
no chips, since rules live on the schedule entry and a Canvas course that was never
given meeting times has nowhere to keep one — which is what *Add meeting times* on that
card is for. Rules ride in the class row's existing JSONB alongside `exceptions`, so
there is no migration.

One honest limitation: **a class rule reaches Canvas assignments only while a tab is
open.** Canvas assignments are never persisted server-side — they are live data,
refetched rather than stored — so the reminder cron that delivers pushes to a closed app
cannot see them. Tasks and exams work closed-app as normal. Filing a Canvas assignment
as a task is the workaround, and linking the class to its Canvas course is what makes
the rule apply at all.

Server-side, a user with no rules pays exactly one extra query per cron tick — the
classes carrying one, almost always none. Only if that returns something does it go
looking for tasks, and it asks for the ones with *no* reminder of their own, the exact
complement of the existing prefilter, so no row is fetched twice and the precedence
rule is enforced in Postgres rather than trusted to line up in JavaScript.

### Grades and GPA

A collapsible **GPA / Grades** card sits at the top of the tab whenever Canvas is
connected and at least one assignment has been graded.

Live official grades are fetched from `/api/canvas/grades` whenever assignments sync, on
the same 15-minute cadence, with no separate polling loop, and the official Canvas score
overrides the assignment-computed estimate. Clicking any percentage types in your own
value instead; the override is stored separately in `localStorage` under
`lv-gpa.overrides` and always wins. Each course row shows a green *Canvas live* badge or
an amber *manual* badge, and the manual badge carries a one-click reset back to Canvas.

Per-course letter grades and percentages come from the sum of earned points over graded
points possible — 87 / 100 is a B+ — on a standard scale (A 93–100 = 4.0, A− 90–92 =
3.7, B+ 87–89 = 3.3, down to F below 60 = 0.0). Credit hours are editable per course,
default 3, persisted under `lv-gpa`, and the projected GPA is credit-weighted using
whichever grade source is active per course. A *what do I need?* helper takes a target
percentage per course and reports the average score required on the remaining ungraded
points. The layout stacks on mobile, and an empty state shows when nothing has been
graded yet.

---

## Notes

A full rich-text notepad in the same place as everything else. Press `W` anywhere in the
app to start writing.

The Notes tab sits between To-Do and Search. On desktop it is two panes, note list left
and editor right; on mobile the list fills the tab and selecting a note pushes the
editor over it, with an *All notes* back button.

**Rich text via Tiptap** — bold, italic, underline, strikethrough, multi-colour
highlight, H1/H2, bullet, numbered and checkbox lists, blockquotes, inline code, undo
and redo. The toolbar is custom-built with the app's own CSS variables, so notes match
the rest of the app in every accent theme and in dark mode. Markdown shortcuts convert
as you type: `**bold**`, `*italic*`, `` `code` ``, `# heading`, `> quote`, `- `, `1. `,
`[] ` and `==highlight==`, so you never have to reach for the toolbar.

The highlight palette is six pastel swatches chosen to stay readable in both themes,
plus a remove option. Its popover renders through a `createPortal` layer anchored to the
button's viewport rect, because the toolbar scrolls horizontally and would otherwise
clip it.

Type an explicit title, or leave it blank and the first line of the body becomes the
title. Starring marks a favourite and is filterable; pinning sorts a note to the very
top. They are independent, and the sort order is pinned, then starred, then most
recently updated. Each note takes one of eight accent colours, which tints its spine in
the list and the bar beside its title.

### Tags

Add free-form tags per note. Tag chips appear above the list and filter it on click.
Tags are case-insensitively de-duplicated and a leading `#` is stripped, so `#chem`,
`Chem` and `chem ` are all the same tag rather than three near-identical ones. Each
note's own tags render as pills on its row, first three then a `+N` counter, tinted with
that note's colour.

**Re-using a tag is one click.** Under the editor's tag input sits a *Reuse* row of
every tag already in use on another note that this one does not have yet, and typing
filters it so it doubles as autocomplete. This is the whole reason the feature is worth
having: a tag that is annoying to apply a second time splinters into `chem`,
`chemistry` and `Chem 2`, and then no grouping or filtering can help you. There is no
tag registry behind this — a tag exists exactly as long as some note wears it, so there
is never a list of dead tags to prune.

Chips are multi-select and show how many live notes carry each tag. Selecting more than
one **widens** the list — notes tagged `chem` *or* `bio` — rather than narrowing it,
because *show me both subjects* is the question you actually ask of a chip row; the
*and* reading is rarer and you can still get there by picking one tag and searching. A
Clear button drops the whole selection.

**Furling** puts a tag out of the way without filtering anything. Every chip carries a
small chevron: click it and that tag's notes collapse into one row in the ordinary list
— `chem ▸ 4 notes` — sitting exactly where those notes were, with everything else
unchanged. Click the bundle row, or the chevron again, to unfurl. *Furl all* folds up
every tag at once, leaving untagged notes in place. This is the everyday use: furling
compacts the full list rather than hiding the rest of it.

The bundle sits at the position of the first note it swallows, so furling collapses a
tag in place rather than reshuffling the list, and a stack of up to three coloured
spines hints that it stands in for several notes. A blue dot appears on the bundle if
the note currently open in the editor is inside it — otherwise furling the tag of the
note you are reading looks like the note was closed. Asking to see a tag beats having
furled it: selecting a furled tag as a filter shows its notes normally, and clearing the
filter folds it back up.

Furling one tag folds away only what belongs to that tag alone. A note tagged `chem`
*and* `lab` stays in the flat list while `lab` is unfurled, because furling one category
should not reach into a second one and take its notes with it. That note folds up once
every tag it carries is furled, and is then shown once but counted in each bundle it
belongs to, so every bundle reports exactly what it is standing in for.

**Group mode** is the stronger version, for when you want the whole list filed rather
than one tag tidied away. The Group toggle splits the list into one section per tag,
ordered by name, with untagged notes last under *Untagged* so nothing can quietly vanish
for never having been tagged. Section headers furl the same way and are sticky, so
scrolling a long group still tells you which tag you are inside. A note with three tags
appears under all three groups — that is the point of grouping by tag rather than filing
each note in one folder, and furling hides a *view* of a note, never the note. Pinned
and starred notes still sort to the top within their group.

Grouping and furl state are device-local (`lv-notes-grouped` and `lv-notes-furled`),
deliberately not synced. Furling a group on your phone to fit more on a small screen
says nothing about how you want the list to look on a laptop, and syncing it would make
notes appear to vanish on one device because of something you did on another. Trash is
never grouped: it is a flat *what did I throw away* list, where a furled group would
hide exactly what you came to look at.

### Images

Paste a screenshot straight into the body, drag and drop a file onto the editor, or use
the toolbar button — which is there for mobile, where neither of the other two is
comfortable. Multiple files upload in the order you picked them, with a spinner in the
toolbar tracking them.

Images are resized in the browser first: the longest edge is capped at 1600px and the
result re-encoded to WebP, or JPEG where WebP is unsupported, at quality 0.85. A 4MB
phone photo lands at 150–400KB. Images already under 320KB pass through untouched rather
than being re-compressed for nothing, and GIFs are never re-encoded because a canvas
round-trip would flatten the animation away.

They are stored in Postgres, not inlined. The note body carries only
`/api/notes/images/<id>`. Inlining base64 would put a multi-megabyte string into
`localStorage`, which has roughly a 5MB quota for the *whole app*, and re-upload it on
every sync POST. The bytes live in a `note_images` table, and `allowBase64` is off in
the Tiptap extension so a data URI cannot sneak back in.

They are private: `GET /api/notes/images/<id>` requires a session and is scoped to
`user_id`, so a URL that escapes a note body is not a way to read someone else's
picture. A wrong-owner read returns **404, not 403**, since distinguishing them would
confirm the id exists. Responses are `Cache-Control: private, immutable` with an ETag,
so repeat views are 304s.

Images require sign-in, because one held only in a single browser's `localStorage` would
break the moment the note synced elsewhere, so signed-out users get a toast instead of a
broken picture. SVG is rejected at upload: it is a document format that can carry script,
and these bytes are served from the app's own origin. PNG, JPEG, WebP and GIF are
allowed, up to 4MB after resizing.

Orphans are reaped on sync, but only once they have been unreferenced for 30 days. Sync
is last-write-wins, so a phone that has been offline can POST a notes array predating an
image added on a laptop; reaping strictly-unreferenced rows would delete it and leave a
permanent broken image, and the grace window makes that race require a 30-day-stale
device. A note that is *only* an image previews as "Image" rather than a blank card, and
its reminder push says "Image" rather than sending an empty body.

### Everything else about notes

- **Reminders** — an absolute date and time on any note, firing as an in-app toast while
  the tab is open and as a push when it is closed, through the same
  `/api/push/reminders` scanner and the same `sent_reminders` dedup as events and tasks.
- **Links** — attach a note to a Canvas course, calendar event or open task. The linked
  item's name appears on the note's meta bar and a link icon shows in the list row. The
  reverse holds too: a Notes section appears in the event editor, the task editor and
  the class card, each with a *New note* action that pre-links what you are looking at.
- **Turn into a task or event** — promote a note, or just the text selected inside it,
  into a real task or calendar event. It opens the relevant editor prefilled rather than
  creating silently, since a task wants a due date and an event wants a time, and the
  note is linked to whatever gets created.
- **Soft delete with undo** — deleting moves a note to Trash and raises an undo toast.
  Trashed notes are restorable or permanently deletable, and are purged after 30 days.
  The trash flag syncs, so deleting on one device removes it on the others.
- **Empty notes delete themselves.** Pressing `W` creates the note immediately, which is
  what makes quick capture feel instant, but it also meant wandering off without typing
  left an "Untitled note" in the list forever. Closing a note that is still blank removes
  it outright — removed rather than trashed, since there is nothing in it to undo and an
  undo toast for a note with no content is noise. Blanks left over from before this
  existed are cleared on load. *Empty* is strict on purpose: a tag, a reminder, a link, a
  star, a pin or a pasted image all count as content even when the body is blank, because
  every one of those is something you did deliberately. The check runs a tick late,
  because the editor flushes its pending autosave from an unmount cleanup and that flush
  is what decides whether the note is really empty — checking first would delete a note
  whose last keystrokes were still inside the 400ms debounce. Every way of closing a note
  goes through the same path, so no caller has to remember.
- **Autosave** — the body saves 400ms after you stop typing, and flushes on note switch
  and on unmount so nothing is lost mid-sentence. A *Saved* / *2m ago* indicator sits in
  the meta bar.
- **Search** — a Notes scope in the search popup plus notes in All results, matching
  titles, body text and tags. Notes ignore the upcoming/done status filter, having no
  completion state.
- **Sync** — notes merge strictly by `updatedAt`, newest edit wins, rather than
  local-wins. A note body is a single blob, so local-wins would silently discard an edit
  made on another device.
- **Lazy-loaded** — Tiptap and ProseMirror are code-split behind `next/dynamic` with
  `ssr: false`, so they never land in the initial bundle for the default Calendar tab.
- **Share into a note (Android)** — the app appears in the system share sheet. Highlight
  text anywhere, share to Luminae Vigila, and it arrives as a new note tagged `shared`. A
  *New note* home-screen shortcut starts one directly.

---

## Corvus, the assistant

A chat assistant powered by [Groq](https://groq.com), running `openai/gpt-oss-120b` by
default. It runs as a floating panel or a full-screen tab, and it is aware of your
upcoming events, tasks, Canvas assignments and class schedule.

It distinguishes the kinds of thing it can see: recurring class entries are labelled
`[CLASS]`, professor-posted Canvas events `[CANVAS EVENT]`, and your own entries
`[EVENT]`, so it uses the right word in a reply rather than calling a lecture an event.
It can add events and tasks, edit them and mark them complete, all in natural language,
and every write is confirmed on a preview card before it happens.

When it discusses existing items — "urgent deadlines", "week summary" — it renders them
as tappable mention cards that navigate straight to the item.

It is rate limited server-side to 20 requests a minute per user to protect the API key,
returning 429 with a 30-second retry hint; the send button then shows a countdown and
disables the input rather than letting you hammer it.

### Reminders, categories and steps

**Reminders by asking.** "remind me 30 minutes before", "remind me the day before",
"remind me Friday at 5pm" — a relative phrase becomes `reminderMinutesBefore` and a
named clock time becomes `reminderAt`. It works on new items and on existing ones ("add
a reminder an hour before my Chem Exam" routes to `edit_event`), and
`reminderMinutesBefore: 0` removes one. The reminder appears on the confirmation card
before you accept, and fires through the same `/api/push/reminders` scanner as a
hand-made one — the labels are generated to match the dropdowns exactly, so the two are
indistinguishable after the fact.

**Filing a task under a class.** Ask for *a task to read chapter 4 for Physics* and it
files it under the **Physics 101** category rather than a generic "academic". It could
not before, and the reason was blunt: the task tool advertised its category parameter as
`'One of: academic, personal, work, health'` — the four defaults, hardcoded at module
load. Corvus had never been told that categories you created existed, let alone the ones
derived from your class schedule. The tool schema is now built per request from the real
list.

Class ids are paired with course names in the tool description — `class:cls_17… (Physics
101)` — because the id alone is opaque and tells the model nothing, and the pairing is
what lets "for Physics" land on the right category. What comes back is checked rather
than trusted: a model handed a list of ids will sometimes return a label, a near-miss
like `class:Physics 101`, or something invented, so exact id, then label, then
prefix-plus-name are each tried. An unresolvable category is dropped rather than guessed
at — you confirm every task on a preview card first, and no category reads as *it did
not pick one* while a wrong one reads as a decision you have to notice and undo. A
malformed tool call loses that one call instead of the whole reply, since the model
usually said something worth reading alongside it. Only ids and labels are sent; nothing
else about a category is any use to the model, and the request is already carrying
events, tasks and assignments.

Two things were still missing after that first pass, and both showed up the moment the
feature met real use. **Corvus could not see the class list at all**, because the
category ids lived only inside a nested JSON-schema parameter description, which a model
really only consults once it has already decided to call the task tool. So *what classes
am I taking?* got nothing, and the roster could not inform the conversation leading up to
a task. Your classes are now named in the system prompt itself, listed separately from
the categories you made — one is a bucket you named, the other is a course with meetings
on the calendar, and running them together read as one arbitrary list. An empty schedule
says so explicitly, because silence would read as *the classes were omitted*, which
invites the model to invent one. And **`edit_task` still advertised a bare
`category: string`** with no list at all, so Corvus could file a *new* task under a class
but never move an existing one.

Fixed alongside them: checking the returned category against the *task* category list was
being applied to `preview_event` and `edit_event` too. Events have their own fixed list —
`class`, `exam`, `personal` and so on — which shares the parameter name but none of the
values, so every valid event category was being thrown away and silently replaced with
whichever one happened to be first. Only the task tools are checked now. Relatedly, when
Corvus could not tell which category a task belonged to, the app used to fall back to
*the first category in the list*, which invented an answer the model had deliberately
declined to give — and now that classes are categories, the first one can be a course, so
an unrelated errand could land under Chemistry. No category is the honest outcome, and
the task row already handles it.

**Breaking a task into steps.** *Add a task to study for the Chem final, with steps* now
produces one task carrying an ordered checklist, rather than five loose tasks or one with
the steps buried in the notes. Tasks have had subtasks for a long time — the form builds
them, the list renders and ticks them off — but Corvus simply had no parameter for them,
so it could describe a breakdown in prose and not create one.

The steps are shown in full on the preview card rather than counted: the whole point of
confirming a breakdown is reading it, and *5 steps* tells you nothing about whether they
are the right five. Titles come back and records are minted here as `{id, title,
completed}`, the same shape the task form produces, so a Corvus-made checklist is
indistinguishable from a hand-made one once saved. On an edit, absent means *leave them
alone*, so only an explicit list replaces what is there and asking Corvus to rename a
task cannot quietly wipe its checklist. Titles are trimmed, deduplicated and capped at 20
— the same ceiling the form enforces, so Corvus cannot create a task the form then
refuses to edit — and it is told not to invent steps for a task that is plainly a single
action.

### Planning, estimating and nudging

**Plan my week** gathers your next seven days of events, pending tasks and Canvas
assignments client-side and sends a structured planning prompt. Corvus replies with a
day-by-day proposal and then offers to add individual study blocks through the existing
confirm flow. No AI call happens until you tap the button.

**Estimate task time** asks how long an upcoming item will take, using built-in
heuristics — reading roughly 45–90 minutes, problem sets 1–3 hours, essays 2–4 — and
always offers to block matching study time afterwards. It also works from natural
language.

**The proactive nudge costs nothing.** On load, the app checks client-side, with no AI
call, whether three or more deadlines cluster within the next 72 hours with no study
blocks covering them. If so, a small dismissible *Busy stretch ahead — want help planning
it?* chip appears near the Corvus button, with a matching banner inside the panel.
Dismissing it sets a daily flag so it appears at most once a day.

Chat history persists to `localStorage`, capped at 50 messages and pruned oldest-first,
and recent history is sent as context on every request so Corvus remembers the session.
The session expires after 30 minutes of inactivity, and any pending-confirmation items
from a previous session are cancelled on restore. A trash icon in the header clears the
conversation.

### The model is pinned but overridable, and it will go stale

Groq retires models on their own schedule, and when one goes the failure is total and
looks silent: Groq returns a 404, the route re-threw it as a generic 500, and *every*
Corvus message failed identically no matter what you asked. That is how
`llama-3.3-70b-versatile` being decommissioned presented as "Corvus is having trouble
with reminders".

Set `CORVUS_MODEL` to swap models with no redeploy. A retired model now returns **503
with `code: model_unavailable`** and says what to do, rather than a bare 500. `GET
/api/corvus`, signed in, reports the configured model, whether this API key can actually
reach it, and the chat-capable alternatives; it never returns the key.

When picking a replacement, verify it emits `tool_calls`. Corvus is almost entirely tool
calls, and several models accept a `tools` array and then describe the call in prose
instead of making it.

---

## Google Calendar

Connect multiple Google accounts and toggle individual calendars on or off. Events
auto-refresh every five minutes, and visibility toggles and custom colours are never
reset by a background sync. Signing in to Luminae Vigila does not auto-connect Google
Calendar — that is a separate, explicit step.

### Reconnecting, and hidden calendars that stay hidden

Two problems with one shared root cause: preferences were keyed to an account id that
changes, and never left the browser.

**Hidden calendars now follow the account, not the browser.** Visibility and colour
choices live in `google_calendar_prefs`, keyed by Google account **email**. They used to
be `localStorage` only, keyed by the account's UUID — and disconnecting an account
deletes its row, so re-adding the same account minted a *new* UUID and every calendar you
had hidden came back, on an account you had just repaired. Email is how this app
identifies a Google account anyway, since `upsertAccount` conflicts on `user_id +
google_email`, so it is the key that actually survives the round trip. Living server-side
also means hiding a calendar on your laptop hides it on your phone.

`localStorage` remains a read cache so the calendar renders instantly and works offline,
with the account copy as the durable one. Choices that only ever existed in one browser
are migrated up on first load rather than lost. Uploads are suppressed until hydration
has run, so a browser that has not pulled the saved copy yet cannot overwrite it with an
empty one, and an empty payload is rejected server-side as well — it means *this device
has nothing to say*, never *clear everything*.

**Reconnecting is one click, in place.** The Reconnect button appears on any account that
needs it and reconnects in place rather than disconnect-then-add, which is what preserves
the account id and with it every calendar choice keyed to it. `login_hint` sends you
straight to that Google account instead of an account chooser: picking the wrong entry
there used to connect a *second* account and leave the broken one broken, which reads as
"reconnecting did nothing".

`GET /api/google/accounts?health=1` asks Google what each stored grant is still good for,
so a dead account is visibly dead in settings instead of looking identical to one with no
calendars ticked. It is opt-in, because it costs a round trip per account.

The Reconnect action on the disconnected toast used to call
`window.open('/api/google/auth')` — an endpoint that returns JSON *containing* the
consent URL rather than a redirect. The popup showed a wall of raw JSON, so the single
most reachable way back from a disconnect did not work at all.

### Why accounts keep disconnecting

**Most likely, the OAuth app is in Testing publishing status.** Google expires refresh
tokens for test-mode apps after **seven days**, so a connection dies roughly weekly no
matter what this code does. Fix it in Google Cloud Console → APIs & Services → OAuth
consent screen → Publish app. An unverified production app still shows an "unverified"
interstitial and is capped at 100 users, but its refresh tokens do not expire on a timer,
which is the difference that matters here.

The other cause is a missing refresh token entirely, which the health check reports
separately as `no_refresh_token`. The connect flow already requests `access_type:
offline` with `prompt: consent`, so this should be rare.

### Mirroring out to Google, for At a Glance

At a Glance has no third-party API. Nothing can register content with it; it reads
Google's own services. A PWA additionally cannot provide an Android home-screen widget at
any version, which is why the daily push exists and why its own source calls it the
closest thing to a home-screen widget a PWA can deliver. So the only route to that
surface is writing to Google Calendar, which At a Glance already reads — and lock-screen
glances, Assistant and Wear come along for free.

The mirror copies your events and due-dated tasks into a Google calendar the app creates,
called `luminaeVigila`. Tasks become all-day entries prefixed `☑` so a glance can tell
work-due from somewhere-to-be. It is **one-way**: edits made in Google get overwritten on
the next reconcile. It runs automatically at most every 15 minutes after a cloud sync,
plus a *Send to Google now* button in settings — a reconcile costs an API call per
*changed* item, so doing it on every 2-second sync debounce would burn quota while you
type. The window is bounded at 7 days back and 60 days forward, because At a Glance only
looks forward and mirroring all history would spend calls on things nobody will glance
at.

**It cannot create a duplicate loop.** The app already *imports* Google events, so
writing events out naively would re-import them as duplicates and then mirror the
duplicates. Three independent things prevent that: mirrored events live on their own
calendar created by this app; that calendar is filtered out of `GET
/api/google/calendars`, so it can never be selected as an import source in the first
place; and every mirrored event carries `extendedProperties.private.lvId`, so ours are
always identifiable even if the other two failed. Only the app's own events and tasks are
mirrored — imported Google events are never stored in the `events` table, since the sync
route is explicit that Google events are live rather than synced, so they cannot be picked
up and written back.

**Deterministic ids, and only writing what changed.** Google lets the caller choose an
event id if it is base32hex (`[a-v0-9]{5,1024}`). Hex is a subset of that alphabet, so
`lv` + hex(appId) is always legal and always the same for a given item, which makes each
write a true upsert with no local table mapping app ids to Google ids and nothing to go
stale if a write half-fails. Each event also stores a content fingerprint: without it,
every reconcile would `PATCH` every event — hundreds of calls to write values already
there — and with it, a steady state costs one `events.list` and nothing else. Events
without the `lvId` marker are never touched, because deleting those would be destroying
data the app did not create.

**Least-privilege scope, and why you must reconnect.** The mirror requests
`calendar.app.created` only: permission to create secondary calendars and manage events
*on calendars this app created*. Deliberately not `calendar.events`, which is event write
on every calendar you own, and not `calendar`, which is everything. The mirror is
incapable of touching a real calendar even if this code were wrong.

Because that scope did not exist on your grant before, an already-connected account must
be disconnected and reconnected. `GET /api/google/mirror` checks the *actual* granted
scopes via token introspection rather than inferring write access from a call that only
needs read, so it reports `needsReconsent: true` honestly instead of claiming readiness
it cannot deliver. `POST` in that state returns 403 with `code: needs_reconsent`, and the
settings panel says what to do.

---

## Canvas LMS

Two ways in, neither needing anything from your IT department.

**API token** — Canvas → Account → Settings → Approved Integrations → New Access Token,
then paste the token and your institution's Canvas URL into Canvas settings. This gets
assignments with submission status, courses, grades and calendar events.

**Calendar feed, no token** — paste your personal iCal feed URL from Canvas → Calendar →
Calendar Feed to pull assignment due dates and events without a token. Any public `.ics`
subscription URL works too. These appear in Canvas orange on the calendar.

Assignment due dates appear on the calendar as all-day task markers alongside your own
events. Individual courses can be toggled on or off, applying instantly. Inside the
Classes tab, assignments are grouped by class with due-date badges (overdue, due soon,
upcoming), submission status chips (Graded, Submitted, Missing), per-class grades and
projections, one-click links into Canvas, and an *Everything / This week* filter.
Assignments can be marked done in the app independently of Canvas.

**Bulk mark-done** — the Select button in the Classes header enters selection mode; tap
any assignment row or its checkbox to add it, and a sticky bottom bar shows the count
with *Mark done* and *Cancel*. Only undone assignments are toggled, so already-done items
are never flipped back.

**Assignment notifications** — when a sync finds assignments that were not there before,
a toast fires in-app, plus an OS-level notification if permission has been granted. The
first sync seeds the seen-ids list silently, so setting Canvas up does not produce a
burst of false positives.

---

## Notifications

A service worker at `/sw.js` delivers notifications even when the tab is closed or
backgrounded. It uses PNG icons (`icon-192.png`, `notification-icon.png`) because
**Android Chrome does not render SVG notification icons**.

Permission is requested on a user tap, from the *Enable notifications* button in the
focus timer's "Your week" section. Mobile browsers silently ignore permission prompts
that are not triggered by a gesture, so the app never auto-prompts: it registers the
service worker quietly and only subscribes once you tap Enable. iOS Safari requires the
app to be added to the Home Screen first (iOS 16.4+); Android Chrome works in-browser
with no install.

### Reminders when the app is closed

`GET /api/push/reminders` scans every subscribed user's events, tasks and notes for
reminders that just came due and sends a push, de-duplicated through the
`sent_reminders` table. This runs independently of any open tab — the old behaviour only
fired reminders while a tab was open, which on a phone is almost never when a reminder is
due.

**This endpoint does nothing unless something calls it, and that is the single most
common reason no notifications ever arrive.**

There is no cap on notifications per day. Web Push has no quota, not from Vercel and not
from the browser push services. The only limit is how often your endpoint gets pinged, so
the heartbeat runs outside Vercel and the constraint disappears.

Most ticks cost nothing. The endpoint remembers when the next reminder is actually due
and returns without opening a database connection until then, so pinging it every minute
buys accuracy without keeping Neon awake — see [Keeping Neon usage
down](#keeping-neon-usage-down) for the trade-off that makes possible. Note that the
`/api/push/status` heartbeat records the last *scan* rather than the last ping.

Set it up with [cron-job.org](https://cron-job.org): free, purpose-built, and true
one-minute intervals. The tick rate *is* the accuracy — a five-minute tick means a
reminder set for 3:07 arrives at 3:10. Point a job at
`https://<your-domain>/api/push/reminders`, every minute, with header `Authorization:
Bearer <CRON_SECRET>`, then use Test run to confirm: `200` with `{"ok":true,…}` is
working, and `401` means the secret or the header is wrong.

If you cannot read `CRON_SECRET` back out of Vercel, that is by design — values are
write-only after creation. Generate a new one and set the same value in both places. It
only has to match; it does not have to be the original.

GitHub Actions was tried and removed: a five-minute minimum schedule, best-effort start
times that slip ten minutes or more under load, and around 60 runner-minutes an hour to
work around it. Either way the endpoint is idempotent, since `sent_reminders` dedupes, so
overlapping pingers cannot double-send.

`vercel.json` is schema-validated and rejects unknown keys, comment properties included —
a stray `_comment` fails the build. Explanations live in
[docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) instead.

### The daily glance and the Sunday digest

A morning push with the day's counts and the first thing on the calendar:

> **Today at a glance** — 2 overdue · 3 due today · 4 events — first up: Physics at 9:30 AM

Tapping it opens `/today`; the service worker honours a `url` in the push payload,
same-origin only. It is **silent on an empty day**, because a push that says "nothing
today" every morning trains you to ignore the app's notifications entirely, which then
costs you the reminders that matter. It runs at `0 11 * * *` UTC. Vercel crons run in UTC
with no per-user send time, but subscriptions store the device's `tz_offset`, so the
*contents* are computed against the reader's calendar day even when the hour is not
ideal.

Opted-in users also get a Sunday 6pm UTC digest previewing the coming week:

> **Your week ahead** — 4 tasks, 2 events — busiest day: Wednesday

Toggle it in the focus timer's "Your week" section. It requires sign-in, and the cron is
configured in `vercel.json` against `GET /api/push/digest`, protected by the same bearer
secret.

**The opt-in is per account, and defaults on.** It lives in `users.digest_enabled`, read
by the toggle through `GET /api/push/digest-pref`. It used to be stored per subscription,
defaulting to `false`, while the toggle read its state from `localStorage`. Three
consequences, all silent: the feature shipped switched off for everybody; turning it on
at a desk left every phone opted out; and each browser displayed its own cached guess at
a setting it may never have written. A weekly summary is a preference about *you*, not
about a browser profile. `push_subscriptions.digest_enabled` is left in place but unread,
since dropping a column is unrecoverable and buys nothing.

### Troubleshooting

Push fails **silently**: the browser reports "enabled", the server reports "sent", and
nothing appears. Settings → Notifications → **Test notifications** walks the five links in
the chain and reports the first one actually broken — browser support, permission, VAPID
keys, a recorded subscription, and delivery — then sends a real push.

`GET /api/push/status` returns booleans and counts only, never key material or the cron
secret. `POST /api/push/test` sends immediately and reports the push service's *actual*
rejection per endpoint, because a 403 (key mismatch) and a 410 (expired subscription)
look identical from the client but need completely different fixes. If the test arrives
but reminders do not, the problem is the scheduler rather than the device.

**Cron heartbeats.** Every authorised cron run stamps a row in `cron_pings`, and the
troubleshooter reports how long ago each job last got through. This exists because a cron
being pinged with the *wrong* secret is otherwise indistinguishable from a cron nobody
pings at all — both are silent. Worse, Vercel injects `CRON_SECRET` into its own crons, so
rotating the secret without updating the external pinger breaks only
`/api/push/reminders`: the daily glance keeps arriving while reminders die, which reads as
"notifications work, reminders are broken" and sends you inspecting the phone instead of
the scheduler. The troubleshooter says so in one line.

Only successes are recorded. Logging rejections would mean a database write on every
unauthenticated hit to a public URL, and buys nothing: a 401 loop and a dead pinger both
show up as "last success was ages ago".

Full detail in [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).

---

## Sync

The app is local-first. `localStorage` is the working copy, and the cloud is where
devices reconcile. Signing in adds sync; it does not move where the data lives.

Cloud sync POSTs run all their writes inside a single transaction, so a failure mid-way
rolls the whole thing back and a partial wipe is impossible. When signed in, a refresh
icon beside your email in the sidebar (or in the Settings tab on mobile) pulls the latest
cloud state immediately, which is what you want when you have just edited something on
another device. The icon spins while the pull runs.

Every merge resolves conflicts by `updatedAt` — newest edit wins — through the shared
helpers in [`lib/tombstones.js`](src/lib/tombstones.js). Deletes leave tombstones rather
than removing the row, because an item absent from one side is otherwise
indistinguishable from one *created* offline on the other.

### Ticking a task off did not stick on the other device

Tasks synced. Whether they were **done** did not: you would tick something off on your
phone, open the laptop, and find it unticked again — or tick it on the laptop and watch
the phone undo it on its next sync.

The cause was a single missing line rather than anything wrong with sync itself.
`toggleTodo` was flipping `completed` **without stamping `updatedAt`**. Every other task
mutator stamped it; the toggle did not. That produced a very specific and misleading
symptom. Both devices held the same task with the same timestamp and a different
`completed` flag; the merge's tie-break is `localT >= cloudT`, so on an exact tie the
*local* copy wins — and the local copy was the one that had not heard about the toggle.
The stale copy then got pushed back over the real change, so the completion was undone
*everywhere* rather than merely missed on one device. Creating a task was unaffected,
because a new id is absent on the other side and merges unconditionally. Only the flag
reverted, which is exactly why this read as a display bug — "I can see the task, it just
will not stay done" — rather than a sync bug.

Fixed by stamping `updatedAt` on the three mutators that were missing it: completion
(both the one-off flag and a recurring task's per-date `completedDates`), subtask
checkboxes (stamped on the parent, since the parent row is what the merge resolves), and
reordering (order is synced, user-visible state, so it lost the same tie-break).
`tombstones.test.js` now pins the merge behaviour that allowed it, so a future unstamped
mutator fails a test instead of quietly losing edits.

### Recurring completion resolves per date

Stamping the row fixed completion for ordinary tasks, but a recurring task carries
several independent decisions in one row — it records completion per date in
`completedDates` rather than as one flag. Resolving that row as a single unit makes those
decisions compete:

1. Both devices are offline holding the same weekly task.
2. You tick Monday's copy off on your phone.
3. You tick Tuesday's copy off on your laptop.
4. Whichever row was touched later wins *entirely*, and the other day's tick is gone —
   though the two never actually conflicted.

The obvious fix, unioning the two arrays, trades one bug for a worse one: an add-only set
cannot express *Monday is no longer done*, so un-ticking on one device gets undone by any
device that still remembers the tick.

So completion is a **per-date last-write-wins register**
([`lib/todoMerge.js`](src/lib/todoMerge.js)). `completedDates` stays the array everything
already reads, and a companion `completionStamps` records when each date last changed:

```js
completedDates:   ['2026-09-07']
completionStamps: { '2026-09-07': '…T10:00Z', '2026-09-14': '…T11:00Z' }
```

A date in the stamps but absent from the array was deliberately un-ticked. That is the
same idea as a tombstone, and it is what lets an untick beat a stale tick instead of
being mistaken for "never done". Per date, the newer stamp decides, so Monday and Tuesday
resolve separately and both survive the sequence above. If one side stamped and the other
did not, the stamped side decides — a stamp means the date was touched, and no stamp
means it never was, which is the same rule the row-level merge applies to `updatedAt`. If
neither stamped, they union: those rows predate the register, so they carry no record of
an untick and there is none to honour, and keeping a tick nobody can date beats dropping
one somebody made.

Un-tick stamps are dropped after the 30-day tombstone window. They only have to outlive
the slowest device, and without that a long-running weekly task would accumulate a stamp
per occurrence forever. Expiry runs on the purge path (`purgeTodos`) as well as inside
the merge, because the merge only sees rows *both* sides hold — for an offline account no
row is ever reconciled, and the stamps would have grown without bound.

Ordinary tasks are left alone: a task with no recurring state does not gain an empty
`completedDates`, which would change its sync fingerprint and re-push the whole
collection for nothing. Stamp keys are stored in date order, because `completionStamps`
rides in the todos payload and the delta check fingerprints that with `JSON.stringify`,
which is key-order sensitive — two devices that agree on the state but ticked the dates
in a different order would otherwise fingerprint differently and re-push on every sync.

`setCompletionForDate` is the only writer, and it moves `completedDates`,
`completionStamps` and the row's `updatedAt` together, so the array and the stamps cannot
drift apart and no call site can tick a date without stamping the row the merge resolves
it by.

### Subtasks resolve one by one

Subtasks were resolved by their parent: the row carried the array, a subtask change
stamped the row, and the newer row won whole. That is the `completedDates` mistake one
level down — three steps under one task are three independent decisions sharing one
timestamp. Ticking "outline" on your phone and "draft" on your laptop lost one of them,
and a deleted subtask came back, because the edit modal saves the array it is holding so
a removed subtask was simply *absent*, and an absent subtask is indistinguishable from one
added offline.

A subtask now carries its own `updatedAt`, and removing one leaves a `deletedAt`
tombstone, so the same helpers resolve it. The row still resolves the task's own fields —
title, due date, category — while subtasks resolve one by one underneath it.

Every write goes through a helper (`patchSubtask`, `addSubtask`, `applySubtaskEdits`),
each stamping the subtask *and* the parent row. `applySubtaskEdits` is what makes the
edit modal safe: it takes the editor's content and order but turns removals into
tombstones, so writing back the visible array no longer drops them. An incoming tombstone
passes through untouched, because not every caller filters the array first — Corvus marks
a task done by spreading the whole row back. Only what changed is re-stamped, since
re-stamping every subtask on save would let an unrelated edit win merges it should lose
and would churn the whole row's sync fingerprint. Tombstoned subtasks are filtered from
every read — the checklist, the `2/5 steps` chip, and the editor's own list all go through
`visibleSubtasks`.

### Custom-list items

Checklist items had a broader version of the same problem.
[`lib/customLists.js`](src/lib/customLists.js) merged local-wins with no timestamps
anywhere, at both the list and the item level. Checking an item reverted, because the
device that had never heard about the check won as "local" and pushed the unchecked copy
back. Deleting an item brought it back, because deletion spliced the item out of the
array and an item absent from one side is indistinguishable from one created offline. And
two edits to one list fought, because the whole list was one unit, so checking an item on
your phone while renaming a different item on your laptop discarded one of the two.

An item is now a merge unit in its own right, carrying its own `updatedAt`, with deletion
leaving a `deletedAt` tombstone. That makes items behave exactly like tasks and events and
lets the same shared helpers resolve them: the list row resolves name, icon, colour and
due date, while items resolve one by one underneath it.

A list item's subtasks are deliberately *not* merge units. A subtask lives inside its
item's blob, so the item's timestamp resolves it, which means a subtask change stamps the
item and a subtask can be removed outright with no tombstone. Every mutation goes through
a helper in `customLists.js` — `patchItem`, `deleteListItem`, `reorderListItems` and the
rest — rather than being spliced together in the component, because stamping is easy to
forget in one branch out of nine and forgetting it is silent: the edit just loses a merge
later, on another device, with nothing to point at. Reordering keeps tombstones; the old
drag handler replaced `list.items` with only the visible items, which would have dropped
every tombstone and resurrected the deleted items. Tombstoned items are filtered from
every count — the `3/7` badge, the tab strikethrough, the calendar due-date markers, the
agenda and search all read `visibleItems(list)`.

No database change was needed: a list is stored as a single JSONB blob, so items ride
inside it.

### Per-event display preferences

`eventPrefs` holds per-event display state — hidden, colour, important — keyed by event
id. It lives apart from the events themselves so it works for events that are not ours to
edit: a Google invite, a Canvas due date and a class period all get the same treatment.
That part was right; how it *synced* was not.

The whole object was shallow-merged with no timestamps anywhere, **and in a different
direction depending on the path**: sign-in and the background poll did `{ ...cloud,
...local }`, while the refresh button did `{ ...local, ...cloud }`. So marking an event
important on your phone and un-marking it on your laptop meant the phone's stale copy won
as "local" and was pushed back over the un-mark. And because the direction flipped
between paths, the same two devices could settle on different answers depending on
whether you signed in or pressed Sync — which is what made it look like a rendering glitch
rather than a sync bug.

An entry is now a merge unit carrying its own `updatedAt`
([`lib/eventPrefs.js`](src/lib/eventPrefs.js)), and every path resolves entries the same
way. All five writers go through `setEventPref`, which stamps the entry: hide, un-hide,
both colour setters and the important toggle. Un-hiding writes `hidden: false` rather than
deleting the key, because a removed key is an absence and an absence is indistinguishable
from "never set" — the same reason deletes need tombstones; nothing here deletes an entry,
so prefs need no tombstones of their own. The refresh button resolves prefs by timestamp
too, since a pref entry *is* the finer-grained state that the row-level cloud-wins rule
defers to. A restored backup stamps its entries as of the restore, because they would
otherwise carry the backup's old stamp — or none, if the file predates stamping — and lose
the next merge to a fresher copy on another device, silently undoing the restore.

**Not yet fixed:** prefs for deleted events are never reaped, so the object grows slowly
and forever. Reaping needs a grace window like the one orphaned note images use, because
Google and Canvas events load asynchronously, and an event that is merely *not loaded
yet* must not look like one that is gone.

### The manual refresh button

The pull-from-cloud merges are cloud-wins at the **row** level, but they resolve the
finer-grained state by timestamp rather than overwriting it: per-date for recurring
completion, per-item for list items. The button means *fetch what my other device did*,
not *discard what I just did here* — a tick made seconds ago carries the newer stamp and
survives. This mirrors the rule the refresh already followed of never resurrecting a
local delete.

There used to be **three** implementations of the merge rule, so a collection was resolved
differently depending on how you arrived at it: `mergeById` at sign-in,
`mergeWithTombstones` on the background poll, and a hand-rolled cloud-wins pass on the
refresh button. Three copies of one rule is three places to miss it, and both of the
following bugs are that miss.

`mergeById` was the pre-tombstone merge, kept at sign-in for categories and study sessions
long after those collections had moved on. It preferred **local whenever either side
lacked `updatedAt`** — the exact defect `tombstones.js` documents. Retroactively tagging a
focus session stamps `updatedAt` specifically so the edit wins that merge, but the other
device's untouched copy has no stamp at all, so it won as "local" and pushed the untagged
copy back: the tag reverted on sign-in. It also compared timestamps as raw strings rather
than parsed dates. It is gone.

The refresh button had the same problem from the other end, keeping its own hand-rolled
merge for classes, study sessions and categories — keyed by id, cloud overwrites local, no
notion of a tombstone. Classes soft-delete, and the background pull had been
tombstone-aware since tombstones landed, so deleting a class and then pressing Sync
brought it back: the cloud's copy simply had not heard about the delete, and nothing
stopped it overwriting the tombstone. Every collection now goes through the shared
`mergeCloudWinsWithTombstones`, and the duplicate helper is gone.

### Writing only what changed

Neon bills for **compute time**, and the sync was spending a lot of it saying nothing.

`POST /api/sync` used to answer every array it received with `DELETE FROM <table> WHERE
user_id = …` followed by one `INSERT` per row. The client sent all nine collections on
every save, so renaming one todo deleted and reinserted every event, note, custom list and
category the account owned — hundreds of row writes to record a change to one.

That was fixed from both ends. On the server, a collection is reconciled by a set-based
upsert that writes only the rows whose JSONB actually differs. On the client, the
collection is not sent at all unless something in it changed: the handler already ignores
any key missing from the body, so that half was entirely client-side.
[`lib/syncDelta.js`](src/lib/syncDelta.js) fingerprints each collection with
`JSON.stringify`, and the push sends only the ones that no longer match the last push the
server *accepted*.

Accepted, not attempted — the fingerprint is recorded on `res.ok` only, because
optimistically recording it would make a failed push permanent: that collection would look
unchanged from then on and never retry. Order counts as a change, since task order is
stored as array position and is user-visible. Stringify comparison also errs toward
sending, which is the safe direction: a missed change is data loss, an extra send is only
cost. The initial merge still sends everything, being the first thing the server sees that
session, and its fingerprint is recorded so the next push is a delta. An unserialisable
value is treated as always-changed rather than silently dropped from every future push. A
re-render that touched no data now sends nothing, where it used to cost a full rewrite of
all nine tables.

**Idle back-off on the pull side.** A left-open tab asked the database the same question
every two minutes forever, and since the bill is compute *time*, the cost of an idle tab
was an endpoint that never got to sleep. The poll now doubles its gap each time a pull
finds nothing new, up to four minutes, and snaps back to two minutes the moment a pull
finds something or you come back to the window. It is a self-rescheduling timeout rather
than a fixed interval, which is what lets the gap grow.

**Coming back to the window is not the same event as coming back to the tab**, and
conflating the two is what made cross-device sync feel broken. The catch-up pull was wired
to `visibilitychange`, which fires when the *tab* is hidden — switched away from, or the
window minimised. A laptop sitting open on this tab **behind another application is still
`visible`**, so returning to it fired nothing and the back-off kept running. Tick
something off on your phone, look over at the laptop, and you would wait — up to the full
ten-minute ceiling the back-off used to allow. Indistinguishable from a sync bug, and it
is what sent us looking for one in the merge logic.

So the catch-up also listens for `focus`, which is the event that actually means *the user
is here now*, and for `pageshow`, which covers a tab restored from the back/forward cache
— that runs no effects and would otherwise show whatever it was frozen holding. The
ceiling came down from ten minutes to four for the one case no event can catch: two
devices in front of you and nobody touching the second one. Roughly 15 idle polls an hour
instead of 6.

### When the database is out of allowance

Neon answers with **HTTP 402** once a project has spent its plan allowance for the billing
period. The app is local-first, so almost everything keeps working — but signing in
cannot, because issuing a session means writing a user row.

That combination makes the outage present strangely: anyone already holding a 30-day
session cookie notices nothing at all, while a device signing in fresh fails. It reads as
"sign-in is broken on my phone" rather than "the database is off", and sends you looking
at OAuth config, redirect URIs and PWA containers, none of which are wrong.

So a 402 is named. [`lib/dbErrors.js`](src/lib/dbErrors.js) classifies it as `db_quota`,
separately from `db_unavailable` (unconfigured or unreachable), because the two have
completely different fixes: one is a plan or a billing date, the other is an environment
variable. The login page says the allowance is spent and that on-device data still works
offline.

The status is not always attached to the error — the serverless driver sometimes only
carries a message — so the wording is matched too (`payment required`, `quota`,
`exceeded`, `suspended`). `402` is matched word-bounded, so a connection id of `4021` or a
`1402ms` timing is not mistaken for it. Quota wins over the generic answer when both could
match, since `database quota exceeded` contains `database` as well. Anything still
unrecognised is passed through URL-encoded and printed on the login page verbatim, so it
stays reportable rather than being flattened into a guess.

Everything else that needs the database fails quietly at the same time — cross-device
sync, and the push crons, whose jobs all query it. If notifications stop and fresh sign-ins
fail together, suspect the allowance before the cron configuration.

### Which build is this, and when did it last sync

At the bottom of Settings, under the account block: `Synced 2 min ago · build a1b2c3d`.

Both halves exist for the same reason. When two devices disagreed there was nothing in the
UI that could tell you *why* — a real sync bug, a device still running last week's bundle,
and a device that simply had not polled yet all look identical from the outside, and all
three look like "sync is broken". Answering it meant diffing deployed JavaScript against a
local build, which is not a thing to do twice.

The commit comes from `VERCEL_GIT_COMMIT_SHA` on Vercel and from `git rev-parse` when
building locally, so the marker works on a dev server too — which is where *are both of
these on the same code?* is hardest to answer by eye. It is injected through `env` in
`next.config.mjs` rather than `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, because that one only
reaches the bundle if *Automatically expose System Environment Variables* is enabled on
the Vercel project, so relying on it would leave the marker silently blank depending on a
setting nobody remembers. Hovering gives the build time.

The sync age is the last *successful* read of the cloud, set by both the background poll
and the manual refresh. A signed-in device that has never synced says `not yet` rather
than implying it has. Signed out, the sync half is omitted entirely — there is nothing to
sync, and a sync state would be noise — but the build marker stays, since that is the
question it exists to answer. Seconds round to "just now", because the poll runs on a
scale of minutes and a count of seconds would claim a precision the underlying thing does
not have.

---

## Import and export

**Export JSON** is a complete local backup: events, tasks, task *and* event categories,
notes, your class schedule, custom lists, study sessions, per-event display settings, and
your Canvas, Google and GPA preferences. Every collection the app syncs is in it. The only
things left out are the Canvas caches, which are re-fetched from Canvas rather than owned
here.

One limit worth knowing: **images pasted into notes are not in the file.** The bytes live
in their own table and a note body carries only a short URL, deliberately, since inlining
a phone photo as base64 would blow the roughly 5MB `localStorage` quota and re-upload
itself on every sync. A backup restored onto the same account resolves its images from the
server as normal, but the JSON on its own is not a complete offline archive of note
images.

**Export ICS** carries everything with a date on it: your own calendar events, every class
meeting of the term with exams included, and your tasks and checklist due dates. It opens
in Google Calendar, Apple Calendar and Outlook.

The ICS export used to be events plus class meetings and nothing else, so a file named
after your calendar left out the tasks — most of what a student planner actually holds.
All of it appears on the app's own calendar, which is why the omission was invisible until
you opened the file somewhere else.

Tasks go out as all-day entries prefixed `☑`. That is not a new convention: it is exactly
how [`lib/googleMirror.js`](src/lib/googleMirror.js) already writes a task onto a Google
calendar, so a task looks the same wherever this app puts one. `VTODO` is the technically
correct iCalendar type and the wrong choice here — Google Calendar ignores VTODO entirely
and Apple diverts it into Reminders, so the export would be silently task-free in the two
places it is most likely to be opened.

- A finished task, an undated one and a deleted one are all left out, the same rules the
  Google mirror applies. A calendar of things you have already done is not the point.
- A recurring task exports as its occurrences rather than an `RRULE`, reusing the expander
  the app's own calendar uses, so the file agrees with the app and no hand-translated
  recurrence rule can be subtly wrong. Occurrences already ticked off are skipped. The
  horizon is the expander's — eight weeks, 60 occurrences — and the full rule survives in
  the JSON backup, which is the thing that round-trips.
- A list's own due date appears only while the list is unfinished, and an item's only
  while it is unchecked, the same rules the calendar's due-date markers follow.
- Notes are deliberately absent. A note has no date and no duration; it is a document, and
  there is nothing for a VEVENT to say about one. The JSON backup carries them in full.
- Canvas assignments are deliberately absent too. They are Canvas's records rather than
  yours, and Canvas publishes its own ICS feed, so exporting them here would duplicate
  every assignment for anyone subscribed to both.

**Import JSON or ICS** runs in one of two modes. *Add to what I have*, the default, is
non-destructive: new items are added, and duplicates prompt for Keep mine / Replace mine /
Keep both. *Replace everything* is a full restore: the collections the file carries become
exactly what it says, and what you had in them is gone.

### Restoring, without a footgun

*Replace everything* is the one genuinely destructive thing in the app, so it is guarded
rather than offered casually.

It is never the default — merge is preselected every time and the choice resets after each
import, because a destructive default is how a restore happens by accident. It states the
damage as a number before you can run it: *Deletes 47 items currently on this device. This
cannot be undone.* "This is destructive" is a shrug; a count is a decision. Tombstones are
not counted, since saying *412 items* when 300 are old deletions would be scaremongering
rather than informing. The button renames itself to *Replace everything*, in red, so the
last thing you click says what it does. The duplicate picker disappears, because a replace
has no duplicates to resolve.

It only clears what the file actually contains. Wiping your classes because an ICS import —
or a backup written before classes existed — says nothing about classes would be data loss
dressed up as a restore. Anything the file does not mention is kept, and the warning lists
it by name. Your Canvas feed URL survives even a replace: it is absent from the file
because *we* stripped it on the way out, not because you cleared it, and deleting it as a
side effect of protecting it would be the worst of both outcomes.

### What the backup covers, and why it is a list

The JSON payload used to be a hand-written object literal naming four collections, and
every collection added since was quietly left out of it. A restore came back missing the
class schedule, event categories, custom lists, study sessions, per-event colours and
hidden flags, and every preference — course colours, credit weightings, which Google
calendars you had hidden.

The ICS was worse in a subtler way: it was handed `events`, the *stored* events. Class
meetings are not stored — they are expanded from the schedule on every render, the way the
calendar draws them — so a term of classes was never in the file, and exams went with them.

Two more faults sat in the same function, both silent. Location and notes were always
blank, because it read `event.location` and `event.description` while an event keeps those
under `extendedProps`. And all-day events landed a day early, because `new
Date('2026-03-04')` parses as UTC midnight, so writing it as a UTC timestamp puts the event
on 3 March for anyone west of Greenwich. They are `VALUE=DATE` now, with the exclusive end
iCalendar requires, so a one-day event ends on the 5th instead of importing as
zero-length.

The same bug three times means the shape was wrong. [`lib/backup.js`](src/lib/backup.js)
now holds one list of what a backup contains, and the export, the diff, the summary and
the merge all loop over it — adding a collection is a one-line change there and nothing
else. A test asserts that list covers every collection `SYNC_KEYS` pushes to the server, so
the two cannot drift apart again.

Two kinds of thing live in a backup and restore differently. **Collections** are arrays of
records with ids: they merge, and a record you already have raises the duplicate prompt.
**Settings** are blobs keyed by something other than an id — which calendars are hidden,
what colour each course is, how many credits it is worth. Merging those record-by-record is
meaningless, so they are restored wholesale, and restoring merges them rather than
replacing, so a device that already has a feed URL keeps it rather than having it blanked
by a file written without one.

**One thing is deliberately left out: your Canvas calendar feed URL.** That is a
*capability*, not a preference — anyone holding it can read your Canvas calendar without
being you, and a backup file is exactly the sort of thing that gets emailed to yourself or
dropped in a shared folder. Everything else in that blob is kept. The cost is re-pasting
the feed URL on a new device, which is a fair trade for a file that cannot leak read access
to your calendar.

Also excluded, for stated reasons in the code: the caches of live Canvas data, since a
backup would preserve a stale copy the next sync overwrites, and which assignments have
already been announced, since restoring it would re-announce, or wrongly silence, a term of
work. The Canvas API token was never in `localStorage` at all; it lives server-side in
`canvas_credentials`.

The backup carries raw arrays, tombstones included. A tombstone records that something was
deleted, and dropping them would let a restore onto a fresh device resurrect everything you
had ever thrown away.

The JSON format is **version 3**. Versions 1 and 2 restore exactly as they used to: missing
keys read as empty, and an ICS import, which carries only events, leaves every other
collection alone rather than blanking it.

The ICS serializer lives in [`lib/icsExport.js`](src/lib/icsExport.js). It had been a
closure inside a render function, which is precisely why three faults could sit in it
unnoticed — there was no way to test it. It is now pinned by a round trip back through
`parseIcs`, the same reader the Canvas feed uses, so the app can always read what it
writes. Lines fold at 75 octets as the spec requires, and an event with an unusable start
is dropped rather than written malformed, because one bad `VEVENT` can make a client reject
the entire file and take the valid events with it.

---

## Focus timer and study time

A Pomodoro timer tied to your actual work, opened from the timer button on desktop or the
Settings tab on mobile. Focus, then a short break, with a long break every four sessions,
and all three lengths configurable — one click resets to 25 / 5 / 15, or save your own as
your default. Auto-start is off by default, so the timer pauses between phases and waits
for you, and a lightbulb in the header toggles a short dismissible note explaining the
flow.

**Pick what you are focusing on** — a task, a Canvas assignment, or a calendar event.
Completed sessions accumulate focus time on it. Exams and quizzes lead the list, because
revising for a specific exam is the longest-running focus target a student has, followed
by tasks, Canvas assignments and then other upcoming events, capped at 20 so a term of
classes does not bury everything else. Only *upcoming* events are offered: an exam you
already sat is never the intent. Time focused on an event accumulates under
`extendedProps.focusSeconds` and syncs like any other event field.

**Pop out the timer** on desktop Chrome and Edge and it opens a small floating window that
stays above other applications, so the countdown is visible while you work in something
else. It shares state with the main panel — pausing in either pauses both, because there
is only one timer — and closing the timer takes the pop-out with it. It uses the
[Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API),
and the button is hidden entirely where that is unsupported: Firefox, Safari, and all
phones and tablets. Floating over other apps on mobile needs a native overlay permission
that no web API exposes, so full-screen zen mode is the answer there.

**Zen mode** is a full-screen glowing progress ring with a selectable ambient background —
Snow, Aurora, Rain, or Fireflies — all pure CSS and JS animation with no assets. Escape
exits.

**Every finished session lands on the calendar** as a real, editable time block, which is
how tasks become time-blocking. This is on by default, and can be turned off in the
timer's settings drawer. The block is titled after what you focused on, carries the course
tag, the focus target and the study-session id in `extendedProps` so it still explains
itself when you open it weeks later, and the completion toast says when one was added —
silently writing to your calendar is not something to do quietly. Existing installs are
migrated on next load, because a stored `false` from the old default would otherwise
shadow the new one forever, and the migration is version-stamped so it runs once and never
re-enables a setting you turned off.

A gentle two-note chime and confetti mark each completed session, and the chime can be
muted. Sessions save to `localStorage` under `lv-study-sessions`, and sync when signed in.
The timer adds only `lv-focus` and `lv-study-sessions`, and never alters existing events or
tasks.

### Study time

A collapsible **Study Time** card appears in the Classes tab below the GPA panel once at
least one tagged session exists. It shows weekly hours per course as horizontal CSS bars
with no chart library, with untagged sessions grouped as "Untagged", a total in the header
pill, and a week-over-week delta when last week's data exists.

An **All sessions** tab lists every completed session, newest first, grouped by day —
Today, Yesterday, `Mon, Aug 3` — with the day's total, what you focused on, the end time
and the duration. It caps at five days with a *show earlier* button, so a term of sessions
is not a scroll trap.

**Retroactive tagging** — a button on any past session assigns or clears its course. The
tag previously came only from whatever was selected in the timer when the session
finished, which is easy to forget and was impossible to correct, leaving that time stuck
under "Untagged" forever. Edits stamp `updatedAt` so they win the merge against a stale
copy on another device. Sessions record `endedAt` and `targetTitle`; older rows predate
both and render without a time or subject line.

The same list appears in the focus timer's expanded "Your week" section, which is the copy
that is always reachable — the Study Time card only appears once Canvas is connected.

### Weekly recap and streaks

A compact **Your week** section inside the focus timer panel groups the weekly stats with
the rest of the timing tools: tasks completed this week, counting both to-do completions
and Canvas mark-done actions; focus hours this week; a day streak with a flame icon for
consecutive days with at least one completed task or focus session, tracked under
`lv-streak`; and a week-over-week delta. Totals under an hour show as minutes rather than
rounding to `0h`, and hitting a new longest streak fires confetti.

Two bugs worth recording here, because both were invisible rather than loud. The weekly
focus total read `durationMs` while the timer writes `durationSec`, so **every session
counted as zero** and the card showed `0h` no matter how much you had focused; the Study
Time panel was unaffected, since it always read the right field. And the card had an
infinite render loop: `todos` and `canvasAssignments` default to `[]`, and a default
parameter builds a *new* array every render, so the refresh callback's identity churned,
its effect re-ran, set state and rendered again without end. It stayed quiet only because
`page.js` happens to pass memoised arrays; any caller omitting a prop or passing a literal
would have spun the tab. The state update now bails out when nothing changed, which breaks
the cycle regardless of what callers do.

---

## Search, agenda and shortcuts

### Search

Search across events, tasks, Canvas assignments, notes and custom-list items, with scope
and status filters. Results are grouped by type in a split layout. Clicking a result jumps
the calendar to that event's date and week, opens the preview, and keeps the calendar on
that date when you close it. Due dates get smart relative labels, the last five queries
are kept locally as re-runnable chips with a Clear button, a collapsible From / To range
filters every result type at once, and arrow keys move focus through results with Enter to
open.

On mobile, search is a full-screen tab rather than an overlay, and the query resets each
time you enter it; desktop keeps the `Ctrl+K` popup.

### Agenda

A condensed 14-day list in its own tab, covering your events, dated tasks, Canvas
assignments and class meetings, grouped by day. Day headers read Today, Tomorrow, or the
full weekday and date, and items sort chronologically within each day with timed events
before all-day and due-date items. A colour-coded left stripe and icon match each item's
category. Clicking opens the right editor for the kind of thing it is.

**Overdue work is pinned at the top** under its own red heading, ordered oldest-first —
most late is most urgent — with each row showing how late it is (*Yesterday*, *4 days
ago*, *Last week*). It covers tasks, Canvas assignments, custom lists and list items. Past
*events* are excluded: an event that already happened is not overdue, it just happened. It
gets its own group rather than sitting in the past days it belongs to, because the agenda
starts at Today and those days would fall above the fold in reverse-urgency order.
Completed, done and hidden items stay gone.

### Keyboard shortcuts

Single keys, anywhere outside a text field:

| Key | Action |
| --- | --- |
| `N` | New event |
| `T` | New task |
| `W` | New note — `N` was taken, so notes use *write* |
| `←` / `→` | Previous / next period on the calendar: a day, a week or a month, matching the view |
| `/` or `?` | Toggle the shortcuts overlay |
| `Ctrl+K` | Search |
| `F` | Toggle the focus timer |
| `Esc` | Close the topmost overlay |

The arrow keys use the same slide animation as swipe and trackpad paging, and stand down
for modifier combos so browser-back and text selection still work. Every shortcut is
suppressed while typing in an input, textarea or contenteditable, and while a blocking
modal is open — except `Esc`, which always works.

### Today at a glance

`/today` is a deliberately small, chrome-free, read-only page: overdue work, today's
schedule, and what is due. No nav, no editing.

It is built to be *looked at* rather than used — pin it to a home screen as its own icon,
park it in a tablet split-screen or iPad Slide Over, or open it from the daily push. It
reads straight from `localStorage`, so it paints instantly and works with no network,
neither of which a full app boot can promise, and it live-updates through the `storage`
event so editing in the main app next door is reflected without a refresh.

Everything it shows comes from [`lib/glance.js`](src/lib/glance.js), shared with the daily
push and the icon badge, so the three can never disagree about what today looks like.

### App icon badge

Where the browser and OS support it — Android Chrome, desktop Chrome and Edge — the app
icon shows a numeric badge equal to overdue plus due-today tasks and Canvas assignments,
clearing when everything is done. Overdue is included deliberately: a badge that drops to
zero while late work is still outstanding is actively misleading. It uses the
[Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API) and is
silently ignored where unsupported.

---

## Installing it

Luminae Vigila is a fully installable PWA, Android-first.

**Android Chrome** is the recommended path. Open
[luminae-vigila.vercel.app](https://luminae-vigila.vercel.app), tap **Add** when the *Add
to Home screen* banner appears — or choose *Install app* from the ⋮ menu at any time. It
installs as a standalone icon with no browser chrome, and background push works once you
grant notification permission.

**iOS Safari** is secondary: Share → *Add to Home Screen*. The app then runs standalone
and supports push on iOS 16.4+.

**Desktop Chrome and Edge** show an install icon in the address bar.

### Home-screen shortcuts

Long-press the installed icon for **Today**, **New task**, **Start focus** and **New
note**. The task and focus entries deep-link through query flags (`/?new=task`,
`/?focus=1`) which are stripped with `replaceState` once handled, so a refresh does not
reopen the modal.

Android reads `shortcuts` and `share_target` **at install time**, so remove and re-add the
PWA after deploying to see new entries.

### Publishing to Google Play

To distribute through a Trusted Web Activity, using
[PWABuilder](https://www.pwabuilder.com) or
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap):

1. **Generate the signed AAB.** PWABuilder is easiest — paste the URL and download the
   `.aab`. Both tools output the signing key details needed below.
2. **Fill in Digital Asset Links.** Replace the placeholders in
   `public/.well-known/assetlinks.json` with your `package_name` (for example
   `org.luminae.vigila`) and the SHA-256 fingerprint of your signing keystore, shown
   during the build or via `keytool -list -v -keystore release.jks`.
3. **Deploy and verify.** `https://your-domain/.well-known/assetlinks.json` must be
   publicly accessible with no redirect and `Content-Type: application/json`. This is what
   tells Android Chrome the TWA is verified, which is what removes the URL bar.
4. **Ship real PNG icons.** `public/icon-192.png` and `public/icon-512.png` are already
   referenced by the manifest. The SVG entry is fine for browser installs, but Play
   requires at least a 512px PNG.
5. **Play Console requirements.** A privacy policy URL and a completed data-safety form
   are needed before the listing can go live.

More detail in [docs/TWA-ANDROID-WIDGET.md](docs/TWA-ANDROID-WIDGET.md).

---

## Appearance

**Accent colours** — six palettes in Settings: Luminae Blue (the default), Violet,
Emerald, Rose, Amber and Slate. The accent is a `data-accent` attribute on `<html>`, saved
as `lv-accent`, with a before-paint inline script in `layout.js` restoring it before the
first render so there is never a flash of the wrong colour.

**Light, System and Dark** sit in one segmented control, and switching eases the whole app
from one palette to the other over 320ms instead of snapping.

It needed doing because the theme is a swap of CSS custom properties on `<html>`, and
custom properties are not animatable — every surface, border and label repainted in a
single frame, which reads as a flash rather than a mode change. Dark mode inverts nearly
the entire viewport, so it is the one palette change big enough for that to hurt.

The transition is temporary rather than permanent. A standing `transition` on background
and text colour would animate the first paint after hydration, so the app would fade in
from unstyled on every load, and would put a 320ms tail on every ordinary hover and focus
change for the rest of the session. Instead a `theme-transition` class goes onto `<html>`
for the duration of the switch and comes straight back off. It uses `!important`
deliberately: for those few hundred milliseconds the rule has to beat the per-component
`transition` declarations scattered through the app, and it is scoped to a class that only
exists mid-switch, so nothing else pays for it.

Only cheap properties animate — `background-color`, `background-image`, `border-color`,
`color`, `fill`, `stroke`. `box-shadow` and `transform` are left out, because the calendar
grid can hold thousands of nodes and animating shadow across all of them at once is the
one thing that would drop frames. `prefers-reduced-motion` gets the instant swap, since a
full-page cross-fade is precisely the large-area movement that setting exists to suppress;
the theme still changes, it just changes immediately. Rapid toggling is safe: the pending
removal timer is cancelled and restarted on each switch, so an earlier toggle cannot strip
the class off a later one mid-animation, and the timer is cancelled on unmount.

The Settings control had always offered a **System** option, but `ThemeProvider` was
mounted with `enableSystem={false}`, so choosing it set a value `next-themes` then ignored
— the button looked selected while the app stayed on whatever it had been. System now
genuinely follows the OS setting.

**Motion elsewhere** — note rows slide in on creation and when filtering, and collapse
horizontally on delete so removal reads as removal rather than a jump cut, with the
parent's delete held about 200ms so there is something left to animate. Panels and the
editor fade in on open, and the editor is keyed on note id so the fade replays per note.
All of it is disabled under `prefers-reduced-motion`.

**Offline indicator** — a pill in the bottom-right corner appears when connectivity drops,
reading *Offline — changes will sync when you reconnect*, and briefly shows *Back online*
for two seconds on reconnect. It uses the `online` / `offline` events with
`navigator.onLine` for initial state.

**Error boundaries** — every major panel is wrapped, so a crash shows an in-app recovery
card rather than a blank screen, and panels fail independently while the rest of the app
keeps working.

**Onboarding** — a four-step first-run wizard: welcome, Google Calendar, Canvas, and a
quick tour of Calendar, To-Do, Corvus and the focus timer. It is skippable at any step,
never shows again after dismissal, and can be re-triggered from *Show tour* in Settings.

**Responsive** — desktop gets the full sidebar, tablet a mini-sidebar with labels, mobile
a bottom tab bar. The layout uses `100dvh` so the tab bar stays fully visible on real
devices, horizontal swipes advance and retreat weeks without triggering event creation, and
the mobile Settings tab exposes Google, Canvas, the class schedule, sign-in, theme, accent
and import/export. There is also a live weather widget backed by Open-Meteo, and a mini
month navigator in the desktop sidebar for jumping the calendar to a date.

**Up next in the sidebar** — under the sidebar clock sits a small card naming the next
thing you have to be at: *In 12m — Organic Chemistry*, with the room underneath when the
item carries one. It looks at the rest of today first and falls back to the first timed
thing tomorrow, labelled *Tomorrow*, so the card is not blank all evening.

Class periods count. The card originally merged only your own events and Google Calendar,
which made it quietly wrong for the item most likely to be next: it would announce a 4pm
club meeting while saying nothing about the 9am lecture. Class entries are already
expanded into individual meetings for the calendar, with cancellations dropped and
one-offs and exams folded in, so the card reads that same list and anything hidden from
the calendar is hidden here too by construction. The room rides along, because *where* is
the useful half of "you have Chem in 10 minutes". All-day items are excluded: "In 4h" is
meaningless for something with no time, and an all-day marker would sit in the card all
day pushing the real next thing out of it. Today is decided locally rather than in UTC —
the card used to compute it with `toISOString()`, which rolls over mid-evening west of
UTC, so after about 8pm Eastern it compared tonight's events against tomorrow's date,
found nothing, and jumped to the *Tomorrow* fallback while you still had somewhere to be.

---

## Keeping Neon usage down

Storage is not the constraint — the whole database is about 9MB against Neon's 0.5GiB free
allowance. What costs money is **compute time**, and compute suspends only after a period
of idleness. *Any* query resets that timer, so the bill is driven by how often the app
talks to the database rather than how much it asks for. The reminder cron is pinged every
minute, which used to mean the database never got to idle at all: roughly 720 hours a
month of billed compute, whether or not a single reminder existed.

### The every-minute cron no longer touches the database

This was the whole bill, and it is fixed without giving up minute-level accuracy and
without adding a second service.

A scan already learns when the *next* reminder is due, because the fire times are right
there in the candidate list it just read. So it remembers the earliest one still ahead of
it, and every tick before that time returns immediately with no connection opened at all.
The endpoint still answers 1,440 pings a day; on a normal day only a handful of them are
scans.

Two things force a scan anyway. **A reminder actually coming due** — the cache is
precisely the time it must stop skipping, so a reminder already on the books can never be
missed by a skipped tick, and it wakes a minute early so the send is not a tick late. And
**a 30-minute cache expiry**, because a reminder created *after* the last scan is
invisible to a remembered watermark, so the cache has a hard lifetime. That is the one real
cost of the design, and it is bounded: a reminder created less than 30 minutes before it
fires, on a device that is then closed, can be up to that late. Creating a reminder means
an open tab, and an open tab runs its own 60-second check, so the case where the cron is
the only mechanism in play is the narrow one. `POST /api/sync` also drops the cache when it
writes anything reminder-bearing, which closes the gap whenever the two routes land on the
same serverless instance.

The heartbeat that `/api/push/status` reads moved too. It was an `INSERT … ON CONFLICT` on
*every* ping — a write a minute is enough to keep the compute endpoint awake by itself,
which would have made the skip pointless. It is now stamped only on ticks that scan, so it
means "last scanned at", and the staleness threshold allows for the 30-minute scan cadence
instead of the ping cadence.

Cold starts always scan: module state dies with the process, and no information is never a
reason to skip. See [`lib/reminderWindow.js`](src/lib/reminderWindow.js).

### The rest of it

- **DDL on every single request.** The self-healing-schema pattern is good — a fresh
  database works with no manual migration — but it was being re-issued per request.
  Postgres skips the create, yet the Neon driver still pays a full HTTP round trip to find
  that out. The reminder cron spent two round trips a minute proving its tables existed,
  and `/api/sync` spent four per call, on both GET and POST. `lib/ddlOnce.js` memoizes
  each migration per process: a cold start pays once, warm requests pay nothing, and a cold
  start is exactly when it might genuinely be needed.
- **Three queries where one would do.** The reminder cron read `events`, `todos` and
  `notes` in three separate round trips and threw most of the rows away in JS. It is now a
  single `UNION ALL` with `data ? 'reminder'` filtering in Postgres, so the wire carries
  only rows that could actually fire.
- **Housekeeping on the hot path.** The `sent_reminders` purge ran on every tick — 1,440
  DELETEs a day to remove rows that are only ever a week old. It now runs every six hours.
  The orphan-image reaper ran on every sync to discover nothing was 30 days old yet; now
  hourly.
- **A query on every page load, to read the cookie back.** `/api/auth/me` is the first
  thing every page load calls, and it was doing `SELECT id, email FROM users` to fetch the
  two values the session cookie had just been issued from. The email is now a signed claim
  on the cookie, so the common path answers with no database access. Cookies issued before
  the claim existed still fall back to the query — they are valid for 30 days, and the next
  sign-in re-issues one that never needs it.
- **Nine queries per pull.** `GET /api/sync` read its nine collections as nine concurrent
  queries, and the Neon HTTP driver sends each one as its own request, so a pull of a few
  hundred small rows opened nine of them every couple of minutes for as long as a tab was
  open. It is one `UNION ALL` tagged with the collection name now.
- **Every push rewrote every row.** `POST /api/sync` answered each array it received with a
  `DELETE` and then one `INSERT` per row, so changing one word in one note made Postgres
  write *every* note the account owned: new tuples, WAL for all of them, and that many dead
  tuples for autovacuum to come back for. It is now two statements per collection — a
  set-based upsert from one JSONB parameter with `WHERE data IS DISTINCT FROM
  EXCLUDED.data`, so an unchanged row costs a comparison instead of a write, and a
  `DELETE … WHERE id NOT IN (…)` that keeps the replace-not-merge contract the client
  relies on. The statement count no longer grows with your history, only with the number
  of collections you touched.

Net effect: a reminder tick that finds nothing due went from **8 round trips to 0**. A warm
`/api/sync` GET went from 13 to 1, and a warm POST that changes one note went from roughly
one-plus-one-per-note to two statements and one row written. A page load no longer wakes
the database to find out who you are.

### Missing per-user indexes

Every synced table is `PRIMARY KEY (id, user_id)` — note the column **order**. A composite
btree can only serve a *prefix* of its columns, so an `(id, user_id)` index cannot answer
`WHERE user_id = $1`, which is how essentially every read in the app is shaped. `EXPLAIN
ANALYZE` confirmed sequential scans on `events`, `todos` and `notes`.

At one user and around 120 rows that is microseconds, so this is insurance rather than an
emergency — it stops the per-minute cron reads getting linearly more expensive as history
accumulates. `schema.sql` declares them. To apply to an existing database:

```sql
CREATE INDEX IF NOT EXISTS idx_events_user           ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user            ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user            ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user   ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_lists_user     ON custom_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_event_categories_user ON event_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_categories_user  ON todo_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_note_images_user      ON note_images(user_id);
CREATE INDEX IF NOT EXISTS idx_class_schedule_user   ON class_schedule(user_id);
```

`class_schedule` was missed when that list was first written, and it is the one the
reminder cron reads on every scan to resolve per-class reminder rules.

### What the numbers look like on the Free plan

The Free plan pins autosuspend at five minutes and does not let you edit it — the control
is greyed out, and scale-to-zero is always on. That is the number the design above targets,
and there is nothing to configure. It is also why the cron mattered so much: five minutes
is a short window, and a query a minute meant it never once elapsed.

At 0.25 CU, the smallest compute, against the Free plan's ~191.9 CU-hour allowance:

| | Compute awake | Cost |
|:---|:---|:---|
| Before — a query every minute | ~100% of the month | ~183 CU-h, about 95% of the allowance, spent finding nothing due |
| After — scans at least every 30 min | ~17%, five minutes awake per scan | ~31 CU-h |
| Plus a **visible** tab's pull loop | while you are actually looking at it | ~20–25 CU-h at a few hours a day |

Call it 50–60 CU-hours a month against 191.9 — roughly 3× headroom where there used to be
5%.

Note the word *visible* in that last row. The pull loop stops entirely when the tab is
hidden or the window is minimised, so a browser left open for a week costs nothing unless
you are looking at it, and when you are, freshness is what you want. What is left is
proportional to real use, which is the right shape.

One setting lives outside the repo: the cron-job.org reminder job. Keep it at one minute.
The endpoint is cheap to ping now, and the ping interval is still what sets reminder
accuracy, so there is no longer a reason to trade one for the other.

### If you need a bigger cut

1. **Raise `MAX_SKIP_MS`** in [`lib/reminderWindow.js`](src/lib/reminderWindow.js). It is
   the floor on how often the database is woken when nothing is happening, traded directly
   against how late a just-created reminder can be when the app is closed.
2. **Lengthen the idle poll back-off.** `AUTO_SYNC_IDLE_MAX_MS` in `src/app/page.js` caps
   how far apart a *visible* tab's pulls get, currently four minutes. Since the Free plan
   autosuspends at five, raising it past that would let an idle visible tab sleep between
   pulls. Weigh it against the case the constant exists for: a tab you are looking at,
   waiting for the edit you just made on your phone.
3. **Move the watermark out of process memory.** The 30-minute cache expiry exists only
   because module state dies with a serverless instance. A watermark in something that does
   not bill compute-hours — Upstash Redis' free tier covers this easily — would let the skip
   last until the actual next due time, at the cost of one more service and an environment
   variable.
4. **Vercel Pro** removes the reason the pinger is external in the first place, but does
   nothing about Neon compute on its own.

---

## Where data lives

| Data | Where |
|:---|:---|
| Events and tasks | `localStorage`, no account needed; Neon when signed in |
| Custom lists and items | `localStorage` (`lv-custom-lists`) + Neon per user |
| Notes and note images | `localStorage` (`lv-notes`) + Neon (`notes`, `note_images`) |
| Per-event display prefs | `localStorage` + Neon (`event_prefs`) |
| Class schedule | `localStorage` + Neon (`class_schedule`) |
| Study sessions | `localStorage` (`lv-study-sessions`) + Neon per user |
| Search history | `localStorage` (`lv-search-history`) |
| Focus timer settings | `localStorage` (`lv-focus`) |
| Accent colour | `localStorage` (`lv-accent`) |
| Onboarding completion | `localStorage` (`lv-onboarding-done`) |
| Canvas seen-ids (notification diff) | `localStorage` (`lv-canvas-seen-ids`) |
| GPA credit hours and grade overrides | `localStorage` (`lv-gpa`) |
| Streak ledger | `localStorage` (`lv-streak`) |
| Notes grouping and furl state | `localStorage`, deliberately not synced |
| Google Calendar tokens | Neon, per user |
| Google calendar show/hide and colours | Neon (`google_calendar_prefs`), keyed by email so they survive a reconnect; `lv-google-prefs` is a read cache |
| Canvas credentials | Neon, per user |
| Push subscriptions | Neon, per user and device |
| Digest opt-in | Neon (`users.digest_enabled`) |
| User accounts | Neon, created on first sign-in |
| Session | httpOnly cookie `lv_session`, JWT, 30-day expiry |

Google Calendar and Canvas data is never stored server-side long-term. Tokens are used to
fetch on demand, and results are held in React state and cached to `localStorage` for fast
reloads.

---

## Development

| Piece | What |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org), App Router, React 19 |
| Styling | Tailwind CSS 4 via `@tailwindcss/postcss`, [next-themes](https://github.com/pacocoursey/next-themes) |
| Database | [Neon](https://neon.tech) serverless Postgres (`@neondatabase/serverless`) |
| Calendar | [FullCalendar 6](https://fullcalendar.io) — daygrid, timegrid, interaction |
| Notes editor | [Tiptap 3](https://tiptap.dev) on ProseMirror |
| Assistant | [Groq](https://groq.com) (`groq-sdk`), `openai/gpt-oss-120b` by default |
| Integrations | Google Calendar (`googleapis`), Canvas LMS REST API and ICS feed |
| Push | `web-push` with VAPID, driven by an external one-minute cron |
| Auth | Google OAuth 2.0, [jose](https://github.com/panva/jose) JWT sessions in an httpOnly cookie |
| Icons | [Lucide](https://lucide.dev) |
| Tests | Vitest, Testing Library, jsdom |
| Hosting | [Vercel](https://vercel.com) |

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run lint       # eslint
npm test           # vitest run
npm run test:watch
```

### Tests

```bash
npm install   # node_modules is not committed
npm test
```

Tests live beside the code they cover. Pure logic in `src/lib/` has a `<name>.test.js`
next to it; component tests sit beside their component as `<Name>.test.jsx` and opt into
jsdom with a `@vitest-environment jsdom` docblock, so the default environment stays `node`
and the pure-logic suite does not pay for a DOM.

The suite runs with `TZ=America/New_York`, pinned in `vitest.config.js`, so
timezone-sensitive logic is exercised deterministically rather than passing by accident on
a UTC runner. That matters more than it sounds: a recurring theme in this codebase is
`toISOString()` silently meaning "tomorrow" after about 8pm Eastern, and several of the
tests exist specifically to pin the evening-rollover case.

The areas carrying the most test weight, because they are where a silent bug costs data:

- **Merge and sync** — `tombstones`, `todoMerge`, `customLists`, `eventPrefs`,
  `syncDelta`, `syncRows`. Between them these pin a delete beating a stale copy in either
  direction, an edit-after-delete winning, manual refresh never resurrecting a local
  delete, two devices ticking different occurrences of one recurring task both surviving,
  an untick beating a stale tick, legacy unstamped rows unioning, subtask tombstones
  surviving a round trip through the edit modal, and a restored backup winning the next
  merge.
- **Dates** — `localDate`, `dateShift`, `eventSpan`, `todoBuckets`. Local-versus-UTC
  derivation, whole-day arithmetic across DST and leap days, and the two opposite
  end-date conventions for all-day and timed events.
- **Import and export** — `backup`, `icsExport`, `ics`. Including a round trip: what
  `icsExport` writes is read back by `parseIcs`, the same reader the Canvas feed uses.
- **Domain logic** — `recurrence`, `classInstances`, `classCalendar`, `classLinks`,
  `classReminders`, `classCategories`, `grades`, `priority`, `glance`, `maps`,
  `reminderWindow`, `dbErrors`, `googleMirror`, `googlePrefs`, `notes`, `noteImages`.

New logic in `src/lib/` should come with a test beside it, matching the style of the
existing ones.

### Lint

```bash
npm run lint
```

The React Compiler lint rules were adopted after most of this code was written, so there
is a standing backlog. It went from 79 errors to 29 by fixing what were genuine defects.

The remaining ones are not believed to be bugs, and are left unsilenced rather than
blanket-disabled, since a disable comment would make the count read clean without making
the code better. Most are `react-hooks/set-state-in-effect`, and nearly all of those are
"read `localStorage`, `navigator` or the DOM on mount, then `setState`". A lazy `useState`
initializer would be the usual fix, but these are Client Components that Next.js still
server-renders, so touching `localStorage` during the initializer throws on the server and
mismatches on hydration. The effect is the correct pattern here; the rule is being
conservative. The rest are TDZ and purity flags on deferred calls — functions referenced
above their own declaration, safe as written but worth reordering if those files are
refactored.

The derived-state cases in that group have been converted individually. `TimePicker` in
particular kept `hour`, `minute` and `period` in state and copied the `value` prop back
into them through an effect, so the state was never the source of truth, only a lagging
cache that disagreed with the prop for one render on every change.

### Date and time pickers

Both pickers position themselves through the shared `useAnchoredPosition` hook
([`lib/useAnchoredPosition.js`](src/lib/useAnchoredPosition.js)) rather than doing their
own arithmetic, because they were getting it wrong in the same two ways.

They are measured rather than guessed: `DatePicker` used a hardcoded 360px estimate of its
own height to decide whether to flip above the trigger, which near the top of the screen
produced a **negative** `top` and made the calendar's first weeks unreachable. The hook
reads the real `offsetHeight` and re-reads it through a `ResizeObserver` as the content
changes. It flips only when flipping helps, since opening upward into an equally cramped
space just moves the problem. It clamps on both axes, because neither picker clamped
horizontally and a trigger near the right edge pushed a fixed-width popover past it; when
neither side fits at all the popover is clamped into view and given a `maxHeight` so it
scrolls instead of spilling. `TimePicker` is now portaled to `document.body` like
`DatePicker` — it used to be `position: absolute` inside the trigger's wrapper, so any
scrolling ancestor clipped it and it could only ever open downward. Outside-click
detection tests the popover *and* the trigger, so tapping the clock face no longer counts
as clicking away. Everything recalculates on scroll captured on any ancestor, on resize,
and on `visualViewport` resize, which is what actually fires when a mobile keyboard opens.

`TimePicker` offers the same time two ways, a text field and a radial clock, and both were
awkward in ways that pushed you to the other one.

Typing: the field opens empty with a placeholder rather than pre-filled, because it used
to open holding `3:30 PM` with the caret dropped mid-string, so the first keystroke
appended to it. The parser accepts how people actually type a time — `330p`, `1530`,
`930`, `3.30 pm`, `3:5`, `7 45`, `3h30`, `p.m.` with the dots, plus `noon` and `midnight`
— where it used to accept three tidy shapes only and revert silently on blur with nothing
to say why. It shows what your text will become in grey beside the field as you type, so
`330p` is confirmed as *3:30 PM* before it commits. Text it cannot read is marked red and
kept rather than discarded, and opening the clock mid-edit commits the text rather than
throwing it away. Digits typed on the clock face advance by themselves: `9` is a complete
hour and moves to minutes, `1` waits for a second digit, and `13`–`23` in the hour box is
read as 24-hour time and flips to PM rather than being rejected. The advance is
synchronous, because on a timer, typing `930` quickly landed the `3` while the hour box
was still up, where it read as hour `93` and was thrown away.

The clock face: it works on a touchscreen now, having set `touchAction: 'none'` while
listening only for `mousedown`/`mousemove`, so dragging the hand did nothing on a phone —
the one device where a radial clock is the better input. It is on pointer events with
pointer capture, so the drag also survives your finger leaving the dial. There is a dead
zone in the middle, because a press near the centre has no meaningful angle and used to
snap the hand to whatever `atan2` returned. Minutes are not locked to multiples of five:
the ring used to snap to the twelve labels, which made 7:20 easy and 7:22 impossible
without typing, so minutes now resolve to the exact minute under the pointer and snap to a
label only when you are on one, with an off-label minute drawing the hand at its true
angle with a dot at the tip. Keyboard works throughout — `↑`/`↓` nudge the selected field
and `⇧` makes it five minutes, `←`/`→` switch between hours and minutes, `a`/`p` set
AM/PM, digits start typing, `Esc` cancels a half-typed entry and then closes, `Enter`
accepts — and on the closed field `↑`/`↓` nudge by five minutes without opening anything.

### Project structure

```
schema.sql                  # Source of truth for the database
proxy.js                    # Next.js 16 route-level middleware
vercel.json                 # Cron schedules
scripts/gen-icons.mjs       # Regenerates the PWA icons
docs/
├── NOTIFICATIONS.md        # Push setup, cron wiring, troubleshooting
└── TWA-ANDROID-WIDGET.md   # Play Store / TWA notes
public/
└── sw.js                   # Service worker — push events and notification clicks

src/
├── app/
│   ├── api/
│   │   ├── auth/           # Google sign-in, logout, current user
│   │   ├── google/         # Connect, callback, calendars, events, prefs, mirror, accounts
│   │   ├── canvas/         # Credential, courses, assignments, grades, calendar, ICS feed
│   │   ├── notes/images/   # Note image upload and per-id fetch
│   │   ├── push/           # Subscribe, send, test, status, reminders, daily, digest
│   │   ├── corvus/         # Groq chat endpoint
│   │   └── sync/           # GET pull / POST push for every synced collection
│   ├── page.js             # Main app shell, state and layout
│   ├── today/              # /today — read-only glance page
│   ├── login/              # Sign-in page
│   ├── share/              # Android share-target landing
│   ├── layout.js
│   ├── error.js
│   └── globals.css
│
├── components/             # All UI. Calendar, tasks, classes, notes, Corvus, timer,
│                           # settings panels, pickers, modals — tests beside them.
│
└── lib/                    # Domain logic and data access, with tests beside each module.
    ├── db.js               # The only place that talks to Neon
    ├── session.js          # JWT sessions via jose
    ├── auth.js             # findOrCreateUser
    ├── tombstones.js       # Soft-delete merge, shared by every id-keyed collection
    ├── todoMerge.js        # Row-level LWW plus the per-date completion register
    ├── customLists.js      # Custom lists, merged per item
    ├── eventPrefs.js       # Per-event display prefs, merged per entry
    ├── syncDelta.js        # Fingerprints collections so unchanged ones are not sent
    ├── syncRows.js         # Set-based upsert shaping for POST /api/sync
    ├── backup.js           # One list of what a backup contains
    ├── icsExport.js        # ICS serializer, pinned by a round trip through parseIcs
    ├── ics.js              # ICS parsing for the Canvas feed and imports
    ├── eventSpan.js        # Which days an event covers
    ├── recurrence.js       # Event and task recurrence expansion
    ├── classInstances.js   # Class meetings, with exceptions folded in
    ├── classLinks.js       # Section-to-class resolution
    ├── classReminders.js   # Per-class reminder rules
    ├── classCategories.js  # Classes as derived task categories
    ├── grades.js           # Points-based grade arithmetic
    ├── glance.js           # The today summary shared by /today, push and the badge
    ├── localDate.js        # Local-date helpers; the answer to every toISOString bug
    ├── reminderWindow.js   # The watermark that keeps the cron off the database
    ├── googleMirror.js     # Writing out to the luminaeVigila Google calendar
    ├── maps.js             # Classifying a location string
    └── dbErrors.js         # Naming a Neon 402 as spent allowance
```

### Working on it

Both `npm run lint` and `npm test` should pass before a commit. Branch names are `feat/`,
`fix/` or `chore/` plus a short kebab-case description, and nothing goes straight to
`main`.

A database change means writing the DDL into `schema.sql`, which is the source of truth,
and running the same statement against Neon. Every migration is written so that re-running
it is safe.

Update this file whenever a user-visible behaviour changes. It is detailed on purpose: it
explains why something behaves the way it does, not just that it does, and most of the
entries above exist because the reasoning was not obvious the second time either.
