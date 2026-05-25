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
