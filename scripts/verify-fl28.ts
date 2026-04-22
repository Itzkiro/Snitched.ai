import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of ['fl-house-2026-phil-ehr', '79bc66ef-4488-439e-af4b-ab6de865364d']) {
    const { data } = await s.from('politicians').select('bioguide_id,name,party,office,district,corruption_score,juice_box_tier,total_funds,israel_lobby_total,aipac_funding,israel_lobby_breakdown,source_ids,contribution_breakdown,is_candidate,running_for').eq('bioguide_id', id).single();
    if (!data) { console.log(`(${id} not found)`); continue; }
    console.log(`\n=== ${data.name} (${data.party}) — ${data.district} ===`);
    console.log(`  DB id: ${data.bioguide_id}`);
    console.log(`  corruption_score: ${data.corruption_score}`);
    console.log(`  juice_box_tier: ${data.juice_box_tier}`);
    console.log(`  total_funds: $${(data.total_funds || 0).toLocaleString()}`);
    console.log(`  aipac_funding: $${(data.aipac_funding || 0).toLocaleString()}`);
    console.log(`  israel_lobby_total: $${(data.israel_lobby_total || 0).toLocaleString()}`);
    console.log(`  donation_status: ${data.source_ids?.donation_status || '(unset)'}`);
    console.log(`  is_candidate: ${data.is_candidate} | running_for: ${data.running_for}`);
    console.log(`  israel_lobby_breakdown: ${JSON.stringify(data.israel_lobby_breakdown).slice(0,400)}`);
    console.log(`  contribution_breakdown: ${JSON.stringify(data.contribution_breakdown)}`);
  }
}
main();
