import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of ['oh-rep-d12-troy-balderson', '79bc66ef-4488-439e-af4b-ab6de865364d', 'fl-house-2026-phil-ehr', 'fl-house-2026-aaron-baker', 'oh-house-2026-jerrad-christian']) {
    const { data } = await s.from('politicians').select('bioguide_id,name,is_active,is_candidate,running_for,term_start,term_end').eq('bioguide_id', id).single();
    if (!data) continue;
    console.log(`${data.name.padEnd(28)} | is_active=${data.is_active} | is_candidate=${data.is_candidate} | running_for=${data.running_for || '(null)'}`);
  }
}
main();
