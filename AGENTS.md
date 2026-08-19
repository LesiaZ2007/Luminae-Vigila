<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Luminae Vigila

An all-purpose student planner: calendar, tasks, notes, and an AI assistant in one
minimal interface. Works fully offline without an account; signing in syncs across
devices. Deployed on Vercel at `luminae-vigila.vercel.app`.

## Stack

| Piece | What |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), `next-themes` for light/dark |
| Database | Neon serverless Postgres (`@neondatabase/serverless`) |
| Calendar UI | FullCalendar 6 (daygrid / timegrid / interaction) |
| Notes editor | TipTap 3 |
| AI assistant | Groq (`groq-sdk`) — the in-app assistant is "Corvus" |
| Integrations | Google Calendar (`googleapis`), Canvas LMS via ICS feed |
| Push | `web-push` (VAPID), driven by a Vercel cron |
| Auth | `jose` JWT sessions in an httpOnly cookie |
| Tests | Vitest + Testing Library + jsdom |

## Layout

- `src/app/` — App Router pages (`page.js` is the planner, `today/`, `login/`, `share/`)
- `src/app/api/` — route handlers: `auth/`, `google/`, `canvas/`, `corvus/`, `notes/`,
  `push/`, `sync/`
- `src/components/` — all UI components
- `src/lib/` — domain logic and data access. Tests live beside their source as
  `<name>.test.js`. `db.js` is the only place that talks to Neon.
- `schema.sql` — **the** source of truth for the database
- `docs/` — deeper notes on notifications and the Android TWA widget
- `scripts/gen-icons.mjs` — regenerates PWA icons
- `README.md` — user-facing feature documentation, kept current with every change

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # production build
npm run lint     # eslint
npm test         # vitest run (one-shot)
npm run test:watch
```

## Before you commit

`npm run lint` and `npm test` must both pass. If a test fails, fix it or say plainly
that it fails and why — never commit over a red suite and never report work as done
without having run these.

New logic in `src/lib/` should come with a `.test.js` beside it, matching the style of
the existing ones.

## Restarting the dev server

Restart it whenever you change something, so the change is visible locally.

This repo lives inside OneDrive, which intermittently holds a lock on `.next` and makes
Next.js fail with `EPERM`. The reliable sequence:

1. Stop the running server. Next 16 refuses to start a second dev server and prints the
   PID of the existing one — `taskkill /PID <pid> /F`.
2. If the next start fails with `EPERM`, delete `.next` and start again.
3. `npm run dev`.

Redirecting the dev server's output to a file is a common way to leave junk in the repo
root — `*.log` is gitignored, but write logs somewhere outside the repo when you can.

## Windows / OneDrive

The primary shell is PowerShell — `&&`, `||`, and ternaries are not available in
Windows PowerShell 5.1; use `;` with `if ($?) { }`. A Bash tool is available for POSIX
scripts, but the two take different syntax, so don't mix them in one command.

Quote every path containing spaces (`OneDrive\Documents\...` is fine, but the repo sits
under a user profile path that often has them elsewhere).

**Git worktrees must be created outside OneDrive** — use the system temp directory.
Worktrees inside the synced folder get corrupted by OneDrive's file locking.

## Branches and commits

- Branch names: `feat/`, `fix/`, or `chore/` + a short kebab-case description.
- Never commit directly to `main`. Branch first, even for a one-line change.
- Commit as you go with descriptive messages, then push. Delete the branch once merged —
  stale merged branches pile up fast here.
- **Commits are authored by Lesia and credited to her.** Do not add a
  `Co-Authored-By: Claude` trailer and do not add a "Generated with Claude Code" footer
  to commits or PR bodies.
- Push to GitHub without being asked. Do ask before anything harder to reverse
  (force-push, history rewrite, deleting a remote branch, touching production data).

## Delegating to subagents

Aim for the highest quality result while conserving usage. Those pull in opposite
directions, so:

- Work solo on single-file changes, bug fixes, and anything under a few files. Fan-out
  costs more than it saves at that size.
- Spawn parallel agents only for **3+ genuinely independent** features that touch
  disjoint files. Give each its own branch, then review and merge their work yourself —
  they are not the final word on their own output.
- Merge into an integration branch when several land at once, verify the whole thing
  builds and tests green there, then merge to `main`.

## Things that need Lesia to act

You cannot touch the Neon console or Vercel's settings. When a change requires either,
stop and say so explicitly, with the exact thing to paste:

- **Database changes** — write the DDL into `schema.sql` (source of truth) *and* hand
  over the copy-pasteable SQL to run against Neon. Say which it is: a new table, a
  column added to an existing one, or a backfill.
- **Environment variables** — name the variable, its purpose, and which environments
  need it, so it can be added in Vercel and mirrored into `.env.local`.
- **Cron jobs** — `vercel.json` holds the schedule; note when a new one is added.

Never commit secrets. `.env*` and `/data/` (Google OAuth token store) are gitignored and
must stay that way.

## Style

Match the app's existing look and voice — the deep-navy/slate palette, the restrained
spacing, the lowercase-ish minimal chrome. Read neighbouring components before adding a
new one rather than inventing a new pattern.

Update `README.md` whenever you add or change a user-visible feature. The README is
unusually detailed on purpose: it explains *why* a behaviour is the way it is, not just
that it exists. Match that depth.
