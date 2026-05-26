-- luminaeVigila database schema
-- Run this once against your Neon PostgreSQL database.
-- Neon dashboard → SQL Editor, paste and run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ── Push Subscriptions ──────────────────────────────────────────────────────
-- Web Push API subscription objects, one row per browser/device per user.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
