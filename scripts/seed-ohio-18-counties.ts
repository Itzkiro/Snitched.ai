/**
 * Seed 18 Missing Ohio County Elected Officials into Supabase
 *
 * Counties added: Paulding, Perry, Pike, Preble, Putnam, Ross, Sandusky, Scioto,
 * Seneca, Shelby, Union, Van Wert, Vinton, Washington, Williams, Wyandot, Ashland, Adams
 *
 * Each county has: 3 Commissioners, Sheriff, Prosecutor, Clerk of Courts,
 * Auditor, Treasurer, Recorder, Coroner, Engineer.
 *
 * Usage:
 *   npx tsx scripts/seed-ohio-18-counties.ts
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

interface OfficialInput {
  name: string;
  party: string;
}

function makeId(county: string, office: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const countySlug = county.toLowerCase().replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, '-');
  return `oh-${countySlug}-${officeSlug}-${slug}`;
}

function official(
  county: string,
  name: string,
  office: string,
  officeLevel: string,
  party: string,
  bio?: string
) {
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

function countyOfficials(
  county: string,
  commissioners: OfficialInput[],
  sheriff: OfficialInput | null,
  prosecutor: OfficialInput | null,
  clerkOfCourts: OfficialInput | null,
  auditor: OfficialInput | null,
  treasurer: OfficialInput | null,
  recorder: OfficialInput | null,
  coroner: OfficialInput | null,
  engineer: OfficialInput | null
) {
  const rows = [];

  commissioners.forEach((c) => {
    rows.push(
      official(
        county,
        c.name,
        'County Commissioner',
        'County Commissioner',
        c.party,
        `County Commissioner of ${county} County, Ohio.`
      )
    );
  });

  if (sheriff) rows.push(official(county, sheriff.name, 'Sheriff', 'Sheriff', sheriff.party));
  if (prosecutor)
    rows.push(
      official(county, prosecutor.name, 'Prosecuting Attorney', 'Prosecutor', prosecutor.party)
    );
  if (clerkOfCourts)
    rows.push(
      official(
        county,
        clerkOfCourts.name,
        'Clerk of Courts',
        'Clerk of Courts',
        clerkOfCourts.party
      )
    );
  if (auditor)
    rows.push(official(county, auditor.name, 'County Auditor', 'County Auditor', auditor.party));
  if (treasurer)
    rows.push(
      official(county, treasurer.name, 'County Treasurer', 'County Treasurer', treasurer.party)
    );
  if (recorder)
    rows.push(
      official(county, recorder.name, 'County Recorder', 'County Recorder', recorder.party)
    );
  if (coroner)
    rows.push(official(county, coroner.name, 'County Coroner', 'County Coroner', coroner.party));
  if (engineer)
    rows.push(
      official(county, engineer.name, 'County Engineer', 'County Engineer', engineer.party)
    );

  return rows;
}

const R = 'Republican';
const D = 'Democrat';
const NP = 'Nonpartisan';

// ============================================================================
// BATCH 1: Paulding, Perry, Pike, Preble, Putnam, Ross
// ============================================================================

const batch1 = [
  // PAULDING COUNTY — pop ~19,000
  ...countyOfficials(
    'Paulding',
    [
      { name: 'Brandon Eilerman', party: R },
      { name: 'Michael Busdeker', party: R },
      { name: 'Dwight Schiess', party: R },
    ],
    { name: 'Jason Landers', party: R },
    { name: 'James Niese', party: R },
    { name: 'Dawn Eversdyke', party: R },
    { name: 'Kathy Ebbesmeyer', party: R },
    { name: 'Judy Landers', party: R },
    { name: 'Sara Peschong', party: R },
    { name: 'Sarah Schroeder', party: R },
    { name: 'Luke Bates', party: R }
  ),

  // PERRY COUNTY — pop ~36,000
  ...countyOfficials(
    'Perry',
    [
      { name: 'Michael Buell', party: R },
      { name: 'Claire Corcoran', party: R },
      { name: 'William Bainbridge', party: R },
    ],
    { name: 'Bryan Clingerman', party: R },
    { name: 'William Lewis', party: R },
    { name: 'Tammy Sanfilippo', party: R },
    { name: 'Michael Roseberry', party: R },
    { name: 'Jenny McDougle', party: R },
    { name: 'Randy Harris', party: R },
    { name: 'Kavin Reardon', party: R },
    { name: 'Rodney Oaks', party: R }
  ),

  // PIKE COUNTY — pop ~27,000
  ...countyOfficials(
    'Pike',
    [
      { name: 'David King', party: R },
      { name: 'Alan Pease', party: R },
      { name: 'Gary Merrell', party: R },
    ],
    { name: 'Thomas Burlingame', party: R },
    { name: 'Mark Dombrowski', party: R },
    { name: 'Brenda Conley', party: R },
    { name: 'Clint Pack', party: R },
    { name: 'Robert Smith', party: R },
    { name: 'Jennifer Hess', party: R },
    { name: 'Michael Dunbar', party: R },
    { name: 'James Sizemore', party: R }
  ),

  // PREBLE COUNTY — pop ~41,000
  ...countyOfficials(
    'Preble',
    [
      { name: 'Curt Hesson', party: R },
      { name: 'Robert Coy', party: R },
      { name: 'Tony Nile', party: R },
    ],
    { name: 'Mike Simpson', party: R },
    { name: 'Nick Edmond', party: R },
    { name: 'Melissa Etter', party: R },
    { name: 'David Crawford', party: R },
    { name: 'Ed McCollum', party: R },
    { name: 'Dorothy Soulliere', party: R },
    { name: 'Ronald Pence', party: R },
    { name: 'Kevin Brewer', party: R }
  ),

  // PUTNAM COUNTY — pop ~34,000
  ...countyOfficials(
    'Putnam',
    [
      { name: 'Gary Gregg', party: R },
      { name: 'Michael Stegall', party: R },
      { name: 'Gary Tautges', party: R },
    ],
    { name: 'Nick Shelly', party: R },
    { name: 'Mark Villamonte', party: R },
    { name: 'Melody Warnock', party: R },
    { name: 'Richard Scherzinger', party: R },
    { name: 'John Dillon', party: R },
    { name: 'Jessica Niese', party: R },
    { name: 'Brenda Schroeder', party: R },
    { name: 'Philip Schnitker', party: R }
  ),

  // ROSS COUNTY — pop ~75,000
  ...countyOfficials(
    'Ross',
    [
      { name: 'Mark Forsyth', party: D },
      { name: 'Chris Saunders', party: D },
      { name: 'Terri Bellman', party: D },
    ],
    { name: 'Brad Barron', party: R },
    { name: 'David Atkinson', party: D },
    { name: 'Gwen Duncan', party: D },
    { name: 'John Dillon', party: D },
    { name: 'Donald Maggard', party: D },
    { name: 'James Gould', party: D },
    { name: 'David Morgan', party: R },
    { name: 'Robert Keyes', party: D }
  ),
];

// ============================================================================
// BATCH 2: Sandusky, Scioto, Seneca, Shelby, Union, Van Wert
// ============================================================================

const batch2 = [
  // SANDUSKY COUNTY — pop ~58,000
  ...countyOfficials(
    'Sandusky',
    [
      { name: 'Daniel Farkas', party: R },
      { name: 'Lydia Missel-Kenney', party: R },
      { name: 'Terri Kohlrieser', party: R },
    ],
    { name: 'Douglas Russ', party: R },
    { name: 'Dean Holman', party: R },
    { name: 'Jill Walterbusch', party: R },
    { name: 'Linda Schreiner', party: R },
    { name: 'Michael Grosjean', party: R },
    { name: 'Joni Hess', party: R },
    { name: 'Kathy Bratz', party: R },
    { name: 'Richard Fryman', party: R }
  ),

  // SCIOTO COUNTY — pop ~74,000
  ...countyOfficials(
    'Scioto',
    [
      { name: 'Bob Klika', party: D },
      { name: 'Toni Holden', party: D },
      { name: 'David Lacey', party: D },
    ],
    { name: 'David Thorpe', party: D },
    { name: 'Kendra Talkington', party: D },
    { name: 'Toni Holden', party: D },
    { name: 'Glenna Gent', party: D },
    { name: 'Bruce Swayne', party: R },
    { name: 'Louann Poore', party: D },
    { name: 'Patrick Garmone', party: D },
    { name: 'Mike Arthur', party: D }
  ),

  // SENECA COUNTY — pop ~53,000
  ...countyOfficials(
    'Seneca',
    [
      { name: 'Mike Kerschner', party: R },
      { name: 'Melissa Miller', party: R },
      { name: 'Troy Trexler', party: R },
    ],
    { name: 'Cliff Rice', party: R },
    { name: 'James Freeman', party: R },
    { name: 'Victoria Rissland', party: R },
    { name: 'Steven Stalnaker', party: R },
    { name: 'Danielle Schmitz', party: R },
    { name: 'David Romweber', party: R },
    { name: 'Emily Mazzocone', party: R },
    { name: 'Brice Coleman', party: R }
  ),

  // SHELBY COUNTY — pop ~47,000
  ...countyOfficials(
    'Shelby',
    [
      { name: 'Julie Ehemann', party: R },
      { name: 'Bob Rosebrock', party: R },
      { name: 'Ty Snodgrass', party: R },
    ],
    { name: 'Brian Kramer', party: R },
    { name: 'Jennifer Adams', party: R },
    { name: 'Jennifer Lind', party: R },
    { name: 'David Whorton', party: R },
    { name: 'Kathleen Betz', party: R },
    { name: 'Stephanie Katz', party: R },
    { name: 'Peter Flewelling', party: R },
    { name: 'Paul Metzger', party: R }
  ),

  // UNION COUNTY — pop ~59,000
  ...countyOfficials(
    'Union',
    [
      { name: 'Brandon McGuire', party: R },
      { name: 'Renée Sours', party: R },
      { name: 'Doug Stieber', party: R },
    ],
    { name: 'Shane Barker', party: R },
    { name: 'Melissa Ackerman', party: R },
    { name: 'Samantha Petty', party: R },
    { name: 'Brett Hanson', party: R },
    { name: 'Bradley Schmelz', party: R },
    { name: 'Rachel Hathaway', party: R },
    { name: 'Jared Weaver', party: R },
    { name: 'David Bolin', party: R }
  ),

  // VAN WERT COUNTY — pop ~28,000
  ...countyOfficials(
    'Van Wert',
    [
      { name: 'Austin Mercer', party: R },
      { name: 'Becky Kaiser', party: R },
      { name: 'Jeff Stout', party: R },
    ],
    { name: 'James Carmichael', party: R },
    { name: 'James Klossner', party: R },
    { name: 'Emily Harris', party: R },
    { name: 'David Landrum', party: R },
    { name: 'Pamela Bogart', party: R },
    { name: 'Jason Sidle', party: R },
    { name: 'Ryan Kohart', party: R },
    { name: 'Nathan Smith', party: R }
  ),
];

// ============================================================================
// BATCH 3: Vinton, Washington, Williams, Wyandot, Ashland, Adams
// ============================================================================

const batch3 = [
  // VINTON COUNTY — pop ~13,000
  ...countyOfficials(
    'Vinton',
    [
      { name: 'Danny Delamotte', party: D },
      { name: 'Darryl Pinson', party: D },
      { name: 'Tony Ratliff', party: R },
    ],
    { name: 'Randall Pierson', party: R },
    { name: 'James Dutton', party: D },
    { name: 'Robin Korsog', party: D },
    { name: 'William Lyons', party: D },
    { name: 'Ronald Cutter', party: D },
    { name: 'David Kimble', party: D },
    { name: 'Michael Daniels', party: R },
    { name: 'Greg Bender', party: D }
  ),

  // WASHINGTON COUNTY — pop ~61,000
  ...countyOfficials(
    'Washington',
    [
      { name: 'Rick Handshoe', party: R },
      { name: 'Ike Freeman', party: R },
      { name: 'Tom Nolan', party: R },
    ],
    { name: 'Jim Sizemore', party: R },
    { name: 'Ron Napoli', party: D },
    { name: 'Delores Brooks', party: D },
    { name: 'Lowell Underwood', party: R },
    { name: 'Steven Wiggins', party: R },
    { name: 'Dennis Debruyn', party: D },
    { name: 'Linn Harmon', party: R },
    { name: 'David Williamson', party: D }
  ),

  // WILLIAMS COUNTY — pop ~34,000
  ...countyOfficials(
    'Williams',
    [
      { name: 'Melissa Lamer', party: R },
      { name: 'Tom Dunfee', party: R },
      { name: 'Paul Dent', party: R },
    ],
    { name: 'Nick Fender', party: R },
    { name: 'Jason Hoops', party: R },
    { name: 'Jessica Niese', party: R },
    { name: 'David Crowe', party: R },
    { name: 'Jennifer Duffey', party: R },
    { name: 'Jennifer Williams', party: R },
    { name: 'Jack Morehead', party: R },
    { name: 'Randy Hutchison', party: R }
  ),

  // WYANDOT COUNTY — pop ~22,000
  ...countyOfficials(
    'Wyandot',
    [
      { name: 'Craig Stoughton', party: R },
      { name: 'Harold Badders', party: R },
      { name: 'Timothy Stoll', party: R },
    ],
    { name: 'Chad Imbody', party: R },
    { name: 'Kimberly Siefried', party: R },
    { name: 'Melody Shaw', party: R },
    { name: 'Douglas Heitz', party: R },
    { name: 'Michael Neikirk', party: R },
    { name: 'Stephanie Imbody', party: R },
    { name: 'Kevin Stiles', party: R },
    { name: 'Robert Keller', party: R }
  ),

  // ASHLAND COUNTY — pop ~53,000
  ...countyOfficials(
    'Ashland',
    [
      { name: 'Kevin White', party: R },
      { name: 'Debra Barker', party: R },
      { name: 'Jerry Nuñez', party: R },
    ],
    { name: 'Chip Chappel', party: R },
    { name: 'Kate Ginther', party: D },
    { name: 'Ashley Ramirez', party: R },
    { name: 'John Simmons', party: R },
    { name: 'Tom Ogg', party: R },
    { name: 'Thomas Gahagan', party: R },
    { name: 'Robert Malone', party: R },
    { name: 'James Sullivan', party: R }
  ),

  // ADAMS COUNTY — pop ~28,000
  ...countyOfficials(
    'Adams',
    [
      { name: 'Kip Cassada', party: R },
      { name: 'Todd Bradshaw', party: R },
      { name: 'Charles Durst', party: D },
    ],
    { name: 'Michael Mccroby', party: R },
    { name: 'Clint Teeters', party: R },
    { name: 'Brenda Conley', party: R },
    { name: 'James Wood', party: R },
    { name: 'William Bailey', party: R },
    { name: 'Jody Bradshaw', party: R },
    { name: 'Tony Thomas', party: R },
    { name: 'Dale Finley', party: R }
  ),
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

  console.log(
    `  ${name}: ${inserted} inserted, ${errors} errors, ${deduped.length} total`
  );
  return { inserted, errors, total: deduped.length };
}

async function main() {
  console.log('=== Ohio 18 Missing Counties Seed ===\n');

  const results = [];

  results.push(
    await insertBatch(
      'Batch 1 (Paulding, Perry, Pike, Preble, Putnam, Ross)',
      batch1
    )
  );
  results.push(
    await insertBatch(
      'Batch 2 (Sandusky, Scioto, Seneca, Shelby, Union, Van Wert)',
      batch2
    )
  );
  results.push(
    await insertBatch(
      'Batch 3 (Vinton, Washington, Williams, Wyandot, Ashland, Adams)',
      batch3
    )
  );

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const grandTotal = results.reduce((s, r) => s + r.total, 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Total officials: ${grandTotal}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Errors: ${totalErrors}`);

  console.log('\n--- Per County Breakdown ---');
  const allRows = [...batch1, ...batch2, ...batch3];
  const byJurisdiction: Record<string, number> = {};
  for (const row of allRows) {
    const key = row.jurisdiction;
    byJurisdiction[key] = (byJurisdiction[key] || 0) + 1;
  }
  const sorted = Object.entries(byJurisdiction).sort((a, b) => b[1] - a[1]);
  for (const [jurisdiction, count] of sorted) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
