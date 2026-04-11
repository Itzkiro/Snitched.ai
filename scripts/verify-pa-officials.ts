import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verify() {
  // Get count by county
  const { data, error } = await supabase
    .from('politicians')
    .select('jurisdiction, jurisdiction_type')
    .like('jurisdiction', '%County')
    .eq('jurisdiction_type', 'county');

  if (error) {
    console.error('Query error:', error.message);
    return;
  }

  const countByCounty: Record<string, number> = {};
  data.forEach(row => {
    countByCounty[row.jurisdiction] = (countByCounty[row.jurisdiction] || 0) + 1;
  });

  console.log('PA County Officials Verification:');
  console.log('================================\n');
  Object.entries(countByCounty)
    .sort((a, b) => b[1] - a[1])
    .forEach(([county, count]) => {
      console.log(`${county}: ${count} officials`);
    });

  const total = Object.values(countByCounty).reduce((a, b) => a + b, 0);
  console.log(`\nTotal PA County Officials: ${total}`);

  // Get sample officials
  const { data: samples } = await supabase
    .from('politicians')
    .select('bioguide_id, name, office, office_level, party, jurisdiction')
    .like('bioguide_id', 'pa-%')
    .limit(5);

  console.log('\nSample PA officials:');
  samples?.forEach(p => {
    console.log(`  - ${p.name} (${p.office}) [${p.jurisdiction}]`);
  });
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
