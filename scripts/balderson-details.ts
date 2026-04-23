import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s.from('politicians').select('*').eq('bioguide_id', 'oh-rep-d12-troy-balderson').single();
  if (!data) return;
  console.log('=== Balderson DB row ===');
  console.log(`corruption_score: ${data.corruption_score}`);
  console.log(`juice_box_tier:   ${data.juice_box_tier}`);
  console.log(`total_funds:      $${(data.total_funds||0).toLocaleString()}`);
  console.log(`aipac_funding:    $${(data.aipac_funding||0).toLocaleString()}`);
  console.log(`israel_lobby_total: $${(data.israel_lobby_total||0).toLocaleString()}`);
  console.log(`\nsource_ids:`);
  console.log(JSON.stringify(data.source_ids, null, 2).slice(0, 2000));
  console.log(`\nisrael_lobby_breakdown:`);
  console.log(JSON.stringify(data.israel_lobby_breakdown, null, 2).slice(0, 1500));
  console.log(`\nvotes: ${(data.voting_records||[]).length} rows`);
}
main();
