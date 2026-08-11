-- luminaeVigila database schema
-- Run this once against your Neon PostgreSQL database.
-- Neon dashboard → SQL Editor, paste and run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        UNIQUE NOT NULL,
  -- Sunday week-ahead digest opt-in. Per account, not per device: a weekly summary
  -- is a preference about you, and the per-subscription version silently delivered
  -- to exactly one of your devices. Defaults on, matching daily_enabled.
  digest_enabled BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Created automatically by src/lib/pushSchema.js on any push route; listed here so
-- a hand-built database matches. If upgrading an existing install:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── Google OAuth accounts (one user can connect multiple Google accounts) ──
-- The first Google account is created automatically on sign-in.
-- Additional accounts can be connected from the Google Calendar settings.
CREATE TABLE IF NOT EXISTS google_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email  TEXT        NOT NULL,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  expires_at    BIGINT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, google_email)
);

CREATE INDEX IF NOT EXISTS idx_google_accounts_user_id ON google_accounts(user_id);

-- ── Canvas LMS credential (one per user) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS canvas_credentials (
  user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL,
  base_url   TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── User data sync ───────────────────────────────────────────────────────────
-- Local events, tasks, class schedule, and display prefs are synced here
-- so they follow the user across devices when signed in.

CREATE TABLE IF NOT EXISTS events (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS todos (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- User-editable calendar event categories (Class, Exam, Personal, …).
-- Seeded client-side from DEFAULT_EVENT_CATEGORIES on first run.
-- Created lazily on first sync (CREATE TABLE IF NOT EXISTS self-heals existing deploys).
CREATE TABLE IF NOT EXISTS event_categories (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS todo_categories (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS class_schedule (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- eventPrefs is a per-user JSON dictionary { eventId: { hidden, color } }
-- stored as a single row per user rather than one row per event
CREATE TABLE IF NOT EXISTS event_prefs (
  user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Custom Lists ──────────────────────────────────────────────────────────
-- Lightweight standalone checklists (e.g. Groceries, Packing, Ideas).
-- Each row stores a complete list object as JSONB: { id, name, emoji, items[] }.
-- Items are embedded directly in the list data — no separate items table needed.
-- Created lazily on first sync (CREATE TABLE IF NOT EXISTS self-heals existing deploys).
CREATE TABLE IF NOT EXISTS custom_lists (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ── Notes ─────────────────────────────────────────────────────────────────
-- Rich-text notes from the Notes tab. Each row is one complete note as JSONB:
-- { id, title, html, color, starred, pinned, tags[], linkedTo, reminder,
--   trashedAt, createdAt, updatedAt }
-- `html` is Tiptap output. Deletion is soft (trashedAt) with a 30-day window
-- enforced client-side, so a trashed note still round-trips through sync.
-- Created lazily on first sync (CREATE TABLE IF NOT EXISTS self-heals existing deploys).
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ── Study Sessions ─────────────────────────────────────────────────────────
-- Completed Pomodoro focus sessions logged by the Focus Timer.
-- Mirrors the client shape: { id, courseId, courseName, durationSec, date }
CREATE TABLE IF NOT EXISTS study_sessions (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- ── Push Subscriptions ──────────────────────────────────────────────────────
-- Web Push API subscription objects, one row per browser/device per user.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint       TEXT        NOT NULL,
  p256dh         TEXT        NOT NULL,
  auth           TEXT        NOT NULL,
  -- Deprecated: the digest opt-in moved to users.digest_enabled. Kept so existing
  -- databases stay valid; no code reads it. Dropping a column is unrecoverable.
  digest_enabled BOOLEAN     NOT NULL DEFAULT false,
  daily_enabled  BOOLEAN     NOT NULL DEFAULT true,
  -- getTimezoneOffset() of the subscribing device: minutes to ADD to local to
  -- reach UTC. Lets the daily glance summarise the reader's calendar day.
  tz_offset      INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- ── Sent Reminders ──────────────────────────────────────────────────────────
-- Dedup log so the server-side reminder cron (/api/push/reminders) sends each
-- reminder exactly once, even though the cron runs every minute. The key encodes
-- the item id AND its fire time, so rescheduling a reminder sends a fresh push.
CREATE TABLE IF NOT EXISTS sent_reminders (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_key TEXT        NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, reminder_key)
);

-- ── Cron Heartbeats ─────────────────────────────────────────────────────────
-- One row per scheduled job, stamped on every authorised run. Exists because a
-- cron being pinged with the WRONG secret is otherwise indistinguishable from a
-- cron nobody pings: both are silent, and Vercel injects CRON_SECRET into its own
-- crons, so rotating it breaks only the externally-driven reminder job — which
-- reads as "notifications work, reminders don't" and sends you hunting the device
-- rather than the scheduler. /api/push/status turns this into a sentence.
CREATE TABLE IF NOT EXISTS cron_pings (
  path          TEXT        PRIMARY KEY,
  last_success  TIMESTAMPTZ NOT NULL,
  success_count BIGINT      NOT NULL DEFAULT 1
);

-- If upgrading an existing install, run the CREATE TABLE above in the Neon SQL Editor.
