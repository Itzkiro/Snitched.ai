-- Platform Stats — centralised key-value store for live numbers.
-- Every stat has a unique key (e.g. "total_politicians") and a numeric value.
-- The sync-stats cron job refreshes these every 12 hours.

CREATE TABLE IF NOT EXISTS platform_stats (
  key         TEXT PRIMARY KEY,
  value       NUMERIC NOT NULL DEFAULT 0,
  label       TEXT,          -- human-readable label for UI
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Public read, service-role write
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON platform_stats
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON platform_stats
  FOR ALL USING (true) WITH CHECK (true);
