/**
 * Seed Ohio County Elected Officials for 20 Additional Counties
 *
 * Counties: Ashtabula, Athens, Auglaize, Belmont, Brown, Carroll, Champaign, Clark, Clinton, Coshocton,
 * Crawford, Darke, Defiance, Erie, Fayette, Fulton, Gallia, Guernsey, Hardin, Harrison
 *
 * Usage:
 *   node scripts/seed-ohio-20-counties.js
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function makeId(county, office, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const countySlug = county.toLowerCase().replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, '-');
  return `oh-${countySlug}-${officeSlug}-${slug}`;
}

function official(county, name, office, officeLevel, party, bio) {
  return {
    bioguide_id: makeId(county, office, name),
    name,
    office,
    office_level: officeLevel,
    party,
    district: null,
    jurisdiction: `${county} County`,
    jurisdiction_type: 'county',
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
    bio: bio || `${office} of ${county} County, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-county-seed-2025',
  };
}

function countyOfficials(county, commissioners, sheriff, prosecutor, clerkOfCourts, auditor, treasurer, recorder, coroner, engineer) {
  const rows = [];

  // Commissioners (3)
  commissioners.forEach((c, i) => {
    rows.push(official(county, c.name, `County Commissioner`, 'County Commissioner', c.party,
      `County Commissioner of ${county} County, Ohio.`));
  });

  if (sheriff) rows.push(official(county, sheriff.name, 'Sheriff', 'Sheriff', sheriff.party));
  if (prosecutor) rows.push(official(county, prosecutor.name, 'Prosecuting Attorney', 'Prosecutor', prosecutor.party));
  if (clerkOfCourts) rows.push(official(county, clerkOfCourts.name, 'Clerk of Courts', 'Clerk of Courts', clerkOfCourts.party));
  if (auditor) rows.push(official(county, auditor.name, 'County Auditor', 'County Auditor', auditor.party));
  if (treasurer) rows.push(official(county, treasurer.name, 'County Treasurer', 'County Treasurer', treasurer.party));
  if (recorder) rows.push(official(county, recorder.name, 'County Recorder', 'County Recorder', recorder.party));
  if (coroner) rows.push(official(county, coroner.name, 'County Coroner', 'County Coroner', coroner.party));
  if (engineer) rows.push(official(county, engineer.name, 'County Engineer', 'County Engineer', engineer.party));

  return rows;
}

const R = 'Republican';
const D = 'Democrat';
const NP = 'Nonpartisan';

// ============================================================================
// BATCH 1: Ashtabula, Athens, Auglaize, Belmont, Brown
// ============================================================================

const batch1 = [
  // ASHTABULA COUNTY — Ohio roster, commissioners meet weekly
  ...countyOfficials('Ashtabula',
    [{ name: 'Richard Tuttle', party: R }, { name: 'Robert D. Yoder', party: R }, { name: 'David Buehler', party: R }],
    { name: 'Thomas Saporito', party: R },
    { name: 'Stefanie Seielstad', party: R },
    { name: 'Joyce Cook-Bell', party: D },
    { name: 'Scott Yamamoto', party: R },
    { name: 'Kimberly M. Malone', party: D },
    { name: 'Deborah Rosegart', party: D },
    { name: 'Erica Heisley', party: D },
    { name: 'Christine Flaherty', party: D }
  ),

  // ATHENS COUNTY
  ...countyOfficials('Athens',
    [{ name: 'Chris Chmiel', party: D }, { name: 'Charlie Adkins', party: D }, { name: 'Jim Creamer', party: D }],
    { name: 'Rodney Smith', party: R },
    { name: 'Keller Blackburn', party: D },
    { name: 'Candy Russell', party: D },
    { name: 'Melissa Caughey', party: D },
    { name: 'Taylor Sappington', party: D },
    { name: 'Jessica Markins', party: D },
    { name: 'Carl Ortman', party: D },
    { name: 'Jeff Maiden', party: D }
  ),

  // AUGLAIZE COUNTY
  ...countyOfficials('Auglaize',
    [{ name: 'David Bambauer', party: R }, { name: 'Doug Spencer', party: R }, { name: 'John Bergman', party: R }],
    { name: 'Michael L. Vorhees', party: R },
    { name: 'Benjamin R. Elder', party: R },
    { name: 'Rebecca Kuensting', party: R },
    { name: 'Becky Hatfield', party: R },
    { name: 'Terry Ary', party: R },
    { name: 'Laura Howell', party: R },
    { name: 'Dr. Jason Steinecker', party: NP },
    { name: 'Andrew Baumer', party: R }
  ),

  // BELMONT COUNTY
  ...countyOfficials('Belmont',
    [{ name: 'J. P. Dutton', party: R }, { name: 'Jerry Echemann', party: R }, { name: 'Vince Gianangeli', party: R }],
    { name: 'James G. Zusack', party: R },
    { name: 'Kevin Flanagan', party: R },
    { name: 'Laura A. Zupko', party: R },
    { name: 'Cindi Henry', party: R },
    { name: 'Katherine J. Kelich', party: R },
    { name: 'Jason A. Garczyk', party: R },
    { name: 'Amanda K. Fisher', party: R },
    { name: 'Terry D. Lively', party: R }
  ),

  // BROWN COUNTY
  ...countyOfficials('Brown',
    [{ name: 'David Painter', party: R }, { name: 'Bonnie Batchler', party: R }, { name: 'Bobby Leach', party: R }],
    { name: 'Leland "Lee" Stickel', party: R },
    { name: 'Jill Spears', party: R },
    { name: 'Debra Dempsey', party: R },
    { name: 'Mitchell Kile', party: R },
    { name: 'Pam Gipson', party: R },
    { name: 'Jerald M. Falk', party: R },
    { name: 'Michael Heisey', party: R },
    { name: 'John Frazier', party: R }
  ),
];

// ============================================================================
// BATCH 2: Carroll, Champaign, Clark, Clinton, Coshocton
// ============================================================================

const batch2 = [
  // CARROLL COUNTY
  ...countyOfficials('Carroll',
    [{ name: 'Robert E. Wirkner', party: R }, { name: 'Janet Larson', party: R }, { name: 'Dennis Mowat', party: R }],
    { name: 'Calvin A. Graham', party: R },
    { name: 'Steven D. Barnett', party: R },
    { name: 'William R. Wohlwend', party: R },
    { name: 'Staci Brady', party: R },
    { name: 'Jeff Yeager', party: R },
    { name: 'Patricia Oyer', party: R },
    { name: 'Mandal B. Haas', party: NP },
    { name: 'Brian J. Wise', party: R }
  ),

  // CHAMPAIGN COUNTY
  ...countyOfficials('Champaign',
    [{ name: 'Timothy D. Cassady', party: R }, { name: 'Steven R. Hess', party: R }, { name: 'Charles Arnold', party: R }],
    { name: 'Chad M. Burroughs', party: R },
    { name: 'Kevin S. Talebi', party: R },
    { name: 'Penny S. Underwood', party: R },
    { name: 'Mark Potts', party: R },
    { name: 'Robin K. Edwards', party: R },
    { name: 'Glenda L. Bayman', party: R },
    { name: 'Steven J. Tornik', party: R },
    { name: 'Stephen Earl McCall', party: R }
  ),

  // CLARK COUNTY
  ...countyOfficials('Clark',
    [{ name: 'Lowell E. Holden', party: R }, { name: 'Mark Williamson', party: D }, { name: 'Gwendolyn Brown', party: D }],
    { name: 'Mark Watt', party: R },
    { name: 'Melissa H. Navarre', party: D },
    { name: 'Rebecca Kniffin', party: D },
    { name: 'John Mardis', party: R },
    { name: 'Jill Spears', party: D },
    { name: 'Scott Hiner', party: R },
    { name: 'Dr. Clayton Moody', party: NP },
    { name: 'Jud Paskell', party: R }
  ),

  // CLINTON COUNTY
  ...countyOfficials('Clinton',
    [{ name: 'Richard Gerke', party: R }, { name: 'Douglas Cole', party: R }, { name: 'David Hess', party: R }],
    { name: 'James M. Roach', party: R },
    { name: 'Andrew T. McCoy', party: R },
    { name: 'Cynthia R. Bailey', party: R },
    { name: 'Andrea M. Hoehler', party: R },
    { name: 'Mary E. Whitman', party: R },
    { name: 'Vickie S. Donahoe', party: R },
    { name: 'Dr. Ronald G. Seaman', party: NP },
    { name: 'Gene Huelsman', party: R }
  ),

  // COSHOCTON COUNTY
  ...countyOfficials('Coshocton',
    [{ name: 'Glenn Barrett', party: R }, { name: 'Tom Whalen', party: R }, { name: 'Larry Strickland', party: R }],
    { name: 'James Crawford', party: R },
    { name: 'Robert Barkman', party: R },
    { name: 'Patricia Kirleis', party: R },
    { name: 'Maria Lutz', party: R },
    { name: 'Carla Hoop', party: R },
    { name: 'Jennifer Badger', party: R },
    { name: 'Mark Matthews', party: R },
    { name: 'William Fay', party: R }
  ),
];

// ============================================================================
// BATCH 3: Crawford, Darke, Defiance, Erie, Fayette
// ============================================================================

const batch3 = [
  // CRAWFORD COUNTY
  ...countyOfficials('Crawford',
    [{ name: 'Jeff Price', party: R }, { name: 'Tim Ley', party: R }, { name: 'Larry Schmidt', party: R }],
    { name: 'Scott E. Kent', party: R },
    { name: 'Matthew Cryer', party: R },
    { name: 'Jennifer Romaker', party: R },
    { name: 'Robyn M. Sheets', party: R },
    { name: 'Steve Reinhard', party: R },
    { name: 'Bonnie Cotton', party: R },
    { name: 'Robert Zehler', party: NP },
    { name: 'Mark E. Baker', party: R }
  ),

  // DARKE COUNTY
  ...countyOfficials('Darke',
    [{ name: 'Fredrick Stegeman', party: R }, { name: 'Eddie Elyn', party: R }, { name: 'Stephen Hockenbery', party: R }],
    { name: 'Mark Whittaker', party: R },
    { name: 'Jason Drake', party: R },
    { name: 'Patricia Quay', party: R },
    { name: 'Carol Ginn', party: R },
    { name: 'Scott Zumbrink', party: R },
    { name: 'James Herring', party: R },
    { name: 'Dr. Christopher Bowen', party: NP },
    { name: 'Jim Surber', party: R }
  ),

  // DEFIANCE COUNTY
  ...countyOfficials('Defiance',
    [{ name: 'Matthew Koester', party: R }, { name: 'Mick Pocratsky', party: R }, { name: 'David S. Kern', party: R }],
    { name: 'Douglas J. Engel', party: R },
    { name: 'Morris J. Murray', party: R },
    { name: 'Dan Crites', party: R },
    { name: 'Sherri Schimmel', party: R },
    { name: 'Vickie S. Myers', party: R },
    { name: 'Cecilia A. Parsons', party: R },
    { name: 'John J. Racciato', party: NP },
    { name: 'Warren Schlatter', party: R }
  ),

  // ERIE COUNTY
  ...countyOfficials('Erie',
    [{ name: 'Steve Shoffner', party: R }, { name: 'Mindy Kayl', party: D }, { name: 'George Spiess', party: R }],
    { name: 'James Sigsworth', party: R },
    { name: 'Becky Schimmoeller', party: D },
    { name: 'Sheila Frazier', party: D },
    { name: 'Paul Meisel', party: D },
    { name: 'Cindy McIntyre', party: D },
    { name: 'Nicholas J. Smith', party: R },
    { name: 'Richard Gebhardt', party: NP },
    { name: 'Christopher Gabelein', party: R }
  ),

  // FAYETTE COUNTY
  ...countyOfficials('Fayette',
    [{ name: 'Anthony R. Anderson', party: R }, { name: 'Amy Wright', party: D }, { name: 'Donald L. Fleak', party: R }],
    { name: 'Vernon P. Stanforth', party: R },
    { name: 'Jess C. Weade', party: R },
    { name: 'Sandra I. Wilson', party: R },
    { name: 'Auditor', party: R },
    { name: 'Penny J. Patton', party: R },
    { name: 'Kim Coil-Butler', party: R },
    { name: 'Lenora Fitton', party: R },
    { name: 'Jason Little', party: R }
  ),
];

// ============================================================================
// BATCH 4: Fulton, Gallia, Guernsey, Hardin, Harrison
// ============================================================================

const batch4 = [
  // FULTON COUNTY
  ...countyOfficials('Fulton',
    [{ name: 'Bob Reily', party: R }, { name: 'Maryjo Kuhns', party: R }, { name: 'Mike Holzer', party: R }],
    { name: 'Roberta Stacy', party: R },
    { name: 'Kyle Schaub', party: R },
    { name: 'Susan Seever', party: R },
    { name: 'Karen Schofield', party: R },
    { name: 'Kelley Kunkler', party: R },
    { name: 'Jacqueline Knecht', party: R },
    { name: 'Dr. Russ Diedrick', party: NP },
    { name: 'Matt Wildermuth', party: R }
  ),

  // GALLIA COUNTY
  ...countyOfficials('Gallia',
    [{ name: 'Q. Jay Stapleton', party: R }, { name: 'Jeremy Kroll', party: R }, { name: 'David K. Smith', party: R }],
    { name: 'Matthew D. Champlin', party: R },
    { name: 'Jason Holdren', party: R },
    { name: 'Anita Moore', party: R },
    { name: 'Stephanie Dixon', party: R },
    { name: 'Steve McGhee', party: R },
    { name: 'Jeffery A. Halley', party: R },
    { name: 'Daniel H. Whiteley', party: R },
    { name: 'Brett A. Boothe', party: R }
  ),

  // GUERNSEY COUNTY
  ...countyOfficials('Guernsey',
    [{ name: 'Dave Wilson', party: R }, { name: 'Brent Clements', party: R }, { name: 'David Ayo', party: R }],
    { name: 'Jeffrey D. Paden', party: R },
    { name: 'Lindsey Angler', party: R },
    { name: 'Jennifer Johnson', party: R },
    { name: 'Cory Johnson', party: R },
    { name: 'James Caldwell', party: R },
    { name: 'Marilyn Callahan', party: R },
    { name: 'Sandra M. Schubert', party: R },
    { name: 'Paul Sherry', party: R }
  ),

  // HARDIN COUNTY
  ...countyOfficials('Hardin',
    [{ name: 'Roger Crowe', party: R }, { name: 'Fred Rush', party: R }, { name: 'Ralph Guthrie', party: R }],
    { name: 'Josh Beachler', party: R },
    { name: 'Joshua Leach', party: R },
    { name: 'Julie Barnhill', party: R },
    { name: 'Auditor', party: R },
    { name: 'Terri L. Downey', party: R },
    { name: 'Linda Reeves', party: R },
    { name: 'Ed Riffle', party: NP },
    { name: 'Brian Doyle', party: R }
  ),

  // HARRISON COUNTY
  ...countyOfficials('Harrison',
    [{ name: 'Carl Erickson', party: R }, { name: 'Chris Wilkinson', party: R }, { name: 'Clint Stalnaker', party: R }],
    { name: 'Ronald J. Guehlstorf', party: R },
    { name: 'Michael McGrath', party: R },
    { name: 'Patricia Smiley', party: R },
    { name: 'Allison Anderson', party: R },
    { name: 'Vicki Sefsick', party: R },
    { name: 'Joshua Willis', party: R },
    { name: 'Roger Coles', party: NP },
    { name: 'Jason Emery', party: R }
  ),
];

// ============================================================================
// MAIN: Insert all batches
// ============================================================================

async function insertBatch(name, rows) {
  console.log(`\nInserting ${name}: ${rows.length} officials...`);

  // Deduplicate by bioguide_id
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!seen.has(row.bioguide_id)) {
      seen.add(row.bioguide_id);
      deduped.push(row);
    } else {
      // Append a suffix to make unique
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
  console.log('=== Ohio 20 Additional County Officials Seed ===\n');

  const results = [];

  results.push(await insertBatch('Batch 1 (Ashtabula, Athens, Auglaize, Belmont, Brown)', batch1));
  results.push(await insertBatch('Batch 2 (Carroll, Champaign, Clark, Clinton, Coshocton)', batch2));
  results.push(await insertBatch('Batch 3 (Crawford, Darke, Defiance, Erie, Fayette)', batch3));
  results.push(await insertBatch('Batch 4 (Fulton, Gallia, Guernsey, Hardin, Harrison)', batch4));

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const grandTotal = results.reduce((s, r) => s + r.total, 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Total officials: ${grandTotal}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Errors: ${totalErrors}`);

  // Print per-county breakdown
  console.log('\n--- Per County Breakdown ---');
  const allRows = [...batch1, ...batch2, ...batch3, ...batch4];
  const byJurisdiction = {};
  for (const row of allRows) {
    const key = row.jurisdiction;
    byJurisdiction[key] = (byJurisdiction[key] || 0) + 1;
  }
  const sorted = Object.entries(byJurisdiction).sort((a, b) => b[1] - a[1]);
  for (const [jurisdiction, count] of sorted) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }
}

main().catch(console.error);
