import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const ids = ['oh-house-2026-jerrad-christian', 'fl-house-2026-phil-ehr', 'fl-house-2026-aaron-baker'];
  for (const id of ids) {
    const { error } = await s.from('politicians').update({ is_active: true, updated_at: new Date().toISOString() }).eq('bioguide_id', id);
    if (error) { console.error(`${id}: ${error.message}`); continue; }
    const { data } = await s.from('politicians').select('name,is_active,is_candidate,running_for').eq('bioguide_id', id).single();
    console.log(`${data?.name?.padEnd(24)} | is_active=${data?.is_active} | is_candidate=${data?.is_candidate} | running_for=${data?.running_for}`);
  }
}
main();
