/**
 * Seed Ohio Federal & State Elected Officials into Supabase
 *
 * Covers:
 *   - 2 US Senators
 *   - 15 US Representatives (Congressional Districts 1-15)
 *   - 1 Governor
 *   - 33 Ohio State Senators (Districts 1-33)
 *   - 99 Ohio State Representatives (Districts 1-99)
 *
 * Data current as of April 2026.
 *
 * Usage:
 *   node scripts/seed-ohio-state-federal-officials.js
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL || 'https://xwaejtxqhwendbbdiowa.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

const R = 'Republican';
const D = 'Democrat';

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function makeRow({
  bioguide_id,
  name,
  office,
  office_level,
  party,
  district,
  jurisdiction,
  jurisdiction_type,
  bio,
}) {
  return {
    bioguide_id,
    name,
    office,
    office_level,
    party,
    district: district || null,
    jurisdiction,
    jurisdiction_type: jurisdiction_type || 'state',
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
    bio: bio || `${office}, Ohio.`,
    social_media: {},
    source_ids: {},
    data_source: 'ohio-state-federal-seed-2026',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ============================================================================
// US SENATORS (2)
// ============================================================================

const usSenators = [
  makeRow({
    bioguide_id: 'oh-sen-jon-husted',
    name: 'Jon Husted',
    office: 'US Senator',
    office_level: 'US Senator',
    party: R,
    district: null,
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: 'US Senator from Ohio. Appointed in 2025 to fill the vacancy left by JD Vance.',
  }),
  makeRow({
    bioguide_id: 'oh-sen-bernie-moreno',
    name: 'Bernie Moreno',
    office: 'US Senator',
    office_level: 'US Senator',
    party: R,
    district: null,
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: 'US Senator from Ohio. Elected in 2024.',
  }),
];

// ============================================================================
// US REPRESENTATIVES (15 districts)
// ============================================================================

const usRepresentatives = [
  { district: 1, name: 'Greg Landsman', party: D },
  { district: 2, name: 'David Taylor', party: R },
  { district: 3, name: 'Joyce Beatty', party: D },
  { district: 4, name: 'Jim Jordan', party: R },
  { district: 5, name: 'Bob Latta', party: R },
  { district: 6, name: 'Michael Rulli', party: R },
  { district: 7, name: 'Max Miller', party: R },
  { district: 8, name: 'Warren Davidson', party: R },
  { district: 9, name: 'Marcy Kaptur', party: D },
  { district: 10, name: 'Mike Turner', party: R },
  { district: 11, name: 'Shontel Brown', party: D },
  { district: 12, name: 'Troy Balderson', party: R },
  { district: 13, name: 'Emilia Sykes', party: D },
  { district: 14, name: 'David Joyce', party: R },
  { district: 15, name: 'Mike Carey', party: R },
].map((r) =>
  makeRow({
    bioguide_id: `oh-rep-d${String(r.district).padStart(2, '0')}-${slugify(r.name)}`,
    name: r.name,
    office: `US Representative, District ${r.district}`,
    office_level: 'US Representative',
    party: r.party,
    district: String(r.district),
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: `US Representative for Ohio's ${r.district}${ordinalSuffix(r.district)} Congressional District.`,
  })
);

// ============================================================================
// GOVERNOR (1)
// ============================================================================

const governor = [
  makeRow({
    bioguide_id: 'oh-gov-mike-dewine',
    name: 'Mike DeWine',
    office: 'Governor',
    office_level: 'Governor',
    party: R,
    district: null,
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: 'Governor of Ohio. Serving second term (2019-2027). Term-limited.',
  }),
];

// ============================================================================
// OHIO STATE SENATORS (33 districts)
// ============================================================================

const stateSenators = [
  { district: 1, name: 'Rob McColley', party: R },
  { district: 2, name: 'Theresa Gavarone', party: R },
  { district: 3, name: 'Michele Reynolds', party: R },
  { district: 4, name: 'George F. Lang', party: R },
  { district: 5, name: 'Stephen A. Huffman', party: R },
  { district: 6, name: 'Willis E. Blackshear Jr.', party: D },
  { district: 7, name: 'Steve Wilson', party: R },
  { district: 8, name: 'Louis W. Blessing III', party: R },
  { district: 9, name: 'Catherine D. Ingram', party: D },
  { district: 10, name: 'Kyle Koehler', party: R },
  { district: 11, name: 'Paula Hicks-Hudson', party: D },
  { district: 12, name: 'Susan Manchester', party: R },
  { district: 13, name: 'Nathan H. Manning', party: R },
  { district: 14, name: 'Terry Johnson', party: R },
  { district: 15, name: 'Hearcel F. Craig', party: D },
  { district: 16, name: 'Beth Liston', party: D },
  { district: 17, name: 'Shane Wilkin', party: R },
  { district: 18, name: 'Jerry C. Cirino', party: R },
  { district: 19, name: 'Andrew O. Brenner', party: R },
  { district: 20, name: 'Tim Schaffer', party: R },
  { district: 21, name: 'Kent Smith', party: D },
  { district: 22, name: 'Mark Romanchuk', party: R },
  { district: 23, name: 'Nickie J. Antonio', party: D },
  { district: 24, name: 'Thomas F. Patton', party: R },
  { district: 25, name: 'William P. DeMora', party: D },
  { district: 26, name: 'Bill Reineke', party: R },
  { district: 27, name: 'Kristina D. Roegner', party: R },
  { district: 28, name: 'Casey Weinstein', party: D },
  { district: 29, name: 'Jane M. Timken', party: R },
  { district: 30, name: 'Brian M. Chavez', party: R },
  { district: 31, name: 'Al Landis', party: R },
  { district: 32, name: 'Sandra O\'Brien', party: R },
  { district: 33, name: 'Al Cutrona', party: R },
].map((s) =>
  makeRow({
    bioguide_id: `oh-state-sen-d${String(s.district).padStart(2, '0')}-${slugify(s.name)}`,
    name: s.name,
    office: `Ohio State Senator, District ${s.district}`,
    office_level: 'State Senator',
    party: s.party,
    district: String(s.district),
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: `Ohio State Senator representing District ${s.district}.`,
  })
);

// ============================================================================
// OHIO STATE REPRESENTATIVES (99 districts)
// ============================================================================

const stateRepresentatives = [
  { district: 1, name: 'Dontavius L. Jarrells', party: D },
  { district: 2, name: 'Latyna M. Humphrey', party: D },
  { district: 3, name: 'Ismail Mohamed', party: D },
  { district: 4, name: 'Beryl Brown Piccolantonio', party: D },
  { district: 5, name: 'Meredith R. Lawson-Rowe', party: D },
  { district: 6, name: 'Christine Cockley', party: D },
  { district: 7, name: 'C. Allison Russo', party: D },
  { district: 8, name: 'Anita Somani', party: D },
  { district: 9, name: 'Munira Abdullahi', party: D },
  { district: 10, name: 'Mark Sigrist', party: D },
  { district: 11, name: 'Crystal Lett', party: D },
  { district: 12, name: 'Brian Stewart', party: R },
  { district: 13, name: 'Tristan Rader', party: D },
  { district: 14, name: 'Sean P. Brennan', party: D },
  { district: 15, name: 'Chris Glassburn', party: D },
  { district: 16, name: 'Bride Rose Sweeney', party: D },
  { district: 17, name: 'Michael D. Dovilla', party: R },
  { district: 18, name: 'Juanita O. Brent', party: D },
  { district: 19, name: 'Phillip M. Robinson Jr.', party: D },
  { district: 20, name: 'Terrence Upchurch', party: D },
  { district: 21, name: 'Eric Synenberg', party: D },
  { district: 22, name: 'Darnell T. Brewer', party: D },
  { district: 23, name: 'Daniel P. Troy', party: D },
  { district: 24, name: 'Dani Isaacsohn', party: D },
  { district: 25, name: 'Cecil Thomas', party: D },
  { district: 26, name: 'Ashley Bryant Bailey', party: D },
  { district: 27, name: 'Rachel B. Baker', party: D },
  { district: 28, name: 'Karen Brownlee', party: D },
  { district: 29, name: 'Cindy Abrams', party: R },
  { district: 30, name: 'Mike Odioso', party: R },
  { district: 31, name: 'Bill Roemer', party: R },
  { district: 32, name: 'Jack K. Daniels', party: R },
  { district: 33, name: 'Veronica R. Sims', party: D },
  { district: 34, name: 'Derrick Hall', party: D },
  { district: 35, name: 'Steve Demetriou', party: R },
  { district: 36, name: 'Andrea White', party: R },
  { district: 37, name: 'Tom Young', party: R },
  { district: 38, name: 'Desiree Tims', party: D },
  { district: 39, name: 'Phil Plummer', party: R },
  { district: 40, name: 'Rodney Creech', party: R },
  { district: 41, name: 'Erika White', party: D },
  { district: 42, name: 'Elgin Rogers Jr.', party: D },
  { district: 43, name: 'Michele Grim', party: D },
  { district: 44, name: 'Josh Williams', party: R },
  { district: 45, name: 'Jennifer Gross', party: R },
  { district: 46, name: 'Thomas Hall', party: R },
  { district: 47, name: 'Diane Mullins', party: R },
  { district: 48, name: 'Scott Oelslager', party: R },
  { district: 49, name: 'Jim Thomas', party: R },
  { district: 50, name: 'Matthew Kishman', party: R },
  { district: 51, name: 'Jodi Salvo', party: R },
  { district: 52, name: 'Gayle Manning', party: R },
  { district: 53, name: 'Joseph A. Miller III', party: D },
  { district: 54, name: 'Kellie Deeter', party: R },
  { district: 55, name: 'Michelle Teska', party: R },
  { district: 56, name: 'Adam Mathews', party: R },
  { district: 57, name: 'Jamie Callender', party: R },
  { district: 58, name: 'Lauren McNally', party: D },
  { district: 59, name: 'Tex Fischer', party: R },
  { district: 60, name: 'Brian Lorenz', party: R },
  { district: 61, name: 'Beth Lear', party: R },
  { district: 62, name: 'Jean Schmidt', party: R },
  { district: 63, name: 'Adam C. Bird', party: R },
  { district: 64, name: 'Nick Santucci', party: R },
  { district: 65, name: 'David Thomas', party: R },
  { district: 66, name: 'Sharon A. Ray', party: R },
  { district: 67, name: 'Melanie Miller', party: R },
  { district: 68, name: 'Thaddeus J. Claggett', party: R },
  { district: 69, name: 'Kevin D. Miller', party: R },
  { district: 70, name: 'Brian Lampton', party: R },
  { district: 71, name: 'Levi Dean', party: R },
  { district: 72, name: 'Heidi Workman', party: R },
  { district: 73, name: 'Jeff LaRe', party: R },
  { district: 74, name: 'Bernard Willis', party: R },
  { district: 75, name: 'Haraz N. Ghanbari', party: R },
  { district: 76, name: 'Marilyn John', party: R },
  { district: 77, name: 'Meredith Craig', party: R },
  { district: 78, name: 'Matt Huffman', party: R },
  { district: 79, name: 'Monica Robb Blasdel', party: R },
  { district: 80, name: 'Johnathan Newman', party: R },
  { district: 81, name: 'James M. Hoops', party: R },
  { district: 82, name: 'Roy Klopfenstein', party: R },
  { district: 83, name: 'Ty D. Mathews', party: R },
  { district: 84, name: 'Angela N. King', party: R },
  { district: 85, name: 'Tim Barhorst', party: R },
  { district: 86, name: 'Tracy M. Richardson', party: R },
  { district: 87, name: 'Riordan T. McClain', party: R },
  { district: 88, name: 'Gary Click', party: R },
  { district: 89, name: 'D.J. Swearingen', party: R },
  { district: 90, name: 'Justin Pizzulli', party: R },
  { district: 91, name: 'Bob Peterson', party: R },
  { district: 92, name: 'Mark Johnson', party: R },
  { district: 93, name: 'Jason Stephens', party: R },
  { district: 94, name: 'Kevin Ritter', party: R },
  { district: 95, name: 'Ty Moore', party: R },
  { district: 96, name: 'Ron Ferguson', party: R },
  { district: 97, name: 'Adam Holmes', party: R },
  { district: 98, name: 'Mark Hiner', party: R },
  { district: 99, name: 'Sarah Fowler Arthur', party: R },
].map((r) =>
  makeRow({
    bioguide_id: `oh-state-rep-d${String(r.district).padStart(2, '0')}-${slugify(r.name)}`,
    name: r.name,
    office: `Ohio State Representative, District ${r.district}`,
    office_level: 'State Representative',
    party: r.party,
    district: String(r.district),
    jurisdiction: 'Ohio',
    jurisdiction_type: 'state',
    bio: `Ohio State Representative for District ${r.district}.`,
  })
);

// ============================================================================
// UPSERT
// ============================================================================

const ALL_OFFICIALS = [
  ...usSenators,
  ...usRepresentatives,
  ...governor,
  ...stateSenators,
  ...stateRepresentatives,
];

async function seed() {
  console.log(`Seeding ${ALL_OFFICIALS.length} Ohio federal & state officials...`);
  console.log(`  US Senators:            ${usSenators.length}`);
  console.log(`  US Representatives:     ${usRepresentatives.length}`);
  console.log(`  Governor:               ${governor.length}`);
  console.log(`  State Senators:         ${stateSenators.length}`);
  console.log(`  State Representatives:  ${stateRepresentatives.length}`);

  const BATCH_SIZE = 50;
  let total = 0;

  for (let i = 0; i < ALL_OFFICIALS.length; i += BATCH_SIZE) {
    const batch = ALL_OFFICIALS.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from('politicians')
      .upsert(batch, { onConflict: 'bioguide_id' });

    if (error) {
      console.error(`Error upserting batch starting at index ${i}:`, error.message);
    } else {
      total += batch.length;
      console.log(`  Upserted ${total} / ${ALL_OFFICIALS.length}`);
    }
  }

  console.log('Done.');
}

seed().catch(console.error);
