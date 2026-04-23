import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('politicians').select('bioguide_id,name,party,office,district,corruption_score,juice_box_tier,total_funds,aipac_funding,israel_lobby_total,source_ids,is_candidate,running_for').or('name.ilike.%Balderson%,name.ilike.%Jerrad Christian%,name.ilike.%Christian%OH%');
  for (const r of data || []) {
    console.log(`${r.bioguide_id} | ${r.name} | ${r.office || ''} | ${r.jurisdiction || ''} | dist=${r.district} | fec=${(r.source_ids as any)?.fec_candidate_id || '?'} | score=${r.corruption_score} | israel=${r.israel_lobby_total}`);
  }
}
main();
