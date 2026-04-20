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
  contribution_breakdown  JSONB DEFAULT NULL, -- {aipac, otherPACs, individuals, corporate}
  individual_donor_breakdown JSONB DEFAULT NULL, -- per-donor pro-Israel registry crossref

  -- Status
  is_active       BOOLEAN DEFAULT true,
  is_candidate    BOOLEAN DEFAULT false,
  running_for     TEXT,
  years_in_office NUMERIC DEFAULT 0,
  bio             TEXT,
  term_start      TEXT,
  term_end        TEXT,

  -- Social / Source IDs
  social_media    JSONB DEFAULT '{}'::jsonb,
  source_ids      JSONB DEFAULT '{}'::jsonb,

  -- Data provenance
  data_source     TEXT,

  -- Lobbying, Voting & Court records (populated by sync scripts)
  lobbying_records JSONB DEFAULT NULL,
  voting_records   JSONB DEFAULT NULL,
  court_records    JSONB DEFAULT NULL,

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

-- ==========================================================================
-- 4. Social Posts table — stores scraped social media posts
-- ==========================================================================
CREATE TABLE IF NOT EXISTS social_posts (
  id              TEXT PRIMARY KEY,
  politician_id   TEXT REFERENCES politicians(bioguide_id),
  politician_name TEXT,
  platform        TEXT NOT NULL,
  handle          TEXT,
  content         TEXT,
  post_url        TEXT,
  posted_at       TIMESTAMPTZ,
  likes_count     INTEGER DEFAULT 0,
  shares_count    INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  views_count     INTEGER DEFAULT 0,
  sentiment_score NUMERIC,
  is_deleted      BOOLEAN DEFAULT false,
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_politician ON social_posts(politician_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_posted_at ON social_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_scraped_at ON social_posts(scraped_at DESC);

-- RLS for social_posts
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON social_posts
  FOR SELECT USING (true);

CREATE POLICY "Service insert access" ON social_posts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update access" ON social_posts
  FOR UPDATE USING (true);

CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ==========================================================================
-- 5. Scrape runs table — tracks daemon scrape cycles for monitoring
-- ==========================================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
  id          SERIAL PRIMARY KEY,
  run_type    TEXT NOT NULL DEFAULT 'social_media',
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status      TEXT DEFAULT 'running',
  posts_found INTEGER DEFAULT 0,
  posts_new   INTEGER DEFAULT 0,
  errors      INTEGER DEFAULT 0,
  log         JSONB DEFAULT '[]'::jsonb,
  metadata    JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_type ON scrape_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started ON scrape_runs(started_at DESC);

ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON scrape_runs
  FOR SELECT USING (true);

CREATE POLICY "Service insert access" ON scrape_runs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update access" ON scrape_runs
  FOR UPDATE USING (true);
