import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('politicians').select('*').eq('bioguide_id', '79bc66ef-4488-439e-af4b-ab6de865364d').single();
  if (!data) { console.log('not found'); return; }
  console.log('source_ids:', JSON.stringify(data.source_ids, null, 2));
  console.log('\nfields:');
  console.log(` office=${data.office} | party=${data.party} | dist=${data.district} | juice=${data.juice_box_tier}`);
  console.log(` aipac=${data.aipac_funding} | israel_total=${data.israel_lobby_total}`);
  console.log(` israel_lobby_breakdown=${JSON.stringify(data.israel_lobby_breakdown).slice(0,300)}`);
  console.log(` votes=${(data.voting_records||[]).length} rows`);
}
main();
