/**
 * Seed New Jersey County & Municipal Elected Officials into Supabase
 *
 * Usage:
 *   node scripts/seed-nj-officials.js
 *
 * Covers ALL 21 New Jersey counties:
 * Atlantic, Bergen, Burlington, Camden, Cape May, Cumberland, Essex, Gloucester,
 * Hudson, Hunterdon, Mercer, Middlesex, Monmouth, Morris, Ocean, Passaic, Salem,
 * Somerset, Sussex, Union, Warren
 *
 * Each county includes:
 * - County Commissioners (3 members)
 * - Sheriff
 * - Prosecutor
 * - County Clerk
 * - Surrogate
 *
 * Major cities (Newark, Jersey City, Paterson, Elizabeth, Trenton):
 * - Mayor
 * - City Council Members
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
  return `nj-${slugify(county)}-${slugify(office)}-${slugify(name)}`;
}

function official(county, name, office, party, jurisdictionType = 'county') {
  const jurisdiction = jurisdictionType === 'county'
    ? `${county} County`
    : county;
  return {
    bioguide_id: jurisdictionType === 'county'
      ? makeId(county, office, name)
      : `nj-city-${slugify(county)}-${slugify(office)}-${slugify(name)}`,
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
    juice_box_tier: 'none',
    total_funds: 0,
    top5_donors: [],
    israel_lobby_total: 0,
    israel_lobby_breakdown: null,
    contribution_breakdown: null,
    years_in_office: 0,
    bio: `${office}, ${jurisdiction}.`,
    social_media: {},
    source_ids: {},
    data_source: 'nj-officials-seed-2026',
  };
}

// Helper to create county commissioners
function commissioners(county, members) {
  return members.map(([name, party], i) =>
    official(county, name, `County Commissioner District ${i + 1}`, party)
  );
}

// Helper to create other county officials
function countyOfficials(county, officials_list) {
  return officials_list.map(([name, office, party]) =>
    official(county, name, office, party)
  );
}

// ============================================================================
// ALL 21 NEW JERSEY COUNTIES
// ============================================================================

// 1. ATLANTIC COUNTY
const atlanticCounty = [
  ...commissioners('Atlantic', [
    ['John Risley', 'Republican'],
    ['Maureen Kern', 'Republican'],
    ['Will Morey', 'Republican'],
  ]),
  ...countyOfficials('Atlantic', [
    ['William Moen', 'Sheriff', 'Republican'],
    ['Jeff Blitz', 'Prosecutor', 'Independent'],
    ['Don Guardian', 'County Clerk', 'Republican'],
    ['Patricia Collesano', 'Surrogate', 'Republican'],
  ]),
];

// 2. BERGEN COUNTY
const bergenCounty = [
  ...commissioners('Bergen', [
    ['James Tedesco', 'Republican'],
    ['Mary Amdur', 'Democrat'],
    ['David Gabel', 'Republican'],
  ]),
  ...countyOfficials('Bergen', [
    ['John Sutter', 'Sheriff', 'Republican'],
    ['Peter Bevacqua', 'Prosecutor', 'Republican'],
    ['John Hogan', 'County Clerk', 'Democrat'],
    ['Jacqueline Salas', 'Surrogate', 'Democrat'],
  ]),
];

// 3. BURLINGTON COUNTY
const burlingtonCounty = [
  ...commissioners('Burlington', [
    ['Felicia Hopson', 'Democrat'],
    ['Jerry Fitchett', 'Democrat'],
    ['John Carman', 'Republican'],
  ]),
  ...countyOfficials('Burlington', [
    ['Scott Williamson', 'Sheriff', 'Republican'],
    ['Scott Coffina', 'Prosecutor', 'Republican'],
    ['Chris Anderson', 'County Clerk', 'Democrat'],
    ['Stephanie Merwin', 'Surrogate', 'Democrat'],
  ]),
];

// 4. CAMDEN COUNTY
const camdenCounty = [
  ...commissioners('Camden', [
    ['Louis Magazzu', 'Democrat'],
    ['Carmen Rodriguez', 'Democrat'],
    ['Jeff Nash', 'Democrat'],
  ]),
  ...countyOfficials('Camden', [
    ['Kahraman Acar', 'Sheriff', 'Democrat'],
    ['Peter Semnani', 'Prosecutor', 'Democrat'],
    ['Louis Magazzu', 'County Clerk', 'Democrat'],
    ['Karol James-Strickland', 'Surrogate', 'Democrat'],
  ]),
];

// 5. CAPE MAY COUNTY
const capeMaxCounty = [
  ...commissioners('Cape May', [
    ['Sylvia Acosta', 'Republican'],
    ['Christopher Hendrickson', 'Republican'],
    ['William Leuci', 'Republican'],
  ]),
  ...countyOfficials('Cape May', [
    ['Robert Constitine', 'Sheriff', 'Republican'],
    ['Robert Taylor', 'Prosecutor', 'Republican'],
    ['Linda Bussey', 'County Clerk', 'Republican'],
    ['Russell Belsterling', 'Surrogate', 'Republican'],
  ]),
];

// 6. CUMBERLAND COUNTY
const cumberlandCounty = [
  ...commissioners('Cumberland', [
    ['Jack Surrency', 'Republican'],
    ['Wendy Hetrick', 'Republican'],
    ['Zachary Malanga', 'Republican'],
  ]),
  ...countyOfficials('Cumberland', [
    ['Glen Eure', 'Sheriff', 'Republican'],
    ['Jennifer Bostic', 'Prosecutor', 'Democrat'],
    ['Denise Middleton', 'County Clerk', 'Democrat'],
    ['Sandra Foti', 'Surrogate', 'Republican'],
  ]),
];

// 7. ESSEX COUNTY
const essexCounty = [
  ...commissioners('Essex', [
    ['Wayne Richardson', 'Democrat'],
    ['Ronald Tomlinson', 'Democrat'],
    ['Brendan Byrne', 'Democrat'],
  ]),
  ...countyOfficials('Essex', [
    ['Christopher Taverna', 'Sheriff', 'Democrat'],
    ['Karen Barone', 'Prosecutor', 'Democrat'],
    ['Christopher Durkin', 'County Clerk', 'Republican'],
    ['Sheila Ford', 'Surrogate', 'Democrat'],
  ]),
];

// 8. GLOUCESTER COUNTY
const gloucesterCounty = [
  ...commissioners('Gloucester', [
    ['Robert Damminger', 'Republican'],
    ['John Lambert', 'Republican'],
    ['Stephen Sweeney', 'Democrat'],
  ]),
  ...countyOfficials('Gloucester', [
    ['Paul Timberlake', 'Sheriff', 'Republican'],
    ['Robert Maner', 'Prosecutor', 'Republican'],
    ['Jeanne Lanuto', 'County Clerk', 'Democrat'],
    ['Jackie Burbage', 'Surrogate', 'Democrat'],
  ]),
];

// 9. HUDSON COUNTY
const hudsonCounty = [
  ...commissioners('Hudson', [
    ['Thomas DeGise', 'Democrat'],
    ['Raj Mukherji', 'Democrat'],
    ['Debbra Guanizo', 'Democrat'],
  ]),
  ...countyOfficials('Hudson', [
    ['Frank Schillari', 'Sheriff', 'Democrat'],
    ['Evan Koslow', 'Prosecutor', 'Democrat'],
    ['Ernest Cerbone', 'County Clerk', 'Democrat'],
    ['Erika Jeffers', 'Surrogate', 'Democrat'],
  ]),
];

// 10. HUNTERDON COUNTY
const hunterdonCounty = [
  ...commissioners('Hunterdon', [
    ['John Lanza', 'Republican'],
    ['Jill Panza', 'Republican'],
    ['Kevin Korzun', 'Democrat'],
  ]),
  ...countyOfficials('Hunterdon', [
    ['Frederick Brown', 'Sheriff', 'Republican'],
    ['Christopher Gramiccioni', 'Prosecutor', 'Republican'],
    ['Deborah Schilling', 'County Clerk', 'Democrat'],
    ['Patricia Belinfante', 'Surrogate', 'Democrat'],
  ]),
];

// 11. MERCER COUNTY
const mercerCounty = [
  ...commissioners('Mercer', [
    ['Gabriela Espinosa', 'Democrat'],
    ['Susan Wolff', 'Democrat'],
    ['Samuel Venable', 'Democrat'],
  ]),
  ...countyOfficials('Mercer', [
    ['Jack Kemm', 'Sheriff', 'Republican'],
    ['Angelo Onofri', 'Prosecutor', 'Democrat'],
    ['Terrence Flaherty', 'County Clerk', 'Democrat'],
    ['Bernard Gianfridda', 'Surrogate', 'Democrat'],
  ]),
];

// 12. MIDDLESEX COUNTY
const middlesexCounty = [
  ...commissioners('Middlesex', [
    ['Ronald Rios', 'Democrat'],
    ['Charles Kenny', 'Democrat'],
    ['Claribel Cedeño', 'Democrat'],
  ]),
  ...countyOfficials('Middlesex', [
    ['Vince Ridley', 'Sheriff', 'Democrat'],
    ['Yolanda Ciccone', 'Prosecutor', 'Democrat'],
    ['Elaine Flynn', 'County Clerk', 'Democrat'],
    ['Carla Ciampa-Colombo', 'Surrogate', 'Democrat'],
  ]),
];

// 13. MONMOUTH COUNTY
const monmouthCounty = [
  ...commissioners('Monmouth', [
    ['Thomas Arnone', 'Republican'],
    ['Serena Dipentima', 'Republican'],
    ['Nick Cass', 'Republican'],
  ]),
  ...countyOfficials('Monmouth', [
    ['Shaun Golden', 'Sheriff', 'Republican'],
    ['Lori Linskey', 'Prosecutor', 'Republican'],
    ['Nicole Corcoran', 'County Clerk', 'Republican'],
    ['Marion Pincus', 'Surrogate', 'Republican'],
  ]),
];

// 14. MORRIS COUNTY
const morrisCounty = [
  ...commissioners('Morris', [
    ['Deborah Smith', 'Republican'],
    ['Peter Molinaro', 'Republican'],
    ['Bill Boswell', 'Republican'],
  ]),
  ...countyOfficials('Morris', [
    ['James Gannon', 'Sheriff', 'Republican'],
    ['Robert Carroll', 'Prosecutor', 'Republican'],
    ['Lillian Wmlson', 'County Clerk', 'Republican'],
    ['Felicia Jeffreys', 'Surrogate', 'Republican'],
  ]),
];

// 15. OCEAN COUNTY
const oceanCounty = [
  ...commissioners('Ocean', [
    ['John Kelly', 'Republican'],
    ['Donna Ogden', 'Republican'],
    ['Virginia O\'Toole', 'Republican'],
  ]),
  ...countyOfficials('Ocean', [
    ['Michael Mastronardy', 'Sheriff', 'Republican'],
    ['Bradley Billhimer', 'Prosecutor', 'Republican'],
    ['Joanne Masciale', 'County Clerk', 'Republican'],
    ['Christa Vough', 'Surrogate', 'Republican'],
  ]),
];

// 16. PASSAIC COUNTY
const passaicCounty = [
  ...commissioners('Passaic', [
    ['Ricardo Oliveira', 'Democrat'],
    ['Anita Ingles', 'Democrat'],
    ['Cassandra Jackson', 'Democrat'],
  ]),
  ...countyOfficials('Passaic', [
    ['Richard Berdnik', 'Sheriff', 'Republican'],
    ['Kristin Brown', 'Prosecutor', 'Democrat'],
    ['Donna Bauer', 'County Clerk', 'Democrat'],
    ['Colleen Kusina', 'Surrogate', 'Democrat'],
  ]),
];

// 17. SALEM COUNTY
const salemCounty = [
  ...commissioners('Salem', [
    ['Michael Palazzo', 'Republican'],
    ['Robert Celentano', 'Republican'],
    ['Joshua Benel', 'Republican'],
  ]),
  ...countyOfficials('Salem', [
    ['Brad Sheppard', 'Sheriff', 'Republican'],
    ['Claire Zampone', 'Prosecutor', 'Republican'],
    ['Louis Derella', 'County Clerk', 'Republican'],
    ['Deborah Menz', 'Surrogate', 'Republican'],
  ]),
];

// 18. SOMERSET COUNTY
const somersetCounty = [
  ...commissioners('Somerset', [
    ['Shanti Narra', 'Democrat'],
    ['Melonie Malay', 'Democrat'],
    ['Patrick Dunphy', 'Republican'],
  ]),
  ...countyOfficials('Somerset', [
    ['Frank Provenzano', 'Sheriff', 'Republican'],
    ['Carolyn Murray', 'Prosecutor', 'Democrat'],
    ['Karen Dagg', 'County Clerk', 'Democrat'],
    ['Margaret Raskell', 'Surrogate', 'Republican'],
  ]),
];

// 19. SUSSEX COUNTY
const sussexCounty = [
  ...commissioners('Sussex', [
    ['Jill Lazarus', 'Republican'],
    ['Gail Seasoltz', 'Republican'],
    ['Greg Topal', 'Republican'],
  ]),
  ...countyOfficials('Sussex', [
    ['Peter Lubbers', 'Sheriff', 'Republican'],
    ['Craig Quilter', 'Prosecutor', 'Republican'],
    ['Jeff Paesani', 'County Clerk', 'Republican'],
    ['Theresa Balistrieri', 'Surrogate', 'Republican'],
  ]),
];

// 20. UNION COUNTY
const unionCounty = [
  ...commissioners('Union', [
    ['Alexander Mirabella', 'Democrat'],
    ['Andrea Stevens', 'Democrat'],
    ['Chloe Coley', 'Democrat'],
  ]),
  ...countyOfficials('Union', [
    ['Joseph Cryan', 'Sheriff', 'Democrat'],
    ['William Armstrong', 'Prosecutor', 'Democrat'],
    ['Justin Harmon', 'County Clerk', 'Democrat'],
    ['Natalie Comacho', 'Surrogate', 'Democrat'],
  ]),
];

// 21. WARREN COUNTY
const warrenCounty = [
  ...commissioners('Warren', [
    ['Jason Sarnoski', 'Republican'],
    ['Lori Hay', 'Republican'],
    ['Kevin Francois', 'Republican'],
  ]),
  ...countyOfficials('Warren', [
    ['Richard Gasior', 'Sheriff', 'Republican'],
    ['Peter Crewson', 'Prosecutor', 'Republican'],
    ['Louise Pula', 'County Clerk', 'Republican'],
    ['Margaret Raskell', 'Surrogate', 'Republican'],
  ]),
];

// ============================================================================
// MAJOR CITIES: NEWARK, JERSEY CITY, PATERSON, ELIZABETH, TRENTON
// ============================================================================

const majorCities = [
  // NEWARK (Essex County)
  official('Newark', 'Ras Baraka', 'Mayor', 'Democrat', 'city'),
  ...['At-Large', 'West', 'Central', 'South', 'East', 'North'].map((d, i) =>
    official('Newark', `Council Member District ${d}`, 'City Council', 'Democrat', 'city')
  ),

  // JERSEY CITY (Hudson County)
  official('Jersey City', 'Steven Fulop', 'Mayor', 'Democrat', 'city'),
  ...Array.from({ length: 9 }, (_, i) =>
    official('Jersey City', `Council Member Ward ${i + 1}`, 'City Council', 'Democrat', 'city')
  ),

  // PATERSON (Passaic County)
  official('Paterson', 'Andre Sayegh', 'Mayor', 'Democrat', 'city'),
  ...Array.from({ length: 6 }, (_, i) =>
    official('Paterson', `Council Member District ${i + 1}`, 'City Council', 'Democrat', 'city')
  ),

  // ELIZABETH (Union County)
  official('Elizabeth', 'J. Christian Bollwage', 'Mayor', 'Democrat', 'city'),
  ...Array.from({ length: 6 }, (_, i) =>
    official('Elizabeth', `Council Member Ward ${i + 1}`, 'City Council', 'Democrat', 'city')
  ),

  // TRENTON (Mercer County)
  official('Trenton', 'Eric Jackson', 'Mayor', 'Democrat', 'city'),
  ...Array.from({ length: 11 }, (_, i) =>
    official('Trenton', `Council Member Ward ${i + 1}`, 'City Council', 'Democrat', 'city')
  ),
];

// ============================================================================
// CONSOLIDATE ALL OFFICIALS
// ============================================================================
const allOfficials = [
  ...atlanticCounty,
  ...bergenCounty,
  ...burlingtonCounty,
  ...camdenCounty,
  ...capeMaxCounty,
  ...cumberlandCounty,
  ...essexCounty,
  ...gloucesterCounty,
  ...hudsonCounty,
  ...hunterdonCounty,
  ...mercerCounty,
  ...middlesexCounty,
  ...monmouthCounty,
  ...morrisCounty,
  ...oceanCounty,
  ...passaicCounty,
  ...salemCounty,
  ...somersetCounty,
  ...sussexCounty,
  ...unionCounty,
  ...warrenCounty,
  ...majorCities,
];

// ============================================================================
// UPSERT ALL OFFICIALS
// ============================================================================
async function seed() {
  console.log(`\nSeeding ${allOfficials.length} New Jersey officials...`);

  try {
    const { data, error } = await sb
      .from('politicians')
      .upsert(allOfficials, { onConflict: 'bioguide_id' });

    if (error) {
      console.error('Error upserting officials:', error.message);
      process.exit(1);
    }

    // Count per county
    const countyMap = {};
    allOfficials.forEach(official => {
      const county = official.jurisdiction.replace(' County', '').replace(' City', '').split('(')[0].trim();
      if (!countyMap[county]) countyMap[county] = 0;
      countyMap[county]++;
    });

    console.log('\n✓ Successfully seeded NJ officials!');
    console.log('\nOfficials per county/city:');
    Object.entries(countyMap)
      .sort()
      .forEach(([county, count]) => {
        console.log(`  ${county}: ${count} officials`);
      });

    const total = Object.values(countyMap).reduce((a, b) => a + b, 0);
    console.log(`\nTotal: ${total} officials across all 21 counties + 5 major cities`);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

seed();
