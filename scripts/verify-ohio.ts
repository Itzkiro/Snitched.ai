import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function verify() {
  const cities = ['Youngstown', 'Canton', 'Springfield', 'Elyria', 'Lancaster'];
  
  for (const city of cities) {
    const { data, error } = await sb
      .from('politicians')
      .select('name, office, jurisdiction, party')
      .eq('jurisdiction', city)
      .order('office', { ascending: true });
      
    if (error) {
      console.error(`Error for ${city}:`, error);
      continue;
    }
    
    console.log(`\n${city}: ${data?.length || 0} officials`);
    if (data && data.length > 0) {
      data.slice(0, 3).forEach(row => {
        console.log(`  - ${row.name} (${row.office}) - ${row.party}`);
      });
      if (data.length > 3) {
        console.log(`  ... and ${data.length - 3} more`);
      }
    }
  }
}

verify().catch(console.error);
