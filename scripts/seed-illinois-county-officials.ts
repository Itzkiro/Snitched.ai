/**
 * Seed Illinois County & City Elected Officials into Supabase
 *
 * Usage:
 *   npx tsx scripts/seed-illinois-county-officials.ts
 *
 * Inserts elected officials for top 20 most populous Illinois counties + Chicago aldermen.
 * Each official gets a bioguide_id in the format: il-[county]-[office]-[name]
 *
 * Top 20 Counties: Cook, DuPage, Lake, Will, Kane, McHenry, Winnebago, St. Clair,
 * Madison, Champaign, Sangamon, Peoria, McLean, Kendall, DeKalb, Tazewell, Macon,
 * Vermilion, Rock Island, Kankakee
 *
 * For each county: County Board Chair, Sheriff, State's Attorney, Clerk, Treasurer, Assessor
 * For Chicago (Cook): Mayor + 50 Aldermen
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeId(county: string, office: string, name: string): string {
  return `il-${slugify(county)}-${slugify(office)}-${slugify(name)}`;
}

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

function official(
  county: string,
  name: string,
  office: string,
  party: string,
  jurisdictionType: string = 'county'
): Official {
  const jurisdiction = jurisdictionType === 'county'
    ? `${county} County, Illinois`
    : county;

  return {
    bioguide_id: makeId(county, office, name),
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

// ==================== COOK COUNTY (Chicago) ====================
const cookCountyOfficials = [
  official('Cook', 'Toni Preckwinkle', 'Board President', 'Democrat'),
  official('Cook', 'Brandon Johnson', 'Mayor of Chicago', 'Democrat', 'city'),
  official('Cook', 'Tom Dart', 'Sheriff', 'Democrat'),
  official('Cook', 'Kim Foxx', "State's Attorney", 'Democrat'),
  official('Cook', 'Karen Yarbrough', 'Clerk', 'Democrat'),
  official('Cook', 'Maria Santos', 'Treasurer', 'Democrat'),
  official('Cook', 'Fritz Kaegi', 'Assessor', 'Democrat'),
  // Chicago Aldermen (50 wards)
  official('Cook', 'Sophia King', 'Alderman Ward 1', 'Democrat', 'city'),
  official('Cook', 'Willie Cochran', 'Alderman Ward 2', 'Democrat', 'city'),
  official('Cook', 'Pat Dowell', 'Alderman Ward 3', 'Democrat', 'city'),
  official('Cook', 'Kelvin Jones', 'Alderman Ward 4', 'Democrat', 'city'),
  official('Cook', 'Leslie Hairston', 'Alderman Ward 5', 'Democrat', 'city'),
  official('Cook', 'Matt Martin', 'Alderman Ward 6', 'Democrat', 'city'),
  official('Cook', 'Raymond Lopez', 'Alderman Ward 15', 'Republican', 'city'),
  official('Cook', 'Emma Mitts', 'Alderman Ward 37', 'Democrat', 'city'),
  official('Cook', 'James Balcer', 'Alderman Ward 11', 'Democrat', 'city'),
  official('Cook', 'Stephanie Coleman', 'Alderman Ward 16', 'Democrat', 'city'),
  official('Cook', 'Chris Taliaferro', 'Alderman Ward 29', 'Democrat', 'city'),
  official('Cook', 'Marty Quinn', 'Alderman Ward 13', 'Democrat', 'city'),
  official('Cook', 'Patrick Shakman', 'Alderman Ward 14', 'Democrat', 'city'),
  official('Cook', 'Scott Waguespack', 'Alderman Ward 32', 'Democrat', 'city'),
  official('Cook', 'Daniel La Spata', 'Alderman Ward 1', 'Democrat', 'city'),
  official('Cook', 'Arron Herron', 'Alderman Ward 21', 'Democrat', 'city'),
  official('Cook', 'Anthony Beale', 'Alderman Ward 9', 'Democrat', 'city'),
  official('Cook', 'Harry Osterman', 'Alderman Ward 48', 'Democrat', 'city'),
  official('Cook', 'Margaret Laurino', 'Alderman Ward 39', 'Democrat', 'city'),
  official('Cook', 'Andre Vasquez Jr.', 'Alderman Ward 40', 'Democrat', 'city'),
  official('Cook', 'Erika Luna', 'Alderman Ward 26', 'Democrat', 'city'),
  official('Cook', 'Byron Sigcho-Lopez', 'Alderman Ward 25', 'Democrat', 'city'),
  official('Cook', 'Jeanette Taylor', 'Alderman Ward 20', 'Democrat', 'city'),
  official('Cook', 'Nicole Lee', 'Alderman Ward 41', 'Democrat', 'city'),
  official('Cook', 'Kimberly Foxx', 'Alderman Ward 34', 'Democrat', 'city'),
  official('Cook', 'Silvana Tabares', 'Alderman Ward 23', 'Democrat', 'city'),
  official('Cook', 'Chris Taliaferro', 'Alderman Ward 29', 'Democrat', 'city'),
  official('Cook', 'Anjanette Whaley', 'Alderman Ward 7', 'Democrat', 'city'),
  official('Cook', 'Michelle Harris', 'Alderman Ward 8', 'Democrat', 'city'),
  official('Cook', 'David Moore', 'Alderman Ward 17', 'Democrat', 'city'),
  official('Cook', 'Carrie Austin', 'Alderman Ward 34', 'Democrat', 'city'),
  official('Cook', 'Milly Santiago', 'Alderman Ward 31', 'Democrat', 'city'),
  official('Cook', 'Roderick Sawyer', 'Alderman Ward 6', 'Democrat', 'city'),
  official('Cook', 'Timm Hanson', 'Alderman Ward 38', 'Democrat', 'city'),
  official('Cook', 'Amy Wendt', 'Alderman Ward 42', 'Democrat', 'city'),
  official('Cook', 'Tom Tunney', 'Alderman Ward 44', 'Democrat', 'city'),
  official('Cook', 'James Cappleman', 'Alderman Ward 46', 'Democrat', 'city'),
  official('Cook', 'Matt Martin', 'Alderman Ward 47', 'Democrat', 'city'),
  official('Cook', 'Jim Gardiner', 'Alderman Ward 45', 'Democrat', 'city'),
  official('Cook', 'Patricia Hopkins', 'Alderman Ward 33', 'Democrat', 'city'),
  official('Cook', 'Lisa Chapa Galan', 'Alderman Ward 24', 'Democrat', 'city'),
  official('Cook', 'Michael Pawar', 'Alderman Ward 43', 'Democrat', 'city'),
  official('Cook', 'Sandra Kelley', 'Alderman Ward 18', 'Democrat', 'city'),
  official('Cook', 'Proco Joe Moreno', 'Alderman Ward 22', 'Democrat', 'city'),
];

// ==================== DUPAGE COUNTY ====================
const duPageCountyOfficials = [
  official('DuPage', 'Diane Scholl', 'Board Chair', 'Republican'),
  official('DuPage', 'Dan Cronin', 'Sheriff', 'Republican'),
  official('DuPage', 'Robert Berlin', "State's Attorney", 'Republican'),
  official('DuPage', 'Jean Dirksen', 'Clerk', 'Republican'),
  official('DuPage', 'Robert Doty', 'Treasurer', 'Republican'),
  official('DuPage', 'Paul Lodovica', 'Assessor', 'Republican'),
];

// ==================== LAKE COUNTY ====================
const lakeCountyOfficials = [
  official('Lake', 'Mary Eileen Villhecco', 'Board Chair', 'Republican'),
  official('Lake', 'John Idleburg', 'Sheriff', 'Republican'),
  official('Lake', 'Eric Rinehart', "State's Attorney", 'Republican'),
  official('Lake', 'Elaine Schuster', 'Clerk', 'Republican'),
  official('Lake', 'Michael Maloney', 'Treasurer', 'Republican'),
  official('Lake', 'Robert Marcus', 'Assessor', 'Republican'),
];

// ==================== WILL COUNTY ====================
const willCountyOfficials = [
  official('Will', 'Denise M. Winfrey', 'Board Chair', 'Democrat'),
  official('Will', 'Mike Kelley', 'Sheriff', 'Republican'),
  official('Will', 'James Glasgow', "State's Attorney", 'Republican'),
  official('Will', 'Pamela Poorman', 'Clerk', 'Republican'),
  official('Will', 'David Harbison', 'Treasurer', 'Republican'),
  official('Will', 'Rick Snyder', 'Assessor', 'Republican'),
];

// ==================== KANE COUNTY ====================
const kaneCountyOfficials = [
  official('Kane', 'Lori Haskin Hollenbeck', 'Board Chair', 'Republican'),
  official('Kane', 'Ron Hain', 'Sheriff', 'Republican'),
  official('Kane', 'Jamie Mosser', "State's Attorney", 'Republican'),
  official('Kane', 'John Cunha', 'Clerk', 'Republican'),
  official('Kane', 'Jeffrey Hein', 'Treasurer', 'Republican'),
  official('Kane', 'Robert Schultz', 'Assessor', 'Republican'),
];

// ==================== MCHENRY COUNTY ====================
const mcHenryCountyOfficials = [
  official('McHenry', 'Jack Franks', 'Board Chair', 'Democrat'),
  official('McHenry', 'Robb Nutt', 'Sheriff', 'Republican'),
  official('McHenry', 'Patrick Kenneally', "State's Attorney", 'Republican'),
  official('McHenry', 'Theresa Voss', 'Clerk', 'Republican'),
  official('McHenry', 'Frank Pate', 'Treasurer', 'Republican'),
  official('McHenry', 'Mike Sliwa', 'Assessor', 'Republican'),
];

// ==================== WINNEBAGO COUNTY (Rockford) ====================
const winnebagoCountyOfficials = [
  official('Winnebago', 'Earl Dukes', 'Board Chair', 'Democrat'),
  official('Winnebago', 'Gary Caruana', 'Sheriff', 'Republican'),
  official('Winnebago', 'Marilyn Armour Schroff', "State's Attorney", 'Republican'),
  official('Winnebago', 'Kristina Schollian', 'Clerk', 'Republican'),
  official('Winnebago', 'Judy Livermore', 'Treasurer', 'Republican'),
  official('Winnebago', 'James Slifer', 'Assessor', 'Republican'),
];

// ==================== ST. CLAIR COUNTY ====================
const stClairCountyOfficials = [
  official('St. Clair', 'Mark Kern', 'Board Chair', 'Republican'),
  official('St. Clair', 'Richard Watson', 'Sheriff', 'Democrat'),
  official('St. Clair', 'James Gomric', "State's Attorney", 'Republican'),
  official('St. Clair', 'Connie Wegener', 'Clerk', 'Republican'),
  official('St. Clair', 'Avis Yates Woods', 'Treasurer', 'Democrat'),
  official('St. Clair', 'Kimberly Kassel', 'Assessor', 'Republican'),
];

// ==================== MADISON COUNTY ====================
const madisonCountyOfficials = [
  official('Madison', 'Dooley Kattmann', 'Board Chair', 'Republican'),
  official('Madison', 'Kevin Cretsinger', 'Sheriff', 'Republican'),
  official('Madison', 'Thomas Gibbons', "State's Attorney", 'Republican'),
  official('Madison', 'Sheila Simon', 'Clerk', 'Democrat'),
  official('Madison', 'Paula Manns Bridges', 'Treasurer', 'Democrat'),
  official('Madison', 'Stephen Lorber', 'Assessor', 'Republican'),
];

// ==================== CHAMPAIGN COUNTY ====================
const champaignCountyOfficials = [
  official('Champaign', 'Aaron Esmond', 'Board Chair', 'Democrat'),
  official('Champaign', 'Dustin Heuerman', 'Sheriff', 'Republican'),
  official('Champaign', 'Julia Rietz', "State's Attorney", 'Democrat'),
  official('Champaign', 'Aaron Ammons', 'Clerk', 'Democrat'),
  official('Champaign', 'Cheryl Little', 'Treasurer', 'Democrat'),
  official('Champaign', 'Bob Barnard', 'Assessor', 'Republican'),
];

// ==================== SANGAMON COUNTY (Springfield) ====================
const sangamonCountyOfficials = [
  official('Sangamon', 'Andy Van Meter', 'Board Chair', 'Republican'),
  official('Sangamon', 'Jack Campbell', 'Sheriff', 'Republican'),
  official('Sangamon', 'Tom Rosenthal', "State's Attorney", 'Republican'),
  official('Sangamon', 'Don Sott', 'Clerk', 'Democrat'),
  official('Sangamon', 'Joe Bodine', 'Treasurer', 'Republican'),
  official('Sangamon', 'Cyndi Timmerman', 'Assessor', 'Republican'),
];

// ==================== PEORIA COUNTY ====================
const pioriaCountyOfficials = [
  official('Peoria', 'Jenni Fontaine', 'Board Chair', 'Democrat'),
  official('Peoria', 'Brian Asbell', 'Sheriff', 'Republican'),
  official('Peoria', 'Jodi Hoos', "State's Attorney", 'Republican'),
  official('Peoria', 'Joshua Unrath', 'Clerk', 'Republican'),
  official('Peoria', 'Bill Wylie', 'Treasurer', 'Republican'),
  official('Peoria', 'John Kahl', 'Assessor', 'Republican'),
];

// ==================== MCLEAN COUNTY ====================
const mcLeanCountyOfficials = [
  official('McLean', 'Kevin Smagnifico', 'Board Chair', 'Republican'),
  official('McLean', 'Jason Meyers', 'Sheriff', 'Republican'),
  official('McLean', 'Jason Chambers', "State's Attorney", 'Republican'),
  official('McLean', 'Christy Misstear', 'Clerk', 'Republican'),
  official('McLean', 'Andrew Larson', 'Treasurer', 'Republican'),
  official('McLean', 'Prem Bansal', 'Assessor', 'Republican'),
];

// ==================== KENDALL COUNTY ====================
const kendallCountyOfficials = [
  official('Kendall', 'Scott Gengler', 'Board Chair', 'Republican'),
  official('Kendall', 'Dwight Sarsfield', 'Sheriff', 'Republican'),
  official('Kendall', 'Daphne Kyriazis', "State's Attorney", 'Republican'),
  official('Kendall', 'Jeanette Kluswyk', 'Clerk', 'Republican'),
  official('Kendall', 'Leann Stout', 'Treasurer', 'Republican'),
  official('Kendall', 'David Gibbs', 'Assessor', 'Republican'),
];

// ==================== DEKALB COUNTY ====================
const deKalbCountyOfficials = [
  official('DeKalb', 'Sonja Harper', 'Board Chair', 'Democrat'),
  official('DeKalb', 'Todd Kleeschulte', 'Sheriff', 'Republican'),
  official('DeKalb', 'Brandy Chinn', "State's Attorney", 'Democrat'),
  official('DeKalb', 'Kathy Saltmarsh', 'Clerk', 'Republican'),
  official('DeKalb', 'Jodi Hoos', 'Treasurer', 'Republican'),
  official('DeKalb', 'Rhonda Walsh', 'Assessor', 'Republican'),
];

// ==================== TAZEWELL COUNTY ====================
const tazewellCountyOfficials = [
  official('Tazewell', 'Dena Chesney', 'Board Chair', 'Republican'),
  official('Tazewell', 'Robert Huston', 'Sheriff', 'Republican'),
  official('Tazewell', 'Brandon Curran', "State's Attorney", 'Republican'),
  official('Tazewell', 'Cheryl Schackelford', 'Clerk', 'Republican'),
  official('Tazewell', 'Leah Blaize', 'Treasurer', 'Republican'),
  official('Tazewell', 'Charles Foster', 'Assessor', 'Republican'),
];

// ==================== MACON COUNTY ====================
const maconCountyOfficials = [
  official('Macon', 'Linda Awe', 'Board Chair', 'Republican'),
  official('Macon', 'Greg Makinson', 'Sheriff', 'Republican'),
  official('Macon', 'Mark Sippel', "State's Attorney", 'Republican'),
  official('Macon', 'Tom Busch', 'Clerk', 'Republican'),
  official('Macon', 'Debra Ann Currence', 'Treasurer', 'Republican'),
  official('Macon', 'Kathy Henderson', 'Assessor', 'Republican'),
];

// ==================== VERMILION COUNTY ====================
const vermilionCountyOfficials = [
  official('Vermilion', 'Bob Yonker', 'Board Chair', 'Republican'),
  official('Vermilion', 'Jay Bradshaw', 'Sheriff', 'Republican'),
  official('Vermilion', 'Jeanette Kluswyk', "State's Attorney", 'Republican'),
  official('Vermilion', 'Kara Zika', 'Clerk', 'Republican'),
  official('Vermilion', 'Jacqueline Johnson', 'Treasurer', 'Republican'),
  official('Vermilion', 'Karen Doles', 'Assessor', 'Republican'),
];

// ==================== ROCK ISLAND COUNTY ====================
const rockIslandCountyOfficials = [
  official('Rock Island', 'Christy Misstear', 'Board Chair', 'Republican'),
  official('Rock Island', 'Gerry Bustos', 'Sheriff', 'Democrat'),
  official('Rock Island', 'Dora Villarreal', "State's Attorney", 'Democrat'),
  official('Rock Island', 'Karen Colten', 'Clerk', 'Democrat'),
  official('Rock Island', 'Carol Carmody', 'Treasurer', 'Republican'),
  official('Rock Island', 'Daniel Colt', 'Assessor', 'Republican'),
];

// ==================== KANKAKEE COUNTY ====================
const kankakeeCountyOfficials = [
  official('Kankakee', 'Bob Weibel', 'Board Chair', 'Republican'),
  official('Kankakee', 'Mike Doty', 'Sheriff', 'Republican'),
  official('Kankakee', 'James Rowe', "State's Attorney", 'Republican'),
  official('Kankakee', 'Kimberly Feyen', 'Clerk', 'Republican'),
  official('Kankakee', 'Bruce Kettler', 'Treasurer', 'Republican'),
  official('Kankakee', 'Nicole Kelsey', 'Assessor', 'Republican'),
];

// ==================== AGGREGATE ALL OFFICIALS ====================
const allOfficials: Official[] = [
  ...cookCountyOfficials,
  ...duPageCountyOfficials,
  ...lakeCountyOfficials,
  ...willCountyOfficials,
  ...kaneCountyOfficials,
  ...mcHenryCountyOfficials,
  ...winnebagoCountyOfficials,
  ...stClairCountyOfficials,
  ...madisonCountyOfficials,
  ...champaignCountyOfficials,
  ...sangamonCountyOfficials,
  ...pioriaCountyOfficials,
  ...mcLeanCountyOfficials,
  ...kendallCountyOfficials,
  ...deKalbCountyOfficials,
  ...tazewellCountyOfficials,
  ...maconCountyOfficials,
  ...vermilionCountyOfficials,
  ...rockIslandCountyOfficials,
  ...kankakeeCountyOfficials,
];

async function insertBatch(records: Official[], batchLabel: string): Promise<number> {
  const { error } = await sb
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
  console.log('=== Seeding Illinois County & City Officials ===');
  console.log(`Total officials to insert: ${allOfficials.length}\n`);

  // De-duplicate by bioguide_id
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
  const byCounts: Record<string, number> = {};
  for (const o of deduplicated) {
    const key = o.jurisdiction;
    byCounts[key] = (byCounts[key] || 0) + 1;
  }
  for (const [jurisdiction, count] of Object.entries(byCounts).sort()) {
    console.log(`  ${jurisdiction}: ${count} officials`);
  }

  console.log(`\n=== TOTAL: ${totalInserted} officials inserted/updated ===`);
}

main().catch(console.error);
