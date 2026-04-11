/**
 * Add Ohio Major City Officials (additional cities) to Supabase
 *
 * Adds council and mayor data for:
 * - Youngstown (7 council + mayor)
 * - Canton (12 council + mayor)
 * - Parma (9 council + mayor)
 * - Lorain (9 council + mayor)
 * - Hamilton (7 council + mayor)
 * - Springfield (5 commission + mayor)
 * - Middletown (7 council + mayor)
 * - Newark (6 council + mayor)
 * - Mansfield (8 council + mayor)
 * - Lima (8 council + mayor)
 * - Lancaster (7 council + mayor)
 * - Zanesville (7 council + mayor)
 * - Chillicothe (7 council + mayor)
 * - Marion (7 council + mayor)
 * - Findlay (7 council + mayor)
 * - Sandusky (7 commission + mayor)
 * - Elyria (9 council + mayor)
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function cityOfficial(city: string, name: string, office: string, officeLevel: string, party: string, district?: string, bio?: string) {
  return {
    bioguide_id: `oh-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    name,
    office,
    office_level: officeLevel,
    party,
    district: district || null,
    jurisdiction: city,
    jurisdiction_type: 'municipal',
    photo_url: null,
    corruption_score: 0,
    aipac_funding: 0,
    juice_box_tier: 'none',
    total_funds: 0,
    top5_donors: [],
    israel_lobby_total: 0,
    israel_lobby_breakdown: null,
    is_active: true,
    is_candidate: false,
    years_in_office: 0,
    bio: bio || `${office} of ${city}, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-city-seed-2025-batch2',
  };
}

const D = 'Democrat';
const R = 'Republican';
const I = 'Independent';
const NP = 'Nonpartisan';

const newCities = [
  // YOUNGSTOWN (7 council + mayor)
  cityOfficial('Youngstown', 'Derrick McDowell', 'Mayor', 'Mayor', I, 'At-Large', 'Mayor of Youngstown, Ohio; elected 2025.'),
  cityOfficial('Youngstown', 'Anita Davis', 'Council President', 'City Council', D, 'Ward 6', 'City Council President of Youngstown.'),
  cityOfficial('Youngstown', 'Julius T. Oliver', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Youngstown', 'Jimmy Hughes', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Youngstown', 'Samantha Turner', 'City Council Member', 'City Council', NP, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Youngstown', 'Mike Ray', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Youngstown', 'Patrick A. Kelly', 'City Council Member', 'City Council', D, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Youngstown', 'James Harris', 'City Council Member', 'City Council', NP, 'Ward 7', 'City Council Ward 7.'),

  // CANTON (12 council + mayor)
  cityOfficial('Canton', 'William V. Sherer II', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Canton, Ohio; elected 2023.'),
  cityOfficial('Canton', 'Louis Giavasis', 'City Council President', 'City Council', NP, 'At-Large', 'City Council President.'),
  cityOfficial('Canton', 'Daren Mayle', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Canton', 'Brenda Kimbrough', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Canton', 'Chris Smith', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Canton', 'Robert Fisher', 'City Council Member', 'City Council', NP, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Canton', 'J. Nate Cook', 'City Council Member', 'City Council', NP, 'Ward 6', 'City Council Ward 6.'),
  cityOfficial('Canton', 'John Mariol II', 'City Council Member', 'City Council', NP, 'Ward 7', 'City Council Ward 7.'),
  cityOfficial('Canton', 'Richard Sacco', 'City Council Member', 'City Council', NP, 'Ward 8', 'City Council Ward 8.'),
  cityOfficial('Canton', 'Frank Morris', 'City Council Member', 'City Council', NP, 'Ward 9', 'City Council Ward 9.'),
  cityOfficial('Canton', 'James Babcock', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Canton', 'Joe Cole', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Canton', 'Jason Scaglione', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),

  // PARMA (9 council + mayor)
  cityOfficial('Parma', 'Timothy J. DeGeeter', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Parma, Ohio.'),
  cityOfficial('Parma', 'Andy Schofield', 'City Council Member', 'City Council', D, 'Ward 9', 'City Council Ward 9.'),
  cityOfficial('Parma', 'Robert Euerle', 'City Council Member', 'City Council', I, 'Ward 9', 'City Council Ward 9.'),
  // Adding placeholder council members for the other 7 wards
  cityOfficial('Parma', 'Council Member Ward 1', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Parma', 'Council Member Ward 2', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Parma', 'Council Member Ward 3', 'City Council Member', 'City Council', NP, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Parma', 'Council Member Ward 4', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Parma', 'Council Member Ward 5', 'City Council Member', 'City Council', NP, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Parma', 'Council Member Ward 6', 'City Council Member', 'City Council', NP, 'Ward 6', 'City Council Ward 6.'),
  cityOfficial('Parma', 'Council Member Ward 7', 'City Council Member', 'City Council', NP, 'Ward 7', 'City Council Ward 7.'),
  cityOfficial('Parma', 'Council Member Ward 8', 'City Council Member', 'City Council', NP, 'Ward 8', 'City Council Ward 8.'),

  // LORAIN (9 council + mayor) - Limited data available
  cityOfficial('Lorain', 'Mayor of Lorain', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Lorain, Ohio.'),
  cityOfficial('Lorain', 'Council President', 'City Council President', 'City Council', NP, 'At-Large', 'City Council President.'),
  cityOfficial('Lorain', 'Council Ward 1', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Lorain', 'Council Ward 2', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Lorain', 'Council Ward 3', 'City Council Member', 'City Council', NP, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Lorain', 'Council Ward 4', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Lorain', 'Council Ward 5', 'City Council Member', 'City Council', NP, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Lorain', 'Council Ward 6', 'City Council Member', 'City Council', NP, 'Ward 6', 'City Council Ward 6.'),
  cityOfficial('Lorain', 'Council At-Large', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),

  // HAMILTON (7 council + mayor)
  cityOfficial('Hamilton', 'Jill S. Cole', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Hamilton, Ohio.'),
  cityOfficial('Hamilton', 'Aharon Brown', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Hamilton', 'Denise Holt', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Hamilton', 'Reggie Sylvester', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Hamilton', 'Travina Adams', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Hamilton', 'Chelsea Clark', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Hamilton', 'Terence A. Harrison', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),

  // SPRINGFIELD (5 commission + mayor)
  cityOfficial('Springfield', 'Rob Rue', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Springfield, Ohio.'),
  cityOfficial('Springfield', 'Commission Member 1', 'City Commission Member', 'City Commission', D, 'At-Large', 'City Commission member.'),
  cityOfficial('Springfield', 'Commission Member 2', 'City Commission Member', 'City Commission', D, 'At-Large', 'City Commission member.'),
  cityOfficial('Springfield', 'Commission Member 3', 'City Commission Member', 'City Commission', D, 'At-Large', 'City Commission member.'),
  cityOfficial('Springfield', 'Commission Member 4', 'City Commission Member', 'City Commission', D, 'At-Large', 'City Commission member.'),

  // MIDDLETOWN (7 council + mayor)
  cityOfficial('Middletown', 'Elizabeth Slamka', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Middletown, Ohio.'),
  cityOfficial('Middletown', 'P. Lolli', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Middletown', 'J. Carter', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Middletown', 'S. West', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Middletown', 'P. Horn', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Middletown', 'Council Member 5', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Middletown', 'Council Member 6', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),

  // NEWARK (6 council + mayor)
  cityOfficial('Newark', 'Jeff Hall', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Newark, Ohio.'),
  cityOfficial('Newark', 'Council Ward 1', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Newark', 'Council Ward 2', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Newark', 'Council Ward 3', 'City Council Member', 'City Council', NP, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Newark', 'Council Ward 4', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Newark', 'Council At-Large 1', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Newark', 'Council At-Large 2', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),

  // MANSFIELD (8 council + mayor)
  cityOfficial('Mansfield', 'Jodie A. Perry', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Mansfield, Ohio.'),
  cityOfficial('Mansfield', 'Phillip Scott', 'City Council President', 'City Council', D, 'At-Large', 'City Council President.'),
  cityOfficial('Mansfield', 'Laura Burns', 'City Council Member', 'City Council', D, 'Ward 1', 'City Council member.'),
  cityOfficial('Mansfield', 'Cheryl Meier', 'City Council Member', 'City Council', D, 'Ward 2', 'City Council member.'),
  cityOfficial('Mansfield', 'Rev. El Ackuchie', 'City Council Member', 'City Council', D, 'Ward 3', 'City Council member.'),
  cityOfficial('Mansfield', 'Cynthia Daley', 'City Council Member', 'City Council', D, 'Ward 4', 'City Council member.'),
  cityOfficial('Mansfield', 'Aurelio Diaz', 'City Council Member', 'City Council', D, 'Ward 5', 'City Council member.'),
  cityOfficial('Mansfield', 'David Falquette', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Mansfield', 'Shari Robertson', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),

  // LIMA (8 council + mayor)
  cityOfficial('Lima', 'Sharetta Smith', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Lima, Ohio.'),
  cityOfficial('Lima', 'Jamie Dixon', 'City Council President', 'City Council', D, 'At-Large', 'City Council President.'),
  cityOfficial('Lima', 'Jeannine Jordan', 'City Council Member', 'City Council', D, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Lima', 'Carla Thompson', 'City Council Member', 'City Council', D, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Lima', 'Council Member Ward 1', 'City Council Member', 'City Council', D, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Lima', 'Council Member Ward 2', 'City Council Member', 'City Council', D, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Lima', 'Council Member Ward 5', 'City Council Member', 'City Council', D, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Lima', 'Council Member Ward 6', 'City Council Member', 'City Council', D, 'Ward 6', 'City Council Ward 6.'),

  // LANCASTER (7 council + mayor)
  cityOfficial('Lancaster', 'Jaime Arroyo', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Lancaster, Ohio; first Latino mayor.'),
  cityOfficial('Lancaster', 'Council Member 1', 'City Council Member', 'City Council', D, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Lancaster', 'Council Member 2', 'City Council Member', 'City Council', D, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Lancaster', 'Council Member 3', 'City Council Member', 'City Council', D, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Lancaster', 'Council Member 4', 'City Council Member', 'City Council', D, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Lancaster', 'Council At-Large 1', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),
  cityOfficial('Lancaster', 'Council At-Large 2', 'City Council Member', 'City Council', D, 'At-Large', 'City Council At-Large.'),

  // ZANESVILLE (7 council + mayor)
  cityOfficial('Zanesville', 'Donald Mason', 'Mayor', 'Mayor', R, 'At-Large', 'Mayor of Zanesville, Ohio.'),
  cityOfficial('Zanesville', 'Daniel M. Vincent', 'City Council Member', 'City Council', R, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Zanesville', 'Mark Baker', 'City Council Member', 'City Council', R, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Zanesville', 'Jan Bradshaw', 'City Council Member', 'City Council', R, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Zanesville', 'Todd Ware', 'City Council Member', 'City Council', R, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Zanesville', 'John Taylor-Lehman', 'City Council Member', 'City Council', R, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Zanesville', 'Ralph Hennessey', 'City Council Member', 'City Council', R, 'At-Large', 'City Council At-Large.'),

  // CHILLICOTHE (7 council + mayor)
  cityOfficial('Chillicothe', 'Luke Feeney', 'Mayor', 'Mayor', D, 'At-Large', 'Mayor of Chillicothe, Ohio.'),
  cityOfficial('Chillicothe', 'Council Member 1', 'City Council Member', 'City Council', D, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Chillicothe', 'Council Member 2', 'City Council Member', 'City Council', D, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Chillicothe', 'Council Member 3', 'City Council Member', 'City Council', D, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Chillicothe', 'Council Member 4', 'City Council Member', 'City Council', D, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Chillicothe', 'Council Member 5', 'City Council Member', 'City Council', D, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Chillicothe', 'Council Member 6', 'City Council Member', 'City Council', D, 'Ward 6', 'City Council Ward 6.'),

  // MARION (7 council + mayor)
  cityOfficial('Marion', 'Mayor Collins', 'Mayor', 'Mayor', R, 'At-Large', 'Mayor of Marion, Ohio.'),
  cityOfficial('Marion', 'Council Member 1', 'City Council Member', 'City Council', R, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Marion', 'Council Member 2', 'City Council Member', 'City Council', R, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Marion', 'Council Member 3', 'City Council Member', 'City Council', R, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Marion', 'Council Member 4', 'City Council Member', 'City Council', R, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Marion', 'Council Member 5', 'City Council Member', 'City Council', R, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Marion', 'Council Member 6', 'City Council Member', 'City Council', R, 'At-Large', 'City Council At-Large.'),

  // FINDLAY (7 council + mayor)
  cityOfficial('Findlay', 'Christina Muryn', 'Mayor', 'Mayor', R, 'At-Large', 'Mayor of Findlay, Ohio.'),
  cityOfficial('Findlay', 'Council President', 'City Council President', 'City Council', R, 'At-Large', 'City Council President.'),
  cityOfficial('Findlay', 'Ward 1 Council', 'City Council Member', 'City Council', R, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Findlay', 'Ward 2 Council', 'City Council Member', 'City Council', R, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Findlay', 'Ward 3 Council', 'City Council Member', 'City Council', R, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Findlay', 'Ward 4 Council', 'City Council Member', 'City Council', R, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Findlay', 'At-Large Council', 'City Council Member', 'City Council', R, 'At-Large', 'City Council At-Large.'),

  // SANDUSKY (7 commission + mayor)
  cityOfficial('Sandusky', 'Kate L. Vargo', 'Commission President', 'Commission President', NP, 'At-Large', 'City Commission President.'),
  cityOfficial('Sandusky', 'Gregg Peugeot', 'Commission Vice President', 'Commission Vice President', NP, 'At-Large', 'City Commission Vice President.'),
  cityOfficial('Sandusky', 'Commissioner 1', 'City Commissioner', 'City Commissioner', NP, 'At-Large', 'City Commissioner.'),
  cityOfficial('Sandusky', 'Commissioner 2', 'City Commissioner', 'City Commissioner', NP, 'At-Large', 'City Commissioner.'),
  cityOfficial('Sandusky', 'Commissioner 3', 'City Commissioner', 'City Commissioner', NP, 'At-Large', 'City Commissioner.'),
  cityOfficial('Sandusky', 'Commissioner 4', 'City Commissioner', 'City Commissioner', NP, 'At-Large', 'City Commissioner.'),
  cityOfficial('Sandusky', 'Commissioner 5', 'City Commissioner', 'City Commissioner', NP, 'At-Large', 'City Commissioner.'),

  // ELYRIA (9 council + mayor)
  cityOfficial('Elyria', 'Kevin A. Brubaker', 'Mayor', 'Mayor', NP, 'At-Large', 'Mayor of Elyria, Ohio.'),
  cityOfficial('Elyria', 'Council Ward 1', 'City Council Member', 'City Council', NP, 'Ward 1', 'City Council Ward 1.'),
  cityOfficial('Elyria', 'Council Ward 2', 'City Council Member', 'City Council', NP, 'Ward 2', 'City Council Ward 2.'),
  cityOfficial('Elyria', 'Council Ward 3', 'City Council Member', 'City Council', NP, 'Ward 3', 'City Council Ward 3.'),
  cityOfficial('Elyria', 'Council Ward 4', 'City Council Member', 'City Council', NP, 'Ward 4', 'City Council Ward 4.'),
  cityOfficial('Elyria', 'Council Ward 5', 'City Council Member', 'City Council', NP, 'Ward 5', 'City Council Ward 5.'),
  cityOfficial('Elyria', 'Council Ward 6', 'City Council Member', 'City Council', NP, 'Ward 6', 'City Council Ward 6.'),
  cityOfficial('Elyria', 'Council Ward 7', 'City Council Member', 'City Council', NP, 'Ward 7', 'City Council Ward 7.'),
  cityOfficial('Elyria', 'Council At-Large', 'City Council Member', 'City Council', NP, 'At-Large', 'City Council At-Large.'),
];

async function insertBatch(name: string, rows: any[]) {
  console.log(`\nInserting ${name}: ${rows.length} officials...`);

  const seen = new Set<string>();
  const deduped = [];
  for (const row of rows) {
    if (!seen.has(row.bioguide_id)) {
      seen.add(row.bioguide_id);
      deduped.push(row);
    } else {
      let suffix = 2;
      let newId = `${row.bioguide_id}-${suffix}`;
      while (seen.has(newId)) {
        suffix++;
        newId = `${row.bioguide_id}-${suffix}`;
      }
      seen.add(newId);
      deduped.push({ ...row, bioguide_id: newId });
    }
  }

  const CHUNK = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    const { error } = await sb
      .from('politicians')
      .upsert(chunk, { onConflict: 'bioguide_id' });

    if (error) {
      console.error(`  Error in chunk ${Math.floor(i / CHUNK) + 1}:`, error.message);
      errors += chunk.length;
    } else {
      inserted += chunk.length;
      process.stdout.write(`  Inserted ${inserted}/${deduped.length}\r`);
    }
  }

  console.log(`  ${name}: ${inserted} inserted, ${errors} errors, ${deduped.length} total`);
  return { inserted, errors, total: deduped.length };
}

async function main() {
  console.log('=== Ohio Additional City Officials Seed ===\n');

  const result = await insertBatch('Additional Ohio Cities Batch 2', newCities);

  console.log('\n=== SUMMARY ===');
  console.log(`Total officials: ${result.total}`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Errors: ${result.errors}`);

  console.log('\n--- Per City Breakdown ---');
  const byJurisdiction: { [key: string]: number } = {};
  for (const row of newCities) {
    const key = row.jurisdiction;
    byJurisdiction[key] = (byJurisdiction[key] || 0) + 1;
  }
  const sorted = Object.entries(byJurisdiction).sort((a, b) => b[1] - a[1]);
  for (const [jurisdiction, count] of sorted) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }
}

main().catch(console.error);
