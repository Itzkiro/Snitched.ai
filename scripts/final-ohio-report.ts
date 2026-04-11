import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function main() {
  const counties = [
    'Paulding', 'Perry', 'Pike', 'Preble', 'Putnam', 'Ross',
    'Sandusky', 'Scioto', 'Seneca', 'Shelby', 'Union', 'Van Wert',
    'Vinton', 'Washington', 'Williams', 'Wyandot', 'Ashland', 'Adams'
  ];

  console.log('=== FINAL OHIO 18 COUNTIES SEEDING REPORT ===\n');

  let grandTotal = 0;
  const details: Array<[string, number]> = [];

  for (const county of counties) {
    const { count } = await sb
      .from('politicians')
      .select('*', { count: 'exact' })
      .eq('jurisdiction', `${county} County`)
      .eq('data_source', 'ohio-county-seed-2025');

    const total = count || 0;
    grandTotal += total;
    details.push([county, total]);
  }

  console.log('County-by-County Breakdown:');
  console.log('─'.repeat(50));
  let allCorrect = true;
  for (const [county, count] of details) {
    const check = count === 11 ? '✓' : '✗';
    console.log(`${check} ${county.padEnd(20)} County: ${count} officials`);
    if (count !== 11) allCorrect = false;
  }

  console.log('─'.repeat(50));
  console.log(`\nTOTAL OFFICIALS INSERTED: ${grandTotal}`);
  console.log(`EXPECTED: 198 (18 counties × 11 officials each)`);
  console.log(`STATUS: ${grandTotal === 198 ? '✓ SUCCESS' : '✗ FAILED'}`);

  if (allCorrect) {
    console.log('\n✓ All 18 counties have exactly 11 officials each');
  }

  // Sample from each batch to show data structure
  console.log('\n=== Sample Data (1 from each county) ===');
  for (const county of counties.slice(0, 3)) {
    const { data } = await sb
      .from('politicians')
      .select('name, office, party, bioguide_id')
      .eq('jurisdiction', `${county} County`)
      .eq('data_source', 'ohio-county-seed-2025')
      .limit(1);

    if (data && data.length > 0) {
      const row = data[0];
      console.log(`\n${county} County:`);
      console.log(`  Name: ${row.name}`);
      console.log(`  Office: ${row.office}`);
      console.log(`  Party: ${row.party}`);
      console.log(`  bioguide_id: ${row.bioguide_id}`);
    }
  }

  process.exit(grandTotal === 198 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
