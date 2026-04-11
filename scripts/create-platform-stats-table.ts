import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if table already exists by trying to query it
  const { error: testErr } = await client.from('platform_stats').select('key').limit(1);
  if (!testErr) {
    console.log('platform_stats table already exists');
    return;
  }

  console.log('Table does not exist yet. Please run this SQL in your Supabase dashboard SQL Editor:');
  console.log('');
  console.log(`CREATE TABLE IF NOT EXISTS platform_stats (
  key         TEXT PRIMARY KEY,
  value       NUMERIC NOT NULL DEFAULT 0,
  label       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON platform_stats
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON platform_stats
  FOR ALL USING (true) WITH CHECK (true);`);
}

main().catch(console.error);
