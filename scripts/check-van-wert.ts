import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function main() {
  const { data } = await sb
    .from('politicians')
    .select('bioguide_id, name, office')
    .eq('jurisdiction', 'Van Wert County');

  console.log('Van Wert County entries:');
  console.log(`Total: ${data?.length || 0}`);
  if (data && data.length > 0) {
    data.forEach((row) => {
      console.log(`  ${row.bioguide_id} - ${row.name} (${row.office})`);
    });
  }
}

main().catch(console.error);
