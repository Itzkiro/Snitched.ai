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

  console.log('=== Verification Report for Ohio 18 Counties (NEW Officials Only) ===\n');

  let grandTotal = 0;
  const results: Record<string, number> = {};

  for (const county of counties) {
    const countySlug = county.toLowerCase();
    const { data, count } = await sb
      .from('politicians')
      .select('*', { count: 'exact' })
      .ilike('bioguide_id', `oh-${countySlug}-%`);

    results[county] = count || 0;
    grandTotal += count || 0;

    console.log(`${county} County: ${count} officials with bioguide_id pattern oh-${countySlug}-*`);
    if (data && data.length > 0) {
      const sample = data[0];
      console.log(
        `  Sample: ${sample.name} (${sample.office}, ${sample.party})`
      );
    }
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`Total newly inserted officials: ${grandTotal}`);
  console.log(`Expected: 198 (18 counties × 11 officials each)`);
  console.log(`Status: ${grandTotal === 198 ? '✓ PASS' : '✗ VERIFICATION'}`);

  console.log(`\nDetails:`);
  let allCorrect = true;
  for (const county of counties) {
    const count = results[county];
    const status = count === 11 ? '✓' : '✗';
    console.log(`  ${status} ${county}: ${count}/11`);
    if (count !== 11) allCorrect = false;
  }

  if (allCorrect) {
    console.log(`\n✓ All 18 counties have exactly 11 officials each`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
