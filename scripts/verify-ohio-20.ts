const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function verify() {
  try {
    const counties = [
      'Henry County', 'Highland County', 'Hocking County', 'Holmes County', 'Huron County',
      'Jackson County', 'Jefferson County', 'Knox County', 'Lawrence County', 'Logan County',
      'Madison County', 'Marion County', 'Meigs County', 'Mercer County', 'Monroe County',
      'Morgan County', 'Morrow County', 'Muskingum County', 'Noble County', 'Ottawa County'
    ];

    const { data: records, error } = await sb
      .from('politicians')
      .select('jurisdiction, office, name, bioguide_id, party')
      .in('jurisdiction', counties)
      .order('jurisdiction, office, name');

    if (error) {
      console.error('Query error:', error);
      process.exit(1);
    }

    // Count by office type per county
    const countByOffice = {};
    records.forEach(r => {
      const key = `${r.jurisdiction}|${r.office}`;
      if (!countByOffice[key]) countByOffice[key] = 0;
      countByOffice[key]++;
    });

    console.log('=' .repeat(70));
    console.log('VERIFICATION: 20 Ohio Counties - Elected Officials Seeded');
    console.log('=' .repeat(70));

    // Group by county
    const byCounty = {};
    records.forEach(r => {
      if (!byCounty[r.jurisdiction]) byCounty[r.jurisdiction] = [];
      byCounty[r.jurisdiction].push(r);
    });

    Object.entries(byCounty).sort().forEach(([county, officials]) => {
      console.log(`\n${county} (${officials.length} officials):`);
      const byOffice = {};
      officials.forEach(o => {
        if (!byOffice[o.office]) byOffice[o.office] = [];
        byOffice[o.office].push(o);
      });
      Object.entries(byOffice).sort().forEach(([office, officeholders]) => {
        console.log(`  ${office}: ${officeholders.length}`);
      });
    });

    const total = records.length;
    console.log(`\n${'=' .repeat(70)}`);
    console.log(`TOTAL OFFICIALS INSERTED: ${total}`);
    console.log(`COUNTIES: ${Object.keys(byCounty).length}`);
    console.log('=' .repeat(70));

    // Verify sample bioguide_ids match expected format
    console.log('\nSample bioguide_ids (should be oh-county-office-name):');
    records.slice(0, 10).forEach(r => {
      const isValid = r.bioguide_id.startsWith('oh-');
      console.log(`  ${r.bioguide_id} ${isValid ? '✓' : '✗'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

verify();
