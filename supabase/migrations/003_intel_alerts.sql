-- Intelligence Alerts table — stores real-time findings from news monitor,
-- FEC filing tracker, and webhook events.

CREATE TABLE IF NOT EXISTS intel_alerts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type         TEXT NOT NULL,        -- 'news', 'fec_filing', 'scandal', 'lobby_filing'
  severity     TEXT DEFAULT 'info',  -- 'critical', 'high', 'medium', 'info'
  title        TEXT NOT NULL,
  summary      TEXT,
  url          TEXT,
  politician_id TEXT,                -- FK to politicians.bioguide_id (nullable)
  politician_name TEXT,
  amount       NUMERIC DEFAULT 0,
  source       TEXT,                 -- 'exa', 'fec', 'lda', 'manual'
  metadata     JSONB DEFAULT '{}'::jsonb,
  is_read      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_alerts_type ON intel_alerts (type);
CREATE INDEX IF NOT EXISTS idx_intel_alerts_created ON intel_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_alerts_politician ON intel_alerts (politician_id);

ALTER TABLE intel_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON intel_alerts
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON intel_alerts
  FOR ALL USING (true) WITH CHECK (true);
