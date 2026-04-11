/**
 * Seed Michigan County & City Elected Officials into Supabase
 *
 * Usage:
 *   node scripts/seed-michigan-county-officials.js
 *
 * Inserts elected officials for Michigan's top 20 most populous counties
 * + major cities (Detroit, Grand Rapids, Lansing).
 *
 * Each official gets a bioguide_id in the format: mi-[county]-[office]-[name]
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeId(county, office, name) {
  return `mi-${slugify(county)}-${slugify(office)}-${slugify(name)}`;
}

function official(county, name, office, party, jurisdictionType = 'county') {
  const jurisdiction = jurisdictionType === 'county'
    ? `${county} County`
    : county; // for cities, county param is city name
  return {
    bioguide_id: jurisdictionType === 'county'
      ? makeId(county, office, name)
      : `mi-city-${slugify(county)}-${slugify(office)}-${slugify(name)}`,
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

function countyOfficials(county, officials_list) {
  return officials_list.map(([name, office, party]) =>
    official(county, name, office, party)
  );
}

// ==================== TOP 20 MICHIGAN COUNTIES ====================

// 1. Wayne County (Detroit)
const wayneCounty = [
  ...countyOfficials('Wayne', [
    ['Maureen Miller Brosnan', 'County Executive', 'Democrat'],
    ['Alicia Boyce', 'Sheriff', 'Democrat'],
    ['Kym Worthy', 'Prosecutor', 'Democrat'],
    ['Jocelyn Benson', 'Clerk', 'Democrat'],
    ['Eric Sabree', 'Treasurer', 'Democrat'],
  ]),
];

// 2. Oakland County (Pontiac)
const oaklandCounty = [
  ...countyOfficials('Oakland', [
    ['Dave Coulter', 'County Executive', 'Republican'],
    ['Michael Bouchard', 'Sheriff', 'Republican'],
    ['Karen McDonald', 'Prosecutor', 'Democrat'],
    ['Lisa Brown', 'Clerk', 'Democrat'],
    ['Andy Meisner', 'Treasurer', 'Democrat'],
  ]),
];

// 3. Macomb County
const macombCounty = [
  ...countyOfficials('Macomb', [
    ['Mark Hackel', 'County Executive', 'Democrat'],
    ['Anthony Wickersham', 'Sheriff', 'Republican'],
    ['Peter Lucido', 'Prosecutor', 'Republican'],
    ['Jackie Cmilhone', 'Clerk', 'Democrat'],
    ['Sheila Pledge', 'Treasurer', 'Democrat'],
  ]),
];

// 4. Kent County (Grand Rapids)
const kentCounty = [
  ...countyOfficials('Kent', [
    ['Robert Belleman', 'County Administrator', 'Nonpartisan'],
    ['Michelle LaJoye-Young', 'Sheriff', 'Nonpartisan'],
    ['Christopher Becker', 'Prosecutor', 'Republican'],
    ['Lisa Posthumus Lyons', 'Clerk', 'Republican'],
    ['Anita Funk', 'Treasurer', 'Nonpartisan'],
  ]),
];

// 5. Genesee County (Flint)
const geneseeCounty = [
  ...countyOfficials('Genesee', [
    ['Mark Deluzio', 'County Administrator', 'Democrat'],
    ['Chris Swanson', 'Sheriff', 'Nonpartisan'],
    ['David Leyton', 'Prosecutor', 'Republican'],
    ['John Gleason', 'Clerk', 'Nonpartisan'],
    ['Deborah Jeffries', 'Treasurer', 'Democrat'],
  ]),
];

// 6. Washtenaw County (Ann Arbor)
const washtenawCounty = [
  ...countyOfficials('Washtenaw', [
    ['Yousef Rabhi', 'County Administrator', 'Democrat'],
    ['Jerry Clayton', 'Sheriff', 'Democrat'],
    ['Eli Savit', 'Prosecutor', 'Democrat'],
    ['Lawrence Kestenbaum', 'Clerk', 'Democrat'],
    ['Cathleen Szlamka', 'Treasurer', 'Democrat'],
  ]),
];

// 7. Ottawa County
const ottawaCounty = [
  ...countyOfficials('Ottawa', [
    ['Allison Mast', 'County Administrator', 'Nonpartisan'],
    ['Joe LaMagdeleine', 'Sheriff', 'Nonpartisan'],
    ['Matthew Roberts', 'Prosecutor', 'Republican'],
    ['Roger Bellar', 'Clerk', 'Republican'],
    ['Mark Riddle', 'Treasurer', 'Nonpartisan'],
  ]),
];

// 8. Ingham County (Lansing)
const inghamCounty = [
  ...countyOfficials('Ingham', [
    ['Ryan Sebera', 'County Clerk', 'Democrat'],
    ['Scott Wriggelsworth', 'Sheriff', 'Democrat'],
    ['Carol Siemon', 'Prosecutor', 'Democrat'],
    ['Barb Byrum', 'Clerk/Register of Deeds', 'Democrat'],
    ['Connie Bauer', 'Treasurer', 'Democrat'],
  ]),
];

// 9. Kalamazoo County
const kalamazooCounty = [
  ...countyOfficials('Kalamazoo', [
    ['Craig Reader', 'County Administrator', 'Nonpartisan'],
    ['Rich Fuller', 'Sheriff', 'Nonpartisan'],
    ['Jeff Getting', 'Prosecutor', 'Republican'],
    ['Tim Snow', 'Clerk', 'Republican'],
    ['David Lake', 'Treasurer', 'Democrat'],
  ]),
];

// 10. Livingston County
const livingstonCounty = [
  ...countyOfficials('Livingston', [
    ['Jay Gross', 'County Administrator', 'Nonpartisan'],
    ['Mike Murphy', 'Sheriff', 'Republican'],
    ['Carolyn Henry', 'Prosecutor', 'Republican'],
    ['Elizabeth Hundley', 'Clerk', 'Republican'],
    ['David Dubi', 'Treasurer', 'Republican'],
  ]),
];

// 11. Muskegon County
const muskegonCounty = [
  ...countyOfficials('Muskegon', [
    ['Bridget Behe', 'County Administrator', 'Nonpartisan'],
    ['Tony Wickersham', 'Sheriff', 'Republican'],
    ['Daniel Hartigan', 'Prosecutor', 'Republican'],
    ['Patricia Jetter', 'Clerk', 'Democrat'],
    ['Kathy George', 'Treasurer', 'Nonpartisan'],
  ]),
];

// 12. Saginaw County
const saginawCounty = [
  ...countyOfficials('Saginaw', [
    ['Carol Timmons', 'County Clerk', 'Democrat'],
    ['William Federspiel', 'Sheriff', 'Republican'],
    ['Joseph Shumate', 'Prosecutor', 'Republican'],
    ['Annette Campfield', 'Clerk', 'Democrat'],
    ['Kathryn Rood', 'Treasurer', 'Democrat'],
  ]),
];

// 13. St. Clair County
const stClairCounty = [
  ...countyOfficials('St. Clair', [
    ['Robert Bellanca', 'County Administrator', 'Nonpartisan'],
    ['Mark Lisowski', 'Sheriff', 'Republican'],
    ['Michael Wendling', 'Prosecutor', 'Republican'],
    ['Sandra Kraayenbrink', 'Clerk', 'Republican'],
    ['Karyn Miller', 'Treasurer', 'Republican'],
  ]),
];

// 14. Monroe County
const monroeCounty = [
  ...countyOfficials('Monroe', [
    ['Colleen Elsass', 'County Administrator', 'Nonpartisan'],
    ['Troy Cmunt', 'Sheriff', 'Republican'],
    ['Jeffrey Sorger', 'Prosecutor', 'Republican'],
    ['Patricia Maisner', 'Clerk', 'Democrat'],
    ['Joann Moutardier', 'Treasurer', 'Democrat'],
  ]),
];

// 15. Berrien County
const berrienCounty = [
  ...countyOfficials('Berrien', [
    ['Jennifer Bergman', 'County Administrator', 'Nonpartisan'],
    ['Paul Bailey', 'Sheriff', 'Republican'],
    ['Ken Pourteau', 'Prosecutor', 'Republican'],
    ['Russ Gipson', 'Clerk', 'Nonpartisan'],
    ['Karen Stouse', 'Treasurer', 'Republican'],
  ]),
];

// 16. Jackson County
const jacksonCounty = [
  ...countyOfficials('Jackson', [
    ['Lorraine Gohmann', 'County Administrator', 'Nonpartisan'],
    ['Gary Schuette', 'Sheriff', 'Republican'],
    ['Jerry Jarzynka', 'Prosecutor', 'Republican'],
    ['Amanda Swanson-Atkins', 'Clerk', 'Democrat'],
    ['Dwight Matsch', 'Treasurer', 'Republican'],
  ]),
];

// 17. Calhoun County
const calhounCounty = [
  ...countyOfficials('Calhoun', [
    ['Glenn Hile', 'County Administrator', 'Nonpartisan'],
    ['Steven Hinkley', 'Sheriff', 'Republican'],
    ['David Gilbert', 'Prosecutor', 'Republican'],
    ['Michelle Lanier', 'Clerk', 'Democrat'],
    ['Ellen Ellsworth', 'Treasurer', 'Republican'],
  ]),
];

// 18. Allegan County
const alleganCounty = [
  ...countyOfficials('Allegan', [
    ['Robert Jalonack', 'County Administrator', 'Nonpartisan'],
    ['Frank Baker', 'Sheriff', 'Republican'],
    ['Myrene Banham', 'Prosecutor', 'Republican'],
    ['Sheryl Guy', 'Clerk', 'Republican'],
    ['James Kloian', 'Treasurer', 'Republican'],
  ]),
];

// 19. Bay County
const bayCounty = [
  ...countyOfficials('Bay', [
    ['James Barlow', 'County Administrator', 'Nonpartisan'],
    ['Joel Massey', 'Sheriff', 'Republican'],
    ['Joseph Malte', 'Prosecutor', 'Republican'],
    ['Cynthia Luczak', 'Clerk', 'Republican'],
    ['Tina Hahn', 'Treasurer', 'Republican'],
  ]),
];

// 20. Eaton County
const eatonCounty = [
  ...countyOfficials('Eaton', [
    ['Brian Klaassen', 'County Administrator', 'Nonpartisan'],
    ['Renee Freeman', 'Sheriff', 'Democrat'],
    ['Douglas Lloyd', 'Prosecutor', 'Democrat'],
    ['Ingrid Summers', 'Clerk', 'Democrat'],
    ['Janet Hanson', 'Treasurer', 'Democrat'],
  ]),
];

// ==================== MAJOR CITIES ====================

// Detroit (Wayne County)
const detroitCity = [
  official('Detroit', 'Mike Duggan', 'Mayor', 'Democrat', 'city'),
  official('Detroit', 'James Tate', 'City Council President', 'Democrat', 'city'),
  official('Detroit', 'Roy McCalister', 'City Council District 1', 'Democrat', 'city'),
  official('Detroit', 'Jeannie Gebhardt', 'City Council District 2', 'Democrat', 'city'),
  official('Detroit', 'Darcel Brown', 'City Council District 3', 'Democrat', 'city'),
  official('Detroit', 'Latisha Johnson', 'City Council District 4', 'Democrat', 'city'),
  official('Detroit', 'Shantel Pruitt', 'City Council District 5', 'Democrat', 'city'),
  official('Detroit', 'Coleman Young II', 'City Council District 6', 'Democrat', 'city'),
  official('Detroit', 'Fred Durhal III', 'City Council District 7', 'Democrat', 'city'),
  official('Detroit', 'ChyAnn Brown', 'City Council District 8', 'Democrat', 'city'),
  official('Detroit', 'Raquel Castañeda-López', 'City Council District 9', 'Democrat', 'city'),
];

// Grand Rapids (Kent County)
const grandRapidsCity = [
  official('Grand Rapids', 'Rosalynn Bliss', 'Mayor', 'Democrat', 'city'),
  official('Grand Rapids', 'Bryan Bultsma', 'City Commission District 1', 'Republican', 'city'),
  official('Grand Rapids', 'Jermaine Stovall', 'City Commission District 2', 'Democrat', 'city'),
  official('Grand Rapids', 'Jeanine Huyck', 'City Commission District 3', 'Democrat', 'city'),
  official('Grand Rapids', 'Kurt Reppart', 'City Commission District 4', 'Nonpartisan', 'city'),
  official('Grand Rapids', 'Etta Strother', 'City Commission District 5', 'Democrat', 'city'),
];

// Lansing (Ingham County)
const lansingCity = [
  official('Lansing', 'Andy Schor', 'Mayor', 'Democrat', 'city'),
  official('Lansing', 'Jessica Yorko', 'City Council District 1', 'Democrat', 'city'),
  official('Lansing', 'Bryan Crenshaw', 'City Council District 2', 'Democrat', 'city'),
  official('Lansing', 'Patricia Spitzley', 'City Council District 3', 'Democrat', 'city'),
  official('Lansing', 'Michael Westmoreland', 'City Council District 4', 'Democrat', 'city'),
  official('Lansing', 'Kathie Dunbar', 'City Council District 5', 'Democrat', 'city'),
];

// ==================== COMBINE ALL ====================

const allOfficials = [
  ...wayneCounty,
  ...oaklandCounty,
  ...macombCounty,
  ...kentCounty,
  ...geneseeCounty,
  ...washtenawCounty,
  ...ottawaCounty,
  ...inghamCounty,
  ...kalamazooCounty,
  ...livingstonCounty,
  ...muskegonCounty,
  ...saginawCounty,
  ...stClairCounty,
  ...monroeCounty,
  ...berrienCounty,
  ...jacksonCounty,
  ...calhounCounty,
  ...alleganCounty,
  ...bayCounty,
  ...eatonCounty,
  // Cities
  ...detroitCity,
  ...grandRapidsCity,
  ...lansingCity,
];

// ==================== INSERT LOGIC ====================

async function insertBatch(records, batchLabel) {
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
  console.log('=== Seeding Michigan County & City Officials ===');
  console.log(`Total officials to insert: ${allOfficials.length}\n`);

  // De-duplicate by bioguide_id
  const seen = new Set();
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
  const byCounts = {};
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
