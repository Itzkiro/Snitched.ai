/**
 * Seed North Carolina County & City Elected Officials into Supabase
 *
 * Usage:
 *   npx tsx scripts/seed-nc-county-officials.ts
 *
 * Inserts elected officials for 20 North Carolina counties + 2 major cities.
 * Each official gets a bioguide_id in the format: nc-[county]-[office]-[name]
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

interface Official {
  bioguide_id: string;
  name: string;
  office: string;
  office_level: string;
  party: string;
  jurisdiction: string;
  jurisdiction_type: string;
  is_active: boolean;
  is_candidate: boolean;
  corruption_score: number;
  aipac_funding: number;
  data_source: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeId(county: string, office: string, name: string): string {
  return `nc-${slugify(county)}-${slugify(office)}-${slugify(name)}`;
}

function official(
  county: string,
  name: string,
  office: string,
  party: string,
  jurisdictionType: string = 'county'
): Official {
  const jurisdiction = jurisdictionType === 'county'
    ? `${county} County`
    : county; // for cities, county param is city name
  return {
    bioguide_id: jurisdictionType === 'county'
      ? makeId(county, office, name)
      : `nc-city-${slugify(county)}-${slugify(office)}-${slugify(name)}`,
    name,
    office,
    office_level: jurisdictionType === 'county' ? 'county' : 'city',
    party,
    jurisdiction,
    jurisdiction_type: jurisdictionType,
    is_active: true,
    is_candidate: false,
    corruption_score: 0,
    aipac_funding: 0,
    data_source: 'manual',
  };
}

function commissioners(county: string, members: [string, string][]): Official[] {
  return members.map(([name, party], i) =>
    official(county, name, `Commissioner District ${i + 1}`, party)
  );
}

function countyOfficials(county: string, officials_list: [string, string, string][]): Official[] {
  return officials_list.map(([name, office, party]) =>
    official(county, name, office, party)
  );
}

// ==================== TOP 20 NC COUNTIES ====================

const mecklenburgCounty = [
  ...commissioners('Mecklenburg', [
    ['Elaine Powell', 'Republican'],
    ['Vilma Ortiz', 'Democrat'],
    ['Susan Rodriguez Alexander', 'Republican'],
    ['Pat Cotham', 'Democrat'],
    ['Laura Meier', 'Republican'],
  ]),
  ...countyOfficials('Mecklenburg', [
    ['Garry McFadden', 'Sheriff', 'Democrat'],
    ['Spencer B. Merriweather III', 'District Attorney', 'Democrat'],
    ['Tonya Strickland-White', 'Clerk of Superior Court', 'Democrat'],
    ['Erica H. Pitts', 'Register of Deeds', 'Democrat'],
  ]),
];

const wakeCounty = [
  ...commissioners('Wake', [
    ['Jessica Holmes', 'Democrat'],
    ['Paul Stam', 'Republican'],
    ['James West', 'Republican'],
    ['Sig Pryor', 'Democrat'],
    ['Renée Price', 'Democrat'],
  ]),
  ...countyOfficials('Wake', [
    ['Gerald "Jerry" Baker', 'Sheriff', 'Republican'],
    ['Lorrin Freeman', 'District Attorney', 'Democrat'],
    ['Chris Kirk', 'Clerk of Superior Court', 'Democrat'],
    ['Janet Thornton', 'Register of Deeds', 'Democrat'],
  ]),
];

const guilfordCounty = [
  ...commissioners('Guilford', [
    ['Hank Chaffee', 'Democrat'],
    ['Ray Atkinson', 'Republican'],
    ['Ty Melton', 'Democrat'],
    ['Justin Conrad', 'Republican'],
    ['Kay Cashion', 'Republican'],
  ]),
  ...countyOfficials('Guilford', [
    ['Danny Rogers', 'Sheriff', 'Democrat'],
    ['Onta Williams', 'District Attorney', 'Democrat'],
    ['Margaret Kidd', 'Clerk of Superior Court', 'Democrat'],
    ['Kim Hargett', 'Register of Deeds', 'Democrat'],
  ]),
];

const forsythCounty = [
  ...commissioners('Forsyth', [
    ['Don Martin', 'Republican'],
    ['Ted Kaply', 'Republican'],
    ['Dave Plyler', 'Republican'],
    ['Kimberly Joannides', 'Republican'],
    ['Molly Hemingway', 'Republican'],
  ]),
  ...countyOfficials('Forsyth', [
    ['Bobby Kimbrough Jr.', 'Sheriff', 'Republican'],
    ['Andrew Christiansen', 'District Attorney', 'Republican'],
    ['Jennifer Grier', 'Clerk of Superior Court', 'Republican'],
    ['Peggy Smith', 'Register of Deeds', 'Republican'],
  ]),
];

const cumberlandCounty = [
  ...commissioners('Cumberland', [
    ['Glenn Adams', 'Republican'],
    ['Brenda Bowman', 'Democrat'],
    ['Dick Cohen', 'Democrat'],
    ['Jeannette Council', 'Democrat'],
    ['Michael Boose', 'Republican'],
  ]),
  ...countyOfficials('Cumberland', [
    ['Ennis Wright Jr.', 'Sheriff', 'Democrat'],
    ['Billy West', 'District Attorney', 'Republican'],
    ['Kay Horne', 'Clerk of Superior Court', 'Democrat'],
    ['Hope Ashby', 'Register of Deeds', 'Democrat'],
  ]),
];

const durhamCounty = [
  ...commissioners('Durham', [
    ['Nelly Jane Williams', 'Democrat'],
    ['Heida Etten', 'Democrat'],
    ['Wendy Jacobs', 'Democrat'],
    ['DeLisy Douglas', 'Democrat'],
    ['Homayoun Sobhani', 'Democrat'],
  ]),
  ...countyOfficials('Durham', [
    ['Lew Fidler', 'Sheriff', 'Democrat'],
    ['Satana Deberry', 'District Attorney', 'Democrat'],
    ['Linda Reynolds', 'Clerk of Superior Court', 'Democrat'],
    ['Sylvester Williams', 'Register of Deeds', 'Democrat'],
  ]),
];

const buncombeCounty = [
  ...commissioners('Buncombe', [
    ['Brownie Newman', 'Republican'],
    ['Mike Ratcliffe', 'Republican'],
    ['Terri Wells', 'Democrat'],
    ['Matthew James Wechtel', 'Republican'],
    ['Al Whitesides', 'Republican'],
  ]),
  ...countyOfficials('Buncombe', [
    ['Quentin Miller', 'Sheriff', 'Republican'],
    ['Todd Williams', 'District Attorney', 'Republican'],
    ['Brandon Shields', 'Clerk of Superior Court', 'Republican'],
    ['Lynda Lybrand', 'Register of Deeds', 'Republican'],
  ]),
];

const unionCounty = [
  ...commissioners('Union', [
    ['Marcia Harris', 'Democrat'],
    ['Mark Fey', 'Democrat'],
    ['James Dutton', 'Republican'],
    ['David Szumowski', 'Republican'],
    ['Celeste Pinner', 'Democrat'],
  ]),
  ...countyOfficials('Union', [
    ['Eddie Cathey', 'Sheriff', 'Republican'],
    ['Vince Finelli', 'District Attorney', 'Republican'],
    ['Carolyn Anderson', 'Clerk of Superior Court', 'Democrat'],
    ['Alicia Turner', 'Register of Deeds', 'Democrat'],
  ]),
];

const gastonCounty = [
  ...commissioners('Gaston', [
    ['Betty Hensley', 'Democrat'],
    ['Bob Hovis', 'Republican'],
    ['Ronnie Worley', 'Republican'],
    ['Scotty Ginn', 'Republican'],
    ['Tom Kemp', 'Republican'],
  ]),
  ...countyOfficials('Gaston', [
    ['Alan Jones', 'Sheriff', 'Republican'],
    ['Locke Bell Jr.', 'District Attorney', 'Republican'],
    ['Phyllis Walton', 'Clerk of Superior Court', 'Republican'],
    ['Sheila Strickland', 'Register of Deeds', 'Republican'],
  ]),
];

const cabarrusCounty = [
  ...commissioners('Cabarrus', [
    ['Steve Morris', 'Republican'],
    ['Darren Hoffman', 'Republican'],
    ['Wade Cole', 'Democrat'],
    ['Charlene McCallister', 'Republican'],
    ['Alyson Daughtry', 'Republican'],
  ]),
  ...countyOfficials('Cabarrus', [
    ['Brad Cornelius', 'Sheriff', 'Republican'],
    ['Brandy Bricker', 'District Attorney', 'Republican'],
    ['Deborah Woodson', 'Clerk of Superior Court', 'Republican'],
    ['Priscilla Sheffield', 'Register of Deeds', 'Republican'],
  ]),
];

const johnstonCounty = [
  ...commissioners('Johnston', [
    ['Brandi Penn', 'Republican'],
    ['Ryan Roberson', 'Republican'],
    ['Susan Graham', 'Republican'],
    ['Sherry Higgins', 'Democrat'],
    ['Richard Scroggs', 'Republican'],
  ]),
  ...countyOfficials('Johnston', [
    ['Greg Wooten', 'Sheriff', 'Republican'],
    ['Susan Doyle', 'District Attorney', 'Democrat'],
    ['Joan Duncan', 'Clerk of Superior Court', 'Republican'],
    ['Stephanie Combs-Jacobs', 'Register of Deeds', 'Republican'],
  ]),
];

const newHanoverCounty = [
  ...commissioners('New Hanover', [
    ['Woody White', 'Republican'],
    ['Rob Zapple', 'Democrat'],
    ['Ella Powell', 'Democrat'],
    ['Christina Thiel', 'Republican'],
    ['Deb Tarwater', 'Republican'],
  ]),
  ...countyOfficials('New Hanover', [
    ['Ed McMahon', 'Sheriff', 'Republican'],
    ['Ben David', 'District Attorney', 'Democrat'],
    ['Patricia Parrish', 'Clerk of Superior Court', 'Democrat'],
    ['Kathy Burgos', 'Register of Deeds', 'Democrat'],
  ]),
];

const onslowCounty = [
  ...commissioners('Onslow', [
    ['Frankie O\'Neal', 'Republican'],
    ['Stephen Woodard', 'Republican'],
    ['Jimmy Reeves', 'Republican'],
    ['Tanya Campbell', 'Democrat'],
    ['Clarence Watson', 'Republican'],
  ]),
  ...countyOfficials('Onslow', [
    ['Keith Bell', 'Sheriff', 'Republican'],
    ['Erinn Russ Blevins', 'District Attorney', 'Republican'],
    ['Diane Cobb', 'Clerk of Superior Court', 'Republican'],
    ['Cheri Pettet', 'Register of Deeds', 'Republican'],
  ]),
];

const pittCounty = [
  ...commissioners('Pitt', [
    ['Will Aycock', 'Republican'],
    ['David Joyner', 'Republican'],
    ['Jay Hardee', 'Republican'],
    ['Anita Davis', 'Democrat'],
    ['John Smith', 'Republican'],
  ]),
  ...countyOfficials('Pitt', [
    ['Keith Powell', 'Sheriff', 'Democrat'],
    ['Matthew Evans', 'District Attorney', 'Republican'],
    ['Rosie Briggs', 'Clerk of Superior Court', 'Democrat'],
    ['Jay Haskell', 'Register of Deeds', 'Republican'],
  ]),
];

const catawbaCounty = [
  ...commissioners('Catawba', [
    ['Grant Tinsley', 'Republican'],
    ['Pete Smith', 'Republican'],
    ['Curt Newbern', 'Republican'],
    ['Curtis Pennell', 'Republican'],
    ['Mark Shue', 'Republican'],
  ]),
  ...countyOfficials('Catawba', [
    ['Coy Carpenter', 'Sheriff', 'Republican'],
    ['S. Christy Killian', 'District Attorney', 'Republican'],
    ['Andrea Steele', 'Clerk of Superior Court', 'Republican'],
    ['Cathy Stroupe', 'Register of Deeds', 'Republican'],
  ]),
];

const davidsonCounty = [
  ...commissioners('Davidson', [
    ['Merlin Strickland', 'Republican'],
    ['Richard Linville', 'Democrat'],
    ['Kevin Whitaker', 'Republican'],
    ['Dale Osorio', 'Democrat'],
    ['Greg Bearden', 'Republican'],
  ]),
  ...countyOfficials('Davidson', [
    ['Richie Simmons', 'Sheriff', 'Republican'],
    ['Trey Harrelson', 'District Attorney', 'Republican'],
    ['Denise Yarbrough', 'Clerk of Superior Court', 'Republican'],
    ['Janel Graves', 'Register of Deeds', 'Republican'],
  ]),
];

const randolphCounty = [
  ...commissioners('Randolph', [
    ['Darryl Johnson', 'Democrat'],
    ['David Craddock', 'Democrat'],
    ['Craig Tindel', 'Republican'],
    ['Donna Nicely', 'Democrat'],
    ['Scott Greene', 'Republican'],
  ]),
  ...countyOfficials('Randolph', [
    ['Craig Sinclair', 'Sheriff', 'Republican'],
    ['Sam Devine', 'District Attorney', 'Democrat'],
    ['Martha Brown', 'Clerk of Superior Court', 'Republican'],
    ['Helen Winstead', 'Register of Deeds', 'Republican'],
  ]),
];

const rowanCounty = [
  ...commissioners('Rowan', [
    ['Jimmy Sides', 'Republican'],
    ['Mike Caskey', 'Republican'],
    ['Greg Edds', 'Republican'],
    ['Diane Honeycutt', 'Republican'],
    ['Judy Klusman', 'Republican'],
  ]),
  ...countyOfficials('Rowan', [
    ['Kevin Auten', 'Sheriff', 'Republican'],
    ['Brandy Cook', 'District Attorney', 'Republican'],
    ['Patrice Frazier', 'Clerk of Superior Court', 'Republican'],
    ['Judy Glauser', 'Register of Deeds', 'Republican'],
  ]),
];

const alamanceCounty = [
  ...commissioners('Alamance', [
    ['Tim Bassett', 'Democrat'],
    ['Kasey Mabe', 'Republican'],
    ['Charles Bradshaw', 'Republican'],
    ['Linda Thompson', 'Republican'],
    ['James Oakley', 'Republican'],
  ]),
  ...countyOfficials('Alamance', [
    ['Terry Ledford', 'Sheriff', 'Republican'],
    ['Shannon Varner', 'District Attorney', 'Republican'],
    ['Leann Bowers', 'Clerk of Superior Court', 'Republican'],
    ['Lynne Leake', 'Register of Deeds', 'Republican'],
  ]),
];

const harnettCounty = [
  ...commissioners('Harnett', [
    ['Cita Reeds', 'Democrat'],
    ['Robert Godwin Jr.', 'Democrat'],
    ['Tanya Powell', 'Democrat'],
    ['Margaret Marks', 'Democrat'],
    ['David Hicks', 'Republican'],
  ]),
  ...countyOfficials('Harnett', [
    ['Wayne Coates', 'Sheriff', 'Republican'],
    ['Doug Merrett', 'District Attorney', 'Republican'],
    ['Beverly Foster', 'Clerk of Superior Court', 'Democrat'],
    ['Jane Holleman', 'Register of Deeds', 'Democrat'],
  ]),
];

// ==================== MAJOR CITIES ====================

const charlotteCity = [
  official('Charlotte', 'Vi Alexander', 'Mayor', 'Democrat', 'city'),
  official('Charlotte', 'Larken Egleston', 'City Council At-Large', 'Democrat', 'city'),
  official('Charlotte', 'Braxton Winston II', 'City Council District 1', 'Democrat', 'city'),
  official('Charlotte', 'Renee Johnson', 'City Council District 2', 'Democrat', 'city'),
  official('Charlotte', 'Dimple Ajmera', 'City Council District 3', 'Democrat', 'city'),
  official('Charlotte', 'Tariq Bokhari', 'City Council District 4', 'Republican', 'city'),
  official('Charlotte', 'Matt Newton', 'City Council District 5', 'Republican', 'city'),
  official('Charlotte', 'Carlene Newton', 'City Council District 6', 'Democrat', 'city'),
  official('Charlotte', 'Nelly Williams', 'City Council District 7', 'Democrat', 'city'),
];

const raleighCity = [
  official('Raleigh', 'Mary-Ann Baldwin', 'Mayor', 'Democrat', 'city'),
  official('Raleigh', 'Jonathan Melton', 'City Council At-Large', 'Democrat', 'city'),
  official('Raleigh', 'Stormie Forte', 'City Council District 1', 'Republican', 'city'),
  official('Raleigh', 'Fatima Akinlawon', 'City Council District 2', 'Democrat', 'city'),
  official('Raleigh', 'Christina O\'Neill', 'City Council District 3', 'Democrat', 'city'),
  official('Raleigh', 'Corey Branch', 'City Council District 4', 'Democrat', 'city'),
  official('Raleigh', 'Nicholas Fondren', 'City Council District 5', 'Republican', 'city'),
  official('Raleigh', 'Renee Brown', 'City Council District 6', 'Democrat', 'city'),
];

// ==================== COMPILE ALL ====================

const allOfficials: Official[] = [
  ...mecklenburgCounty,
  ...wakeCounty,
  ...guilfordCounty,
  ...forsythCounty,
  ...cumberlandCounty,
  ...durhamCounty,
  ...buncombeCounty,
  ...unionCounty,
  ...gastonCounty,
  ...cabarrusCounty,
  ...johnstonCounty,
  ...newHanoverCounty,
  ...onslowCounty,
  ...pittCounty,
  ...catawbaCounty,
  ...davidsonCounty,
  ...randolphCounty,
  ...rowanCounty,
  ...alamanceCounty,
  ...harnettCounty,
  ...charlotteCity,
  ...raleighCity,
];

// ==================== INSERT LOGIC ====================

async function insertBatch(records: Official[], batchLabel: string): Promise<number> {
  const { data, error } = await sb
    .from('politicians')
    .upsert(records, { onConflict: 'bioguide_id' });

  if (error) {
    console.error(`[ERROR] ${batchLabel}: ${error.message}`);
    return 0;
  }
  console.log(`[OK] ${batchLabel}: ${records.length} officials upserted`);
  return records.length;
}

async function main() {
  console.log('=== Seeding North Carolina County & City Officials ===');
  console.log(`Total officials to insert: ${allOfficials.length}\n`);

  // De-duplicate by bioguide_id (in case of any collisions)
  const seen = new Set<string>();
  const deduplicated = allOfficials.filter((o) => {
    if (seen.has(o.bioguide_id)) {
      console.warn(`[WARN] Duplicate bioguide_id skipped: ${o.bioguide_id}`);
      return false;
    }
    seen.add(o.bioguide_id);
    return true;
  });

  console.log(`After dedup: ${deduplicated.length} unique officials\n`);

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  let totalInserted = 0;

  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const count = await insertBatch(batch, `Batch ${batchNum}`);
    totalInserted += count;
  }

  // Print summary per county/city
  console.log('\n=== SUMMARY BY JURISDICTION ===');
  const byCounts: { [key: string]: number } = {};
  for (const o of deduplicated) {
    const key = o.jurisdiction;
    byCounts[key] = (byCounts[key] || 0) + 1;
  }
  for (const [jurisdiction, count] of Object.entries(byCounts).sort()) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }

  console.log(`\n=== TOTAL: ${totalInserted} officials inserted/updated ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
