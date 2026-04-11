/**
 * Seed New York County & Municipal Officials into Supabase
 *
 * Usage: node scripts/seed-ny-officials.js
 *
 * Covers:
 *   - NYC boroughs (Manhattan, Brooklyn, Queens, Bronx, Staten Island)
 *   - NYC citywide: Mayor, Comptroller, Public Advocate, City Council (51 members)
 *   - Top counties by population: Suffolk, Nassau, Westchester, Erie, Monroe,
 *     Onondaga, Albany, Rockland, Orange, Dutchess, Saratoga, Oneida, Broome,
 *     Niagara, Schenectady
 *   - Major cities: Buffalo, Rochester, Syracuse, Albany, Yonkers
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://xwaejtxqhwendbbdiowa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWVqdHhxaHdlbmRiYmRpb3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0NTc3MywiZXhwIjoyMDkwNzIxNzczfQ.2Hs50SfnFxPBnB3hU3hXRSxT_DCCdg8Q_RLgmSJWm6M'
);

function makeId(county, office, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const countySlug = county.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const officeSlug = office.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 30);
  return `ny-${countySlug}-${officeSlug}-${slug}`;
}

function official(county, name, office, officeLevel, party, opts = {}) {
  return {
    bioguide_id: makeId(county, office, name),
    name,
    office,
    office_level: officeLevel,
    party,
    district: opts.district || null,
    jurisdiction: opts.jurisdiction || county,
    jurisdiction_type: opts.jurisdictionType || 'county',
    photo_url: null,
    corruption_score: 0,
    aipac_funding: 0,
    juice_box_tier: 'none',
    total_funds: 0,
    top5_donors: [],
    israel_lobby_total: 0,
    israel_lobby_breakdown: null,
    is_active: true,
    years_in_office: opts.yearsInOffice || 0,
    bio: opts.bio || `${office}, ${opts.jurisdiction || county}.`,
    term_start: opts.termStart || null,
    term_end: opts.termEnd || null,
    social_media: {},
    source_ids: {},
    data_source: 'ny-officials-seed-2026',
  };
}

// ============================================================================
// NYC CITYWIDE OFFICIALS
// ============================================================================
const nycCitywide = [
  official('New York City', 'Eric Adams', 'Mayor of New York City', 'Mayor', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'New York City', bio: 'Mayor of New York City.' }),
  official('New York City', 'Brad Lander', 'NYC Comptroller', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'New York City', bio: 'Comptroller of New York City.' }),
  official('New York City', 'Jumaane Williams', 'NYC Public Advocate', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'New York City', bio: 'Public Advocate of New York City.' }),
];

// ============================================================================
// NYC BOROUGH PRESIDENTS
// ============================================================================
const nycBoroughPresidents = [
  official('New York County', 'Mark Levine', 'Manhattan Borough President', 'County Commissioner', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Manhattan (New York County)', bio: 'Borough President of Manhattan.' }),
  official('Kings County', 'Antonio Reynoso', 'Brooklyn Borough President', 'County Commissioner', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Brooklyn (Kings County)', bio: 'Borough President of Brooklyn.' }),
  official('Queens County', 'Donovan Richards Jr.', 'Queens Borough President', 'County Commissioner', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Queens (Queens County)', bio: 'Borough President of Queens.' }),
  official('Bronx County', 'Vanessa Gibson', 'Bronx Borough President', 'County Commissioner', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Bronx (Bronx County)', bio: 'Borough President of the Bronx.' }),
  official('Richmond County', 'Vito Fossella', 'Staten Island Borough President', 'County Commissioner', 'Republican', { jurisdictionType: 'county', jurisdiction: 'Staten Island (Richmond County)', bio: 'Borough President of Staten Island.' }),
];

// ============================================================================
// NYC DISTRICT ATTORNEYS
// ============================================================================
const nycDAs = [
  official('New York County', 'Alvin Bragg', 'Manhattan District Attorney', 'State Attorney', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Manhattan (New York County)', bio: 'District Attorney for New York County (Manhattan).' }),
  official('Kings County', 'Eric Gonzalez', 'Brooklyn District Attorney', 'State Attorney', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Brooklyn (Kings County)', bio: 'District Attorney for Kings County (Brooklyn).' }),
  official('Queens County', 'Melinda Katz', 'Queens District Attorney', 'State Attorney', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Queens (Queens County)', bio: 'District Attorney for Queens County.' }),
  official('Bronx County', 'Darcel Clark', 'Bronx District Attorney', 'State Attorney', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Bronx (Bronx County)', bio: 'District Attorney for Bronx County.' }),
  official('Richmond County', 'Michael McMahon', 'Staten Island District Attorney', 'State Attorney', 'Democrat', { jurisdictionType: 'county', jurisdiction: 'Staten Island (Richmond County)', bio: 'District Attorney for Richmond County (Staten Island).' }),
];

// ============================================================================
// NYC CITY COUNCIL (51 members)
// ============================================================================
const nycCityCouncil = [
  // Manhattan
  official('New York City', 'Christopher Marte', 'NYC Council Member District 1', 'City Council', 'Democrat', { district: 'District 1', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Carlina Rivera', 'NYC Council Member District 2', 'City Council', 'Democrat', { district: 'District 2', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Erik Bottcher', 'NYC Council Member District 3', 'City Council', 'Democrat', { district: 'District 3', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Keith Powers', 'NYC Council Member District 4', 'City Council', 'Democrat', { district: 'District 4', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Julie Menin', 'NYC Council Member District 5', 'City Council', 'Democrat', { district: 'District 5', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Gale Brewer', 'NYC Council Member District 6', 'City Council', 'Democrat', { district: 'District 6', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Shaun Abreu', 'NYC Council Member District 7', 'City Council', 'Democrat', { district: 'District 7', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Upper Manhattan / Harlem
  official('New York City', 'Diana Ayala', 'NYC Council Member District 8', 'City Council', 'Democrat', { district: 'District 8', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Kristin Richardson Jordan', 'NYC Council Member District 9', 'City Council', 'Democrat', { district: 'District 9', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Carmen De La Rosa', 'NYC Council Member District 10', 'City Council', 'Democrat', { district: 'District 10', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Eric Dinowitz', 'NYC Council Member District 11', 'City Council', 'Democrat', { district: 'District 11', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Kevin Riley', 'NYC Council Member District 12', 'City Council', 'Democrat', { district: 'District 12', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Marjorie Velazquez', 'NYC Council Member District 13', 'City Council', 'Democrat', { district: 'District 13', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Bronx
  official('New York City', 'Pierina Sanchez', 'NYC Council Member District 14', 'City Council', 'Democrat', { district: 'District 14', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Oswald Feliz', 'NYC Council Member District 15', 'City Council', 'Democrat', { district: 'District 15', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Althea Stevens', 'NYC Council Member District 16', 'City Council', 'Democrat', { district: 'District 16', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Rafael Salamanca Jr.', 'NYC Council Member District 17', 'City Council', 'Democrat', { district: 'District 17', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Amanda Farias', 'NYC Council Member District 18', 'City Council', 'Democrat', { district: 'District 18', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Queens
  official('New York City', 'Vickie Paladino', 'NYC Council Member District 19', 'City Council', 'Republican', { district: 'District 19', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Sandra Ung', 'NYC Council Member District 20', 'City Council', 'Democrat', { district: 'District 20', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Francisco Moya', 'NYC Council Member District 21', 'City Council', 'Democrat', { district: 'District 21', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Tiffany Caban', 'NYC Council Member District 22', 'City Council', 'Democrat', { district: 'District 22', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Linda Lee', 'NYC Council Member District 23', 'City Council', 'Democrat', { district: 'District 23', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'James Gennaro', 'NYC Council Member District 24', 'City Council', 'Democrat', { district: 'District 24', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Shekar Krishnan', 'NYC Council Member District 25', 'City Council', 'Democrat', { district: 'District 25', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Julie Won', 'NYC Council Member District 26', 'City Council', 'Democrat', { district: 'District 26', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Nantasha Williams', 'NYC Council Member District 27', 'City Council', 'Democrat', { district: 'District 27', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Adrienne Adams', 'NYC Council Speaker / District 28', 'City Council', 'Democrat', { district: 'District 28', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Lynn Schulman', 'NYC Council Member District 29', 'City Council', 'Democrat', { district: 'District 29', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Robert Holden', 'NYC Council Member District 30', 'City Council', 'Democrat', { district: 'District 30', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Selvena Brooks-Powers', 'NYC Council Member District 31', 'City Council', 'Democrat', { district: 'District 31', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Brooklyn
  official('New York City', 'Lincoln Restler', 'NYC Council Member District 33', 'City Council', 'Democrat', { district: 'District 33', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Jennifer Gutierrez', 'NYC Council Member District 34', 'City Council', 'Democrat', { district: 'District 34', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Crystal Hudson', 'NYC Council Member District 35', 'City Council', 'Democrat', { district: 'District 35', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Chi Osse', 'NYC Council Member District 36', 'City Council', 'Democrat', { district: 'District 36', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Sandy Nurse', 'NYC Council Member District 37', 'City Council', 'Democrat', { district: 'District 37', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Alexa Aviles', 'NYC Council Member District 38', 'City Council', 'Democrat', { district: 'District 38', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Shahana Hanif', 'NYC Council Member District 39', 'City Council', 'Democrat', { district: 'District 39', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Rita Joseph', 'NYC Council Member District 40', 'City Council', 'Democrat', { district: 'District 40', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Darlene Mealy', 'NYC Council Member District 41', 'City Council', 'Democrat', { district: 'District 41', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Charles Barron', 'NYC Council Member District 42', 'City Council', 'Democrat', { district: 'District 42', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Justin Brannan', 'NYC Council Member District 43', 'City Council', 'Democrat', { district: 'District 43', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Kalman Yeger', 'NYC Council Member District 44', 'City Council', 'Democrat', { district: 'District 44', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Farah Louis', 'NYC Council Member District 45', 'City Council', 'Democrat', { district: 'District 45', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Mercedes Narcisse', 'NYC Council Member District 46', 'City Council', 'Democrat', { district: 'District 46', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Ari Kagan', 'NYC Council Member District 47', 'City Council', 'Republican', { district: 'District 47', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Staten Island / South Brooklyn
  official('New York City', 'Joseph Borelli', 'NYC Council Minority Leader / District 51', 'City Council', 'Republican', { district: 'District 51', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'David Carr', 'NYC Council Member District 50', 'City Council', 'Republican', { district: 'District 50', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Kamillah Hanks', 'NYC Council Member District 49', 'City Council', 'Democrat', { district: 'District 49', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  official('New York City', 'Steven Matteo', 'NYC Council Member District 48', 'City Council', 'Republican', { district: 'District 48', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
  // Remaining Manhattan/Bronx
  official('New York City', 'Mark Levine', 'NYC Council Member District 32', 'City Council', 'Democrat', { district: 'District 32', jurisdictionType: 'municipal', jurisdiction: 'New York City' }),
];

// ============================================================================
// SUFFOLK COUNTY
// ============================================================================
const suffolkCounty = [
  official('Suffolk County', 'Edward Romaine', 'Suffolk County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Suffolk County.' }),
  official('Suffolk County', 'Raymond Perini', 'Suffolk County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Suffolk County.' }),
  official('Suffolk County', 'Errol Toulon Jr.', 'Suffolk County Sheriff', 'Sheriff', 'Democrat', { bio: 'Sheriff of Suffolk County.' }),
  official('Suffolk County', 'Judith Pascale', 'Suffolk County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Suffolk County.' }),
  // Suffolk County Legislature (18 members)
  official('Suffolk County', 'Kevin McCaffrey', 'Suffolk County Legislator District 14, Presiding Officer', 'County Commissioner', 'Republican', { district: 'District 14' }),
  official('Suffolk County', 'Rob Calarco', 'Suffolk County Legislator District 7', 'County Commissioner', 'Democrat', { district: 'District 7' }),
  official('Suffolk County', 'Sarah Anker', 'Suffolk County Legislator District 6', 'County Commissioner', 'Democrat', { district: 'District 6' }),
  official('Suffolk County', 'Kara Hahn', 'Suffolk County Legislator District 5', 'County Commissioner', 'Democrat', { district: 'District 5' }),
  official('Suffolk County', 'Nick Caracappa', 'Suffolk County Legislator District 18', 'County Commissioner', 'Republican', { district: 'District 18' }),
  official('Suffolk County', 'Tom Donnelly', 'Suffolk County Legislator District 17', 'County Commissioner', 'Republican', { district: 'District 17' }),
  official('Suffolk County', 'Steve Flotteron', 'Suffolk County Legislator District 11', 'County Commissioner', 'Republican', { district: 'District 11' }),
  official('Suffolk County', 'Leslie Kennedy', 'Suffolk County Legislator District 12', 'County Commissioner', 'Republican', { district: 'District 12' }),
  official('Suffolk County', 'Trish Bergin', 'Suffolk County Legislator District 16', 'County Commissioner', 'Republican', { district: 'District 16' }),
  official('Suffolk County', 'Anthony Piccirillo', 'Suffolk County Legislator District 8', 'County Commissioner', 'Republican', { district: 'District 8' }),
  official('Suffolk County', 'Samuel Gonzalez', 'Suffolk County Legislator District 10', 'County Commissioner', 'Democrat', { district: 'District 10' }),
  official('Suffolk County', 'Jason Richberg', 'Suffolk County Legislator District 15', 'County Commissioner', 'Republican', { district: 'District 15' }),
  official('Suffolk County', 'Dominick Thorne', 'Suffolk County Legislator District 13', 'County Commissioner', 'Republican', { district: 'District 13' }),
  official('Suffolk County', 'Al Krupski', 'Suffolk County Legislator District 1', 'County Commissioner', 'Democrat', { district: 'District 1' }),
  official('Suffolk County', 'Bridget Fleming', 'Suffolk County Legislator District 2', 'County Commissioner', 'Democrat', { district: 'District 2' }),
  official('Suffolk County', 'Rudy Sunderman', 'Suffolk County Legislator District 3', 'County Commissioner', 'Republican', { district: 'District 3' }),
  official('Suffolk County', 'Tom Muratore', 'Suffolk County Legislator District 4', 'County Commissioner', 'Republican', { district: 'District 4' }),
  official('Suffolk County', 'Jim Mazzarella', 'Suffolk County Legislator District 9', 'County Commissioner', 'Republican', { district: 'District 9' }),
];

// ============================================================================
// NASSAU COUNTY
// ============================================================================
const nassauCounty = [
  official('Nassau County', 'Bruce Blakeman', 'Nassau County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Nassau County.' }),
  official('Nassau County', 'Anne Donnelly', 'Nassau County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Nassau County.' }),
  official('Nassau County', 'James Dzurenda', 'Nassau County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Nassau County.' }),
  official('Nassau County', 'Maureen O\'Connell', 'Nassau County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Nassau County.' }),
  // Nassau County Legislature (19 members)
  official('Nassau County', 'Kevan Abrahams', 'Nassau County Legislator District 1, Minority Leader', 'County Commissioner', 'Democrat', { district: 'District 1' }),
  official('Nassau County', 'Siela Bynoe', 'Nassau County Legislator District 2', 'County Commissioner', 'Democrat', { district: 'District 2' }),
  official('Nassau County', 'Debra Mulé', 'Nassau County Legislator District 3', 'County Commissioner', 'Democrat', { district: 'District 3' }),
  official('Nassau County', 'Denise Ford', 'Nassau County Legislator District 4', 'County Commissioner', 'Republican', { district: 'District 4' }),
  official('Nassau County', 'James Kennedy', 'Nassau County Legislator District 5', 'County Commissioner', 'Republican', { district: 'District 5' }),
  official('Nassau County', 'C. William Gaylor III', 'Nassau County Legislator District 6', 'County Commissioner', 'Republican', { district: 'District 6' }),
  official('Nassau County', 'Howard Kopel', 'Nassau County Legislator District 7, Presiding Officer', 'County Commissioner', 'Republican', { district: 'District 7' }),
  official('Nassau County', 'Vincent Muscarella', 'Nassau County Legislator District 8', 'County Commissioner', 'Republican', { district: 'District 8' }),
  official('Nassau County', 'Richard Nicolello', 'Nassau County Legislator District 9', 'County Commissioner', 'Republican', { district: 'District 9' }),
  official('Nassau County', 'Ellen Birnbaum', 'Nassau County Legislator District 10', 'County Commissioner', 'Democrat', { district: 'District 10' }),
  official('Nassau County', 'Delia DeRiggi-Whitton', 'Nassau County Legislator District 11', 'County Commissioner', 'Democrat', { district: 'District 11' }),
  official('Nassau County', 'Tom McKevitt', 'Nassau County Legislator District 12', 'County Commissioner', 'Republican', { district: 'District 12' }),
  official('Nassau County', 'Thomas Ferretti', 'Nassau County Legislator District 13', 'County Commissioner', 'Republican', { district: 'District 13' }),
  official('Nassau County', 'Laura Schaefer', 'Nassau County Legislator District 14', 'County Commissioner', 'Republican', { district: 'District 14' }),
  official('Nassau County', 'John Ferretti Jr.', 'Nassau County Legislator District 15', 'County Commissioner', 'Republican', { district: 'District 15' }),
  official('Nassau County', 'Arnold Drucker', 'Nassau County Legislator District 16', 'County Commissioner', 'Democrat', { district: 'District 16' }),
  official('Nassau County', 'Rose Marie Walker', 'Nassau County Legislator District 17', 'County Commissioner', 'Republican', { district: 'District 17' }),
  official('Nassau County', 'Joshua Lafazan', 'Nassau County Legislator District 18', 'County Commissioner', 'Democrat', { district: 'District 18' }),
  official('Nassau County', 'Steve Rhoads', 'Nassau County Legislator District 19', 'County Commissioner', 'Republican', { district: 'District 19' }),
];

// ============================================================================
// WESTCHESTER COUNTY
// ============================================================================
const westchesterCounty = [
  official('Westchester County', 'George Latimer', 'Westchester County Executive', 'County Commissioner', 'Democrat', { bio: 'County Executive of Westchester County.' }),
  official('Westchester County', 'Miriam Rocah', 'Westchester County District Attorney', 'State Attorney', 'Democrat', { bio: 'District Attorney of Westchester County.' }),
  official('Westchester County', 'Timothy Idoni', 'Westchester County Clerk', 'Clerk of Court', 'Democrat', { bio: 'County Clerk of Westchester County.' }),
  // Westchester Board of Legislators (17 districts)
  official('Westchester County', 'Catherine Borgia', 'Westchester County Legislator District 9, Chair', 'County Commissioner', 'Democrat', { district: 'District 9' }),
  official('Westchester County', 'Colin Smith', 'Westchester County Legislator District 1', 'County Commissioner', 'Democrat', { district: 'District 1' }),
  official('Westchester County', 'James Nolan', 'Westchester County Legislator District 2', 'County Commissioner', 'Republican', { district: 'District 2' }),
  official('Westchester County', 'Margaret Cunzio', 'Westchester County Legislator District 3', 'County Commissioner', 'Republican', { district: 'District 3' }),
  official('Westchester County', 'Vedat Gashi', 'Westchester County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
  official('Westchester County', 'Benjamin Boykin', 'Westchester County Legislator District 5', 'County Commissioner', 'Democrat', { district: 'District 5' }),
  official('Westchester County', 'Nancy Barr', 'Westchester County Legislator District 6', 'County Commissioner', 'Democrat', { district: 'District 6' }),
  official('Westchester County', 'MaryJane Shimsky', 'Westchester County Legislator District 12', 'County Commissioner', 'Democrat', { district: 'District 12' }),
  official('Westchester County', 'Jewel Williams Johnson', 'Westchester County Legislator District 15', 'County Commissioner', 'Democrat', { district: 'District 15' }),
  official('Westchester County', 'David Tubiolo', 'Westchester County Legislator District 14', 'County Commissioner', 'Republican', { district: 'District 14' }),
  official('Westchester County', 'Jose Alvarado', 'Westchester County Legislator District 13', 'County Commissioner', 'Democrat', { district: 'District 13' }),
  official('Westchester County', 'Tyrae Woodson-Samuels', 'Westchester County Legislator District 16', 'County Commissioner', 'Democrat', { district: 'District 16' }),
  official('Westchester County', 'Terry Clements', 'Westchester County Legislator District 11', 'County Commissioner', 'Democrat', { district: 'District 11' }),
  official('Westchester County', 'Christopher Johnson', 'Westchester County Legislator District 17', 'County Commissioner', 'Democrat', { district: 'District 17' }),
  official('Westchester County', 'Ruth Walter', 'Westchester County Legislator District 10', 'County Commissioner', 'Democrat', { district: 'District 10' }),
  official('Westchester County', 'Erika Pierce', 'Westchester County Legislator District 7', 'County Commissioner', 'Democrat', { district: 'District 7' }),
  official('Westchester County', 'David Imamura', 'Westchester County Legislator District 8', 'County Commissioner', 'Democrat', { district: 'District 8' }),
];

// ============================================================================
// ERIE COUNTY (Buffalo area)
// ============================================================================
const erieCounty = [
  official('Erie County', 'Mark Poloncarz', 'Erie County Executive', 'County Commissioner', 'Democrat', { bio: 'County Executive of Erie County.' }),
  official('Erie County', 'John Flynn', 'Erie County District Attorney', 'State Attorney', 'Democrat', { bio: 'District Attorney of Erie County.' }),
  official('Erie County', 'John Garcia', 'Erie County Sheriff', 'Sheriff', 'Democrat', { bio: 'Sheriff of Erie County.' }),
  official('Erie County', 'Michael Kearns', 'Erie County Clerk', 'Clerk of Court', 'Democrat', { bio: 'County Clerk of Erie County.' }),
  official('Erie County', 'Stefan Mychajliw Jr.', 'Erie County Comptroller', 'County Commissioner', 'Republican', { bio: 'Comptroller of Erie County.' }),
  // Erie County Legislature (11 districts)
  official('Erie County', 'April Baskin', 'Erie County Legislator District 2, Chair', 'County Commissioner', 'Democrat', { district: 'District 2' }),
  official('Erie County', 'John Gilmour', 'Erie County Legislator District 1', 'County Commissioner', 'Republican', { district: 'District 1' }),
  official('Erie County', 'Lisa Chimera', 'Erie County Legislator District 3', 'County Commissioner', 'Democrat', { district: 'District 3' }),
  official('Erie County', 'Howard Johnson', 'Erie County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
  official('Erie County', 'Frank Todaro', 'Erie County Legislator District 5', 'County Commissioner', 'Republican', { district: 'District 5' }),
  official('Erie County', 'John Mills', 'Erie County Legislator District 6', 'County Commissioner', 'Republican', { district: 'District 6' }),
  official('Erie County', 'Tim Meyers', 'Erie County Legislator District 7', 'County Commissioner', 'Republican', { district: 'District 7' }),
  official('Erie County', 'Joseph Lorigo', 'Erie County Legislator District 8', 'County Commissioner', 'Republican', { district: 'District 8' }),
  official('Erie County', 'Edward Rath III', 'Erie County Legislator District 9', 'County Commissioner', 'Republican', { district: 'District 9' }),
  official('Erie County', 'Jeanne Vinal', 'Erie County Legislator District 10', 'County Commissioner', 'Democrat', { district: 'District 10' }),
  official('Erie County', 'John Bruso', 'Erie County Legislator District 11', 'County Commissioner', 'Republican', { district: 'District 11' }),
];

// ============================================================================
// MONROE COUNTY (Rochester area)
// ============================================================================
const monroeCounty = [
  official('Monroe County', 'Adam Bello', 'Monroe County Executive', 'County Commissioner', 'Democrat', { bio: 'County Executive of Monroe County.' }),
  official('Monroe County', 'Sandra Doorley', 'Monroe County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Monroe County.' }),
  official('Monroe County', 'Todd Baxter', 'Monroe County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Monroe County.' }),
  official('Monroe County', 'Jamie Romeo', 'Monroe County Clerk', 'Clerk of Court', 'Democrat', { bio: 'County Clerk of Monroe County.' }),
  // Monroe County Legislature (29 districts)
  official('Monroe County', 'Sabrina LaMar', 'Monroe County Legislator District 21, President', 'County Commissioner', 'Democrat', { district: 'District 21' }),
  official('Monroe County', 'Ernest Flagler-Mitchell', 'Monroe County Legislator District 22', 'County Commissioner', 'Democrat', { district: 'District 22' }),
  official('Monroe County', 'Yversha Roman', 'Monroe County Legislator District 23', 'County Commissioner', 'Democrat', { district: 'District 23' }),
  official('Monroe County', 'Vincent Felder', 'Monroe County Legislator District 24', 'County Commissioner', 'Democrat', { district: 'District 24' }),
  official('Monroe County', 'Mercedes Rowe', 'Monroe County Legislator District 25', 'County Commissioner', 'Democrat', { district: 'District 25' }),
  official('Monroe County', 'Rachel Barnhart', 'Monroe County Legislator District 26', 'County Commissioner', 'Democrat', { district: 'District 26' }),
  official('Monroe County', 'Howard Maffucci', 'Monroe County Legislator District 1', 'County Commissioner', 'Republican', { district: 'District 1' }),
  official('Monroe County', 'Steve Brew', 'Monroe County Legislator District 2', 'County Commissioner', 'Republican', { district: 'District 2' }),
  official('Monroe County', 'Brian Marianetti', 'Monroe County Legislator District 3', 'County Commissioner', 'Republican', { district: 'District 3' }),
  official('Monroe County', 'George Hebert', 'Monroe County Legislator District 4', 'County Commissioner', 'Republican', { district: 'District 4' }),
  official('Monroe County', 'Frank & Alletto', 'Monroe County Legislator District 5', 'County Commissioner', 'Republican', { district: 'District 5' }),
];

// ============================================================================
// ONONDAGA COUNTY (Syracuse area)
// ============================================================================
const onondagaCounty = [
  official('Onondaga County', 'J. Ryan McMahon II', 'Onondaga County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Onondaga County.' }),
  official('Onondaga County', 'William Fitzpatrick', 'Onondaga County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Onondaga County.' }),
  official('Onondaga County', 'Toby Shelley', 'Onondaga County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Onondaga County.' }),
  official('Onondaga County', 'Sandy Schepp', 'Onondaga County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Onondaga County.' }),
  official('Onondaga County', 'Martin Masterpole', 'Onondaga County Comptroller', 'County Commissioner', 'Democrat', { bio: 'Comptroller of Onondaga County.' }),
  // Onondaga County Legislature (17 districts)
  official('Onondaga County', 'David Knapp', 'Onondaga County Legislator District 12, Chair', 'County Commissioner', 'Republican', { district: 'District 12' }),
  official('Onondaga County', 'Mark Stanczyk', 'Onondaga County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
  official('Onondaga County', 'Chris Ryan', 'Onondaga County Legislator District 6', 'County Commissioner', 'Republican', { district: 'District 6' }),
  official('Onondaga County', 'Peggy Chase', 'Onondaga County Legislator District 15', 'County Commissioner', 'Democrat', { district: 'District 15' }),
  official('Onondaga County', 'Bill Kinne', 'Onondaga County Legislator District 9', 'County Commissioner', 'Republican', { district: 'District 9' }),
  official('Onondaga County', 'Mary Kuhn', 'Onondaga County Legislator District 16', 'County Commissioner', 'Democrat', { district: 'District 16' }),
  official('Onondaga County', 'Tim Burtis', 'Onondaga County Legislator District 7', 'County Commissioner', 'Republican', { district: 'District 7' }),
  official('Onondaga County', 'Debra Cody', 'Onondaga County Legislator District 3', 'County Commissioner', 'Democrat', { district: 'District 3' }),
  official('Onondaga County', 'Linda Ervin', 'Onondaga County Legislator District 5', 'County Commissioner', 'Democrat', { district: 'District 5' }),
];

// ============================================================================
// ALBANY COUNTY
// ============================================================================
const albanyCounty = [
  official('Albany County', 'Daniel McCoy', 'Albany County Executive', 'County Commissioner', 'Democrat', { bio: 'County Executive of Albany County.' }),
  official('Albany County', 'P. David Soares', 'Albany County District Attorney', 'State Attorney', 'Democrat', { bio: 'District Attorney of Albany County.' }),
  official('Albany County', 'Craig Apple', 'Albany County Sheriff', 'Sheriff', 'Democrat', { bio: 'Sheriff of Albany County.' }),
  official('Albany County', 'Bruce Hidley', 'Albany County Clerk', 'Clerk of Court', 'Democrat', { bio: 'County Clerk of Albany County.' }),
  official('Albany County', 'Susan Rizzo', 'Albany County Comptroller', 'County Commissioner', 'Democrat', { bio: 'Comptroller of Albany County.' }),
  // Albany County Legislature (key members)
  official('Albany County', 'Andrew Joyce', 'Albany County Legislature Chair', 'County Commissioner', 'Democrat', { bio: 'Chair of the Albany County Legislature.' }),
  official('Albany County', 'Wanda Willingham', 'Albany County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
  official('Albany County', 'Samuel Fein', 'Albany County Legislator District 6', 'County Commissioner', 'Democrat', { district: 'District 6' }),
  official('Albany County', 'Dennis Feeney', 'Albany County Legislator District 10', 'County Commissioner', 'Democrat', { district: 'District 10' }),
  official('Albany County', 'Mark Grimm', 'Albany County Legislator District 29', 'County Commissioner', 'Republican', { district: 'District 29' }),
];

// ============================================================================
// ROCKLAND COUNTY
// ============================================================================
const rocklandCounty = [
  official('Rockland County', 'Ed Day', 'Rockland County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Rockland County.' }),
  official('Rockland County', 'Thomas Walsh', 'Rockland County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Rockland County.' }),
  official('Rockland County', 'Louis Falco III', 'Rockland County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Rockland County.' }),
  official('Rockland County', 'Paul Piperato', 'Rockland County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Rockland County.' }),
  // Rockland County Legislature (17 districts)
  official('Rockland County', 'Jay Hood Jr.', 'Rockland County Legislator District 1', 'County Commissioner', 'Democrat', { district: 'District 1' }),
  official('Rockland County', 'Harriet Cornell', 'Rockland County Legislator District 11, Chair', 'County Commissioner', 'Democrat', { district: 'District 11' }),
  official('Rockland County', 'Philip Soskin', 'Rockland County Legislator District 2', 'County Commissioner', 'Republican', { district: 'District 2' }),
  official('Rockland County', 'Charles Falciglia', 'Rockland County Legislator District 3', 'County Commissioner', 'Republican', { district: 'District 3' }),
  official('Rockland County', 'Aney Paul', 'Rockland County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
  official('Rockland County', 'Itamar Yeger', 'Rockland County Legislator District 5', 'County Commissioner', 'Republican', { district: 'District 5' }),
  official('Rockland County', 'Aron Wieder', 'Rockland County Legislator District 12', 'County Commissioner', 'Democrat', { district: 'District 12' }),
];

// ============================================================================
// ORANGE COUNTY (NY)
// ============================================================================
const orangeCountyNY = [
  official('Orange County NY', 'Steve Neuhaus', 'Orange County Executive', 'County Commissioner', 'Republican', { jurisdiction: 'Orange County', bio: 'County Executive of Orange County, NY.' }),
  official('Orange County NY', 'David Hoovler', 'Orange County District Attorney', 'State Attorney', 'Republican', { jurisdiction: 'Orange County', bio: 'District Attorney of Orange County, NY.' }),
  official('Orange County NY', 'Carl DuBois', 'Orange County Sheriff', 'Sheriff', 'Republican', { jurisdiction: 'Orange County', bio: 'Sheriff of Orange County, NY.' }),
  official('Orange County NY', 'Kelly Becker', 'Orange County Clerk', 'Clerk of Court', 'Republican', { jurisdiction: 'Orange County', bio: 'County Clerk of Orange County, NY.' }),
  // Orange County Legislature (key members)
  official('Orange County NY', 'Katie Bonelli', 'Orange County Legislature Chair', 'County Commissioner', 'Republican', { jurisdiction: 'Orange County', bio: 'Chair of the Orange County Legislature.' }),
  official('Orange County NY', 'Paul Ruszkiewicz', 'Orange County Legislator District 1', 'County Commissioner', 'Republican', { jurisdiction: 'Orange County', district: 'District 1' }),
  official('Orange County NY', 'James O\'Donnell', 'Orange County Legislator District 4', 'County Commissioner', 'Republican', { jurisdiction: 'Orange County', district: 'District 4' }),
  official('Orange County NY', 'Barry Cheney', 'Orange County Legislator District 10', 'County Commissioner', 'Republican', { jurisdiction: 'Orange County', district: 'District 10' }),
  official('Orange County NY', 'Kevindaryan Lujan', 'Orange County Legislator District 2', 'County Commissioner', 'Democrat', { jurisdiction: 'Orange County', district: 'District 2' }),
];

// ============================================================================
// DUTCHESS COUNTY
// ============================================================================
const dutchessCounty = [
  official('Dutchess County', 'Sue Serino', 'Dutchess County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Dutchess County.' }),
  official('Dutchess County', 'William Grady', 'Dutchess County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Dutchess County.' }),
  official('Dutchess County', 'Kirk Imperati', 'Dutchess County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Dutchess County.' }),
  official('Dutchess County', 'Bradford Kendall', 'Dutchess County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Dutchess County.' }),
  official('Dutchess County', 'Robin Lois', 'Dutchess County Comptroller', 'County Commissioner', 'Democrat', { bio: 'Comptroller of Dutchess County.' }),
  // Dutchess County Legislature (key members)
  official('Dutchess County', 'Gregg Pulver', 'Dutchess County Legislature Chair', 'County Commissioner', 'Republican', { bio: 'Chair of the Dutchess County Legislature.' }),
  official('Dutchess County', 'Barrington Atkins', 'Dutchess County Legislator District 3', 'County Commissioner', 'Democrat', { district: 'District 3' }),
  official('Dutchess County', 'Nick Page', 'Dutchess County Legislator District 15', 'County Commissioner', 'Democrat', { district: 'District 15' }),
  official('Dutchess County', 'Yvette Valdés Smith', 'Dutchess County Legislator District 4', 'County Commissioner', 'Democrat', { district: 'District 4' }),
];

// ============================================================================
// SARATOGA COUNTY
// ============================================================================
const saratogaCounty = [
  official('Saratoga County', 'Theodore Kusnierz Jr.', 'Saratoga County Board of Supervisors Chair', 'County Commissioner', 'Republican', { bio: 'Chair of the Saratoga County Board of Supervisors.' }),
  official('Saratoga County', 'Karen Heggen', 'Saratoga County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Saratoga County.' }),
  official('Saratoga County', 'Michael Zurlo', 'Saratoga County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Saratoga County.' }),
  official('Saratoga County', 'Craig Hayner', 'Saratoga County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Saratoga County.' }),
  official('Saratoga County', 'Therese Connolly', 'Saratoga County Treasurer', 'County Commissioner', 'Republican', { bio: 'Treasurer of Saratoga County.' }),
];

// ============================================================================
// ONEIDA COUNTY
// ============================================================================
const oneidaCounty = [
  official('Oneida County', 'Anthony Picente Jr.', 'Oneida County Executive', 'County Commissioner', 'Republican', { bio: 'County Executive of Oneida County.' }),
  official('Oneida County', 'Scott McNamara', 'Oneida County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Oneida County.' }),
  official('Oneida County', 'Robert Maciol', 'Oneida County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Oneida County.' }),
  official('Oneida County', 'Sandra DePerno', 'Oneida County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Oneida County.' }),
  // Oneida County Legislature (key members)
  official('Oneida County', 'Philip Sacco', 'Oneida County Legislature Chair', 'County Commissioner', 'Republican', { bio: 'Chair of the Oneida County Board of Legislators.' }),
];

// ============================================================================
// BROOME COUNTY
// ============================================================================
const broomeCounty = [
  official('Broome County', 'Jason Garnar', 'Broome County Executive', 'County Commissioner', 'Democrat', { bio: 'County Executive of Broome County.' }),
  official('Broome County', 'Paul Battisti', 'Broome County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Broome County.' }),
  official('Broome County', 'Fred Akshar', 'Broome County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Broome County.' }),
  official('Broome County', 'Daniel Reynolds', 'Broome County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Broome County.' }),
  // Broome County Legislature (key members)
  official('Broome County', 'Daniel Livingston', 'Broome County Legislature Chair', 'County Commissioner', 'Republican', { bio: 'Chair of the Broome County Legislature.' }),
  official('Broome County', 'Robert Weslar', 'Broome County Legislator District 1', 'County Commissioner', 'Republican', { district: 'District 1' }),
  official('Broome County', 'Kim Myers', 'Broome County Legislator District 13', 'County Commissioner', 'Democrat', { district: 'District 13' }),
];

// ============================================================================
// NIAGARA COUNTY
// ============================================================================
const niagaraCounty = [
  official('Niagara County', 'Rebecca Wydysh', 'Niagara County Legislature Chair', 'County Commissioner', 'Republican', { bio: 'Chair of the Niagara County Legislature.' }),
  official('Niagara County', 'Brian Seaman', 'Niagara County Manager', 'County Commissioner', 'Nonpartisan', { bio: 'County Manager of Niagara County.' }),
  official('Niagara County', 'Caroline Wojtaszek', 'Niagara County District Attorney', 'State Attorney', 'Republican', { bio: 'District Attorney of Niagara County.' }),
  official('Niagara County', 'Michael Filicetti', 'Niagara County Sheriff', 'Sheriff', 'Republican', { bio: 'Sheriff of Niagara County.' }),
  official('Niagara County', 'Joseph Jastrzemski', 'Niagara County Clerk', 'Clerk of Court', 'Republican', { bio: 'County Clerk of Niagara County.' }),
  // Legislature key members
  official('Niagara County', 'Owen Steed', 'Niagara County Legislator District 1', 'County Commissioner', 'Democrat', { district: 'District 1' }),
  official('Niagara County', 'Jesse Gooch', 'Niagara County Legislator District 4', 'County Commissioner', 'Republican', { district: 'District 4' }),
  official('Niagara County', 'David Godfrey', 'Niagara County Legislator District 9', 'County Commissioner', 'Republican', { district: 'District 9' }),
];

// ============================================================================
// SCHENECTADY COUNTY
// ============================================================================
const schenectadyCounty = [
  official('Schenectady County', 'Anthony Jasenski', 'Schenectady County Legislature Chair', 'County Commissioner', 'Democrat', { bio: 'Chair of the Schenectady County Legislature.' }),
  official('Schenectady County', 'Robert Carney', 'Schenectady County Manager', 'County Commissioner', 'Nonpartisan', { bio: 'County Manager of Schenectady County.' }),
  official('Schenectady County', 'Robert Carney', 'Schenectady County District Attorney', 'State Attorney', 'Democrat', { bio: 'District Attorney of Schenectady County.' }),
  official('Schenectady County', 'Dominic Dagostino', 'Schenectady County Sheriff', 'Sheriff', 'Democrat', { bio: 'Sheriff of Schenectady County.' }),
  official('Schenectady County', 'John Woodward', 'Schenectady County Clerk', 'Clerk of Court', 'Democrat', { bio: 'County Clerk of Schenectady County.' }),
];

// ============================================================================
// MAJOR CITIES
// ============================================================================

// City of Buffalo
const buffaloCity = [
  official('City of Buffalo', 'Byron Brown', 'Mayor of Buffalo', 'Mayor', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', bio: 'Mayor of the City of Buffalo.' }),
  official('City of Buffalo', 'Zeneta Everhart', 'Buffalo Common Council President', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo' }),
  official('City of Buffalo', 'Mitchell Nowakowski', 'Buffalo Council Member Fillmore District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'Fillmore District' }),
  official('City of Buffalo', 'Bryan Bollman', 'Buffalo Council Member North District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'North District' }),
  official('City of Buffalo', 'Rasheed Wyatt', 'Buffalo Council Member University District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'University District' }),
  official('City of Buffalo', 'Leah Halton-Pope', 'Buffalo Council Member Ellicott District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'Ellicott District' }),
  official('City of Buffalo', 'Joseph Golombek Jr.', 'Buffalo Council Member Delaware District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'Delaware District' }),
  official('City of Buffalo', 'Christopher Scanlon', 'Buffalo Council Member South District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'South District' }),
  official('City of Buffalo', 'Mitch Colvin', 'Buffalo Council Member Lovejoy District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'Lovejoy District' }),
  official('City of Buffalo', 'Ulysees Wingo Sr.', 'Buffalo Council Member Masten District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Buffalo', district: 'Masten District' }),
];

// City of Rochester
const rochesterCity = [
  official('City of Rochester', 'Malik Evans', 'Mayor of Rochester', 'Mayor', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester', bio: 'Mayor of the City of Rochester.' }),
  official('City of Rochester', 'Miguel Melendez Jr.', 'Rochester City Council President', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester' }),
  official('City of Rochester', 'Mary Lupien', 'Rochester City Council, East District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester', district: 'East District' }),
  official('City of Rochester', 'Willie Lightfoot', 'Rochester City Council, At-Large', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester', district: 'At-Large' }),
  official('City of Rochester', 'Stanley Martin', 'Rochester City Council, South District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester', district: 'South District' }),
  official('City of Rochester', 'Kim Smith', 'Rochester City Council, Northwest District', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Rochester', district: 'Northwest District' }),
];

// City of Syracuse
const syracuseCity = [
  official('City of Syracuse', 'Ben Walsh', 'Mayor of Syracuse', 'Mayor', 'Independent', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', bio: 'Mayor of the City of Syracuse.' }),
  official('City of Syracuse', 'Khalid Bey', 'Syracuse Common Council President', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse' }),
  official('City of Syracuse', 'Rasheada Caldwell', 'Syracuse Council Member District 1', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', district: 'District 1' }),
  official('City of Syracuse', 'Pat Hogan', 'Syracuse Council Member District 2', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', district: 'District 2' }),
  official('City of Syracuse', 'Chol Majok', 'Syracuse Council Member District 3', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', district: 'District 3' }),
  official('City of Syracuse', 'Latoya Allen', 'Syracuse Council Member District 4', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', district: 'District 4' }),
  official('City of Syracuse', 'Joe Driscoll', 'Syracuse Council Member District 5', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Syracuse', district: 'District 5' }),
];

// City of Albany
const albanyCity = [
  official('City of Albany', 'Kathy Sheehan', 'Mayor of Albany', 'Mayor', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany', bio: 'Mayor of the City of Albany.' }),
  official('City of Albany', 'Corey Ellis', 'Albany Common Council President', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany' }),
  official('City of Albany', 'Alfredo Balarin', 'Albany Council Member Ward 1', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany', district: 'Ward 1' }),
  official('City of Albany', 'Derek Johnson', 'Albany Council Member Ward 3', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany', district: 'Ward 3' }),
  official('City of Albany', 'Sonia Frederick', 'Albany Council Member Ward 6', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany', district: 'Ward 6' }),
  official('City of Albany', 'Tom Hoey', 'Albany Council Member Ward 11', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Albany', district: 'Ward 11' }),
];

// City of Yonkers
const yonkersCity = [
  official('City of Yonkers', 'Mike Spano', 'Mayor of Yonkers', 'Mayor', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', bio: 'Mayor of the City of Yonkers.' }),
  official('City of Yonkers', 'Lakisha Collins-Bellamy', 'Yonkers City Council President', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers' }),
  official('City of Yonkers', 'Tasha Diaz', 'Yonkers Council Member District 1', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', district: 'District 1' }),
  official('City of Yonkers', 'Anthony Merante', 'Yonkers Council Member District 2', 'City Council', 'Republican', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', district: 'District 2' }),
  official('City of Yonkers', 'John Rubbo', 'Yonkers Council Member District 5', 'City Council', 'Republican', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', district: 'District 5' }),
  official('City of Yonkers', 'Corazon Pineda-Isaac', 'Yonkers Council Member District 4', 'City Council', 'Democrat', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', district: 'District 4' }),
  official('City of Yonkers', 'Mike Breen', 'Yonkers Council Member District 6', 'City Council', 'Republican', { jurisdictionType: 'municipal', jurisdiction: 'City of Yonkers', district: 'District 6' }),
];

// ============================================================================
// COMBINE ALL & INSERT
// ============================================================================
async function main() {
  const groups = {
    'NYC Citywide': nycCitywide,
    'NYC Borough Presidents': nycBoroughPresidents,
    'NYC District Attorneys': nycDAs,
    'NYC City Council': nycCityCouncil,
    'Suffolk County': suffolkCounty,
    'Nassau County': nassauCounty,
    'Westchester County': westchesterCounty,
    'Erie County': erieCounty,
    'Monroe County': monroeCounty,
    'Onondaga County': onondagaCounty,
    'Albany County': albanyCounty,
    'Rockland County': rocklandCounty,
    'Orange County NY': orangeCountyNY,
    'Dutchess County': dutchessCounty,
    'Saratoga County': saratogaCounty,
    'Oneida County': oneidaCounty,
    'Broome County': broomeCounty,
    'Niagara County': niagaraCounty,
    'Schenectady County': schenectadyCounty,
    'City of Buffalo': buffaloCity,
    'City of Rochester': rochesterCity,
    'City of Syracuse': syracuseCity,
    'City of Albany': albanyCity,
    'City of Yonkers': yonkersCity,
  };

  let grandTotal = 0;
  let grandSuccess = 0;
  let grandErrors = 0;

  for (const [groupName, officials] of Object.entries(groups)) {
    console.log(`\n--- ${groupName} (${officials.length} officials) ---`);

    // Deduplicate by bioguide_id within each group
    const seen = new Set();
    const deduped = officials.filter(o => {
      if (seen.has(o.bioguide_id)) {
        console.log(`  SKIP duplicate: ${o.bioguide_id}`);
        return false;
      }
      seen.add(o.bioguide_id);
      return true;
    });

    // Upsert in batches of 50
    const BATCH = 50;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const batch = deduped.slice(i, i + BATCH);
      const { error } = await sb
        .from('politicians')
        .upsert(batch, { onConflict: 'bioguide_id' });

      if (error) {
        console.error(`  ERROR batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        grandErrors += batch.length;
      } else {
        console.log(`  Batch ${Math.floor(i / BATCH) + 1}: ${batch.length} upserted`);
        grandSuccess += batch.length;
      }
    }

    grandTotal += deduped.length;
  }

  console.log('\n========================================');
  console.log(`TOTAL officials processed: ${grandTotal}`);
  console.log(`Successfully upserted:    ${grandSuccess}`);
  console.log(`Errors:                   ${grandErrors}`);
  console.log('========================================');

  // Verify NY count
  const { count, error: countErr } = await sb
    .from('politicians')
    .select('*', { count: 'exact', head: true })
    .like('bioguide_id', 'ny-%');

  if (!countErr) {
    console.log(`\nNY officials in database: ${count}`);
  }

  // Overall count
  const { count: totalCount, error: totalErr } = await sb
    .from('politicians')
    .select('*', { count: 'exact', head: true });

  if (!totalErr) {
    console.log(`Total politicians in database: ${totalCount}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
