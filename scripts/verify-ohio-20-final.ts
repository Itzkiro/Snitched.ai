const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

async function verify() {
  try {
    const counties = [
      'Henry', 'Highland', 'Hocking', 'Holmes', 'Huron',
      'Jackson', 'Jefferson', 'Knox', 'Lawrence', 'Logan',
      'Madison', 'Marion', 'Meigs', 'Mercer', 'Monroe',
      'Morgan', 'Morrow', 'Muskingum', 'Noble', 'Ottawa'
    ];

    const { data: records, error } = await sb
      .from('politicians')
      .select('jurisdiction, office, name, bioguide_id, party')
      .filter('bioguide_id', 'like', 'oh-%')
      .filter('jurisdiction', 'in', `(${counties.map(c => `"${c} County"`).join(',')})`);

    if (error) {
      console.error('Query error:', error);
      process.exit(1);
    }

    // Filter to only those with correct county names
    const ohioRecords = records.filter(r => 
      counties.some(county => r.jurisdiction === `${county} County`) &&
      r.bioguide_id.startsWith('oh-')
    );

    const countByCounty = {};
    ohioRecords.forEach(r => {
      if (!countByCounty[r.jurisdiction]) countByCounty[r.jurisdiction] = 0;
      countByCounty[r.jurisdiction]++;
    });

    console.log('=' .repeat(70));
    console.log('FINAL VERIFICATION: 20 Ohio Counties - Seeding Report');
    console.log('=' .repeat(70));

    console.log('\nOhio Officials Added (bioguide_id starts with "oh-"):');
    Object.entries(countByCounty).sort().forEach(([county, count]) => {
      console.log(`  ${county}: ${count}`);
    });

    console.log(`\n${'=' .repeat(70)}`);
    console.log(`TOTAL OFFICIALS SEEDED: ${ohioRecords.length}`);
    console.log(`COUNTIES COVERED: ${Object.keys(countByCounty).length}`);
    console.log('=' .repeat(70));

    // Show required offices coverage
    console.log('\nRequired office types per county:');
    const requiredOffices = ['County Commissioner', 'Sheriff', 'Prosecuting Attorney', 'Clerk of Courts', 'County Auditor', 'County Treasurer', 'County Recorder', 'County Coroner', 'County Engineer'];
    
    const sampleCounty = ohioRecords.filter(r => r.jurisdiction === 'Henry County');
    const officesCovered = new Set(sampleCounty.map(r => r.office));
    console.log(`  Henry County sample (${sampleCounty.length} records):`);
    requiredOffices.forEach(office => {
      const has = officesCovered.has(office);
      console.log(`    ${has ? '✓' : '✗'} ${office}`);
    });

    console.log('\nSample Ohio Records (first 10):');
    ohioRecords.slice(0, 10).forEach(r => {
      console.log(`  ${r.bioguide_id} | ${r.name} | ${r.office}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

verify();
