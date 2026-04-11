import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function main() {
  const counties = [
    'Paulding',
    'Perry',
    'Pike',
    'Preble',
    'Putnam',
    'Ross',
    'Sandusky',
    'Scioto',
    'Seneca',
    'Shelby',
    'Union',
    'Van Wert',
    'Vinton',
    'Washington',
    'Williams',
    'Wyandot',
    'Ashland',
    'Adams',
  ];

  console.log('=== Verification Report for Ohio 18 Counties ===\n');

  let grandTotal = 0;
  for (const county of counties) {
    const { data, count } = await sb
      .from('politicians')
      .select('*', { count: 'exact' })
      .eq('jurisdiction', `${county} County`);

    grandTotal += count || 0;
    console.log(`${county} County: ${count} officials`);
    if (data && data.length > 0) {
      const sample = data[0];
      console.log(
        `  Sample: ${sample.name} (${sample.office}, ${sample.party}), bioguide_id: ${sample.bioguide_id}`
      );
    }
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`Total officials from 18 counties: ${grandTotal}`);
  console.log(`Expected: 198 (18 counties × 11 officials each)`);
  console.log(`Status: ${grandTotal === 198 ? '✓ PASS' : '✗ FAIL'}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
