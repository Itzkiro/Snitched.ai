-- Snitched.ai — Supabase Schema
-- Matches the actual table in production.
-- Run this in the Supabase SQL Editor if recreating.

-- ==========================================================================
-- 1. Politicians table
-- ==========================================================================
CREATE TABLE IF NOT EXISTS politicians (
  -- Our app-level unique ID (e.g. "fl-sen-marco-rubio", "vol-council-1")
  bioguide_id   TEXT PRIMARY KEY,

  -- Core fields
  name          TEXT NOT NULL,
  office        TEXT NOT NULL,
  office_level  TEXT NOT NULL,
  party         TEXT NOT NULL,
  district      TEXT,
  jurisdiction  TEXT NOT NULL,
  jurisdiction_type TEXT NOT NULL,
  photo_url     TEXT,

  -- Corruption / Scoring
  corruption_score        NUMERIC DEFAULT 0,

  -- Funding
  aipac_funding           NUMERIC DEFAULT 0,
  juice_box_tier          TEXT DEFAULT 'none',
  total_funds             NUMERIC DEFAULT 0,
  top5_donors             JSONB DEFAULT '[]'::jsonb,
  israel_lobby_total      NUMERIC DEFAULT 0,
  israel_lobby_breakdown  JSONB,

  -- Status
  is_active       BOOLEAN DEFAULT true,
  years_in_office NUMERIC DEFAULT 0,
  bio             TEXT,
  term_start      TEXT,
  term_end        TEXT,

  -- Social / Source IDs
  social_media    JSONB DEFAULT '{}'::jsonb,
  source_ids      JSONB DEFAULT '{}'::jsonb,

  -- Data provenance
  data_source     TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_politicians_name ON politicians (name);
CREATE INDEX IF NOT EXISTS idx_politicians_jurisdiction ON politicians (jurisdiction);
CREATE INDEX IF NOT EXISTS idx_politicians_party ON politicians (party);
CREATE INDEX IF NOT EXISTS idx_politicians_office_level ON politicians (office_level);

-- ==========================================================================
-- 2. Row Level Security — public read, anon write (for seeding/crons)
-- ==========================================================================
ALTER TABLE politicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON politicians
  FOR SELECT USING (true);

CREATE POLICY "Anon insert access" ON politicians
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update access" ON politicians
  FOR UPDATE USING (true);

CREATE POLICY "Anon delete access" ON politicians
  FOR DELETE USING (true);

-- ==========================================================================
-- 3. Updated_at trigger
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON politicians
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
