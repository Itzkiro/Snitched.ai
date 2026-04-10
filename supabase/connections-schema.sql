-- Snitched.ai — Cross-Politician Connections Graph
-- Run in Supabase SQL Editor

-- Nodes: entities that connect politicians (donors, PACs, firms, etc.)
CREATE TABLE IF NOT EXISTS connection_nodes (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL,  -- 'donor', 'pac', 'lobby-firm', 'lobby-client', 'israel-pac', 'corporate', 'court-case'
  total_amount  NUMERIC DEFAULT 0,
  metadata      JSONB DEFAULT '{}'::jsonb,
  politician_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Edges: connections between politicians and entities
CREATE TABLE IF NOT EXISTS connection_edges (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL,   -- politician bioguide_id
  target_id     TEXT NOT NULL,   -- connection_nodes id
  source_type   TEXT NOT NULL DEFAULT 'politician',
  target_type   TEXT NOT NULL,   -- matches connection_nodes.category
  label         TEXT,            -- 'donated_to', 'lobbied_by', 'ie_spending', 'court_party'
  amount        NUMERIC DEFAULT 0,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conn_nodes_category ON connection_nodes(category);
CREATE INDEX IF NOT EXISTS idx_conn_nodes_pol_count ON connection_nodes(politician_count DESC);
CREATE INDEX IF NOT EXISTS idx_conn_edges_source ON connection_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_conn_edges_target ON connection_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_conn_edges_type ON connection_edges(target_type);

-- RLS
ALTER TABLE connection_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON connection_nodes FOR SELECT USING (true);
CREATE POLICY "Service write" ON connection_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update" ON connection_nodes FOR UPDATE USING (true);
CREATE POLICY "Service delete" ON connection_nodes FOR DELETE USING (true);

CREATE POLICY "Public read" ON connection_edges FOR SELECT USING (true);
CREATE POLICY "Service write" ON connection_edges FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update" ON connection_edges FOR UPDATE USING (true);
CREATE POLICY "Service delete" ON connection_edges FOR DELETE USING (true);
