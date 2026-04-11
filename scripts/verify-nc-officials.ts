import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function verify() {
  // Get all NC officials
  const { data: all, count } = await sb
    .from('politicians')
    .select('*', { count: 'exact' })
    .filter('bioguide_id', 'like', 'nc-%');

  console.log(`\n=== VERIFICATION REPORT ===`);
  console.log(`Total NC officials inserted: ${count}`);
  
  // Count by jurisdiction
  const byCounts: { [key: string]: number } = {};
  if (all) {
    for (const official of all) {
      const key = official.jurisdiction;
      byCounts[key] = (byCounts[key] || 0) + 1;
    }
  }
  
  console.log('\n=== OFFICIALS BY JURISDICTION ===');
  for (const [jurisdiction, cnt] of Object.entries(byCounts).sort()) {
    console.log(`  ${jurisdiction}: ${cnt} officials`);
  }
  
  // Show sample officials
  if (all && all.length > 0) {
    console.log('\n=== SAMPLE OFFICIALS (First 10) ===');
    for (const o of all.slice(0, 10)) {
      console.log(`  ${o.bioguide_id}: ${o.name} (${o.office})`);
    }
  }
}

verify().catch(console.error);
