import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('politicians').select('bioguide_id,name,party,district,corruption_score,juice_box_tier,total_funds,israel_lobby_total,is_active,is_candidate,running_for,data_source,updated_at').or('name.ilike.%Jerrad%Christian%,name.ilike.%Daniel%Crawford%OH%,name.ilike.%Jason%Reynard%,bioguide_id.eq.oh-house-2026-jerrad-christian,bioguide_id.eq.oh-house-2026-daniel-crawford,bioguide_id.eq.oh-house-2026-jason-reynard');
  for (const r of data || []) {
    console.log(`${r.bioguide_id} | ${r.name} | ${r.party} | dist=${r.district} | score=${r.corruption_score} | tier=${r.juice_box_tier} | israel=$${r.israel_lobby_total} | active=${r.is_active} | src=${r.data_source} | upd=${r.updated_at}`);
  }
  console.log(`Total rows: ${(data||[]).length}`);
}
main().catch(console.error);
