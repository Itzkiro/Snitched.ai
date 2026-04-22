import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const fecIds = ['H4FL28042','H0FL26036','H6FL28039','H6FL28013','H6FL28047','H4FL28026','H6FL28021'];
  const names = ['%Ehr%','%Gimenez%','%Campione%','James%Henry%','%Mujica%','%Lara%','%Rojas%'];
  for (let i = 0; i < fecIds.length; i++) {
    const fec = fecIds[i];
    const { data: byFec } = await s.from('politicians').select('bioguide_id,name,source_ids,corruption_score,total_funds,israel_lobby_total').eq('source_ids->>fec_candidate_id', fec).limit(3);
    const { data: byName } = await s.from('politicians').select('bioguide_id,name,source_ids,corruption_score,total_funds,israel_lobby_total').ilike('name', names[i]).limit(3);
    console.log(`\n${fec} / name like ${names[i]}:`);
    console.log(`  by fec_id: ${(byFec||[]).map(r=>`${r.bioguide_id}:${r.name}`).join(', ') || '(none)'}`);
    console.log(`  by name:   ${(byName||[]).map(r=>`${r.bioguide_id}:${r.name} (score=${r.corruption_score}, funds=${r.total_funds}, israel=${r.israel_lobby_total})`).join(' | ') || '(none)'}`);
  }
}
main();
