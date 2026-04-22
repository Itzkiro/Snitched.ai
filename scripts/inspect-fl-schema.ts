import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
async function main(): Promise<void> {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s.from('politicians').select('*').eq('jurisdiction', 'Florida').limit(3);
  if (error) { console.error(error); return; }
  for (const r of (data || []).slice(0, 1)) {
    console.log('ALL COLUMNS:', Object.keys(r));
    console.log('EXAMPLE ROW:');
    for (const [k, v] of Object.entries(r)) {
      const str = typeof v === 'object' ? JSON.stringify(v)?.slice(0, 120) : String(v).slice(0, 120);
      console.log(`  ${k}: ${str}`);
    }
  }
}
main();
