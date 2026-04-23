import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('politicians').select('*').eq('bioguide_id', 'fl-house-2026-phil-ehr').single();
  if (!data) { console.log('not found'); return; }
  console.log('source_ids (full):');
  console.log(JSON.stringify(data.source_ids, null, 2));
  console.log('\nbio:', data.bio?.slice(0, 200));
}
main();
